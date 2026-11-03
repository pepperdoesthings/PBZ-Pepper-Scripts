"use strict";
// Diagnostic only (experimental branch). Finds the mob groups that give an item when they are cleared
// (a group script such as MobGroupScript_AddItemAfterCombat or KillLoot), says when the player comes
// near one, and after one is cleared reports which items arrived. Clearing a group whose reward the
// game already recorded shows whether the game gives the reward again. It reads and reports; it never
// changes anything in the game.
Object.defineProperty(exports, "__esModule", { value: true });

const REWARD_SCRIPT = /AfterCombat|KillLoot/;
const NEAR_CM = 5000;
const WINDOW_MS = 10000;
const RESCAN_MS = 15000;

function errText(e) {
    return e && e.message ? String(e.message) : String(e);
}

// Values of a TArray or TSet, or { key, value } pairs of a TMap.
function entries(c) {
    const out = [];
    if (!c || typeof c.Num !== "function")
        return out;
    if (typeof c.GetMaxIndex !== "function") {
        for (let i = 0; i < c.Num(); i++)
            out.push(c.Get(i));
        return out;
    }
    for (let i = 0; i < c.GetMaxIndex(); i++) {
        if (!c.IsValidIndex(i))
            continue;
        if (typeof c.GetKey === "function") {
            const k = c.GetKey(i);
            out.push({ key: k, value: c.Get(k) });
        }
        else
            out.push(c.Get(i));
    }
    return out;
}

function lastPart(text) {
    const s = String(text || "");
    return s.slice(s.lastIndexOf(".") + 1);
}

function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function itemsText(items) {
    return items.map((i) => i.id + " x" + i.num).join(", ");
}

// deps: UE, puerts, tsHelper, game (from createGame), clock, spawnersNow(ctx) (the loaded spawners),
// log(text), show(ctx, text) (an on-screen line).
function createRewardWatch(deps) {
    const { UE, puerts, tsHelper, game, log } = deps;
    const clock = deps.clock || (() => Date.now());
    const show = deps.show || (() => { });
    let ctx;
    let groups = new Map();
    let near = new Set();
    let windows = [];
    let lastScan = 0;
    let itemSource;
    let itemHandler;

    // The rewards the game has recorded as given ("<domain>+<script>").
    function given() {
        try {
            const sys = tsHelper.getWorldSubsystem(ctx, UE.PBZGameSystem.StaticClass());
            return new Set(entries(sys.CompleteAddItemMobDomainNames).map((e) => String(e)));
        }
        catch (e) {
            log("could not read the given rewards: " + errText(e));
            return new Set();
        }
    }

    function status(g, done) {
        return done.has(g.key) ? "given before" : "not given yet";
    }

    function domainActors() {
        const ref = puerts.$ref(UE.NewArray(UE.Actor));
        UE.GameplayStatics.GetAllActorsOfClass(ctx, UE.Actor.StaticClass(), ref);
        const all = puerts.$unref(ref);
        const out = [];
        for (let i = 0; all && i < all.Num(); i++) {
            const a = all.Get(i);
            try {
                if (game.isAlive(a) && /MobDomain/.test(a.GetClass().GetName()))
                    out.push(a);
            }
            catch (e) {
                continue;
            }
        }
        return out;
    }

    // Where a group's enemies stand: the loaded member spawners, or the domain actor when none is loaded.
    function placesOf(g) {
        const loaded = deps.spawnersNow(ctx).filter((s) => g.members.includes(s.GetName())).map((s) => game.location(s));
        return loaded.length ? loaded : [g.domainPos];
    }

    function where(g) {
        const p = placesOf(g)[0];
        return [p.x, p.y, p.z].map((n) => String(Math.round(n))).join(" ");
    }

    // Reads the reward groups of the loaded domains. Returns the ones not seen before.
    function scan() {
        lastScan = clock();
        const found = [];
        let actors;
        try {
            actors = domainActors();
        }
        catch (e) {
            log("could not list the mob domains: " + errText(e));
            return found;
        }
        for (const domain of actors) {
            const domainName = domain.GetName();
            try {
                for (const e of entries(domain.MobDomainConfig.MobGroups)) {
                    const group = e && e.value;
                    if (!group)
                        continue;
                    const script = entries(group.Scripts).find((s) => s && REWARD_SCRIPT.test(s.GetClass().GetName()));
                    if (!script)
                        continue;
                    const id = domainName + "|" + String(e.key);
                    if (groups.has(id))
                        continue;
                    const members = entries(group.Members).map((m) => lastPart(UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(m)));
                    const g = { id, script: script.GetName(), key: domainName + "+" + script.GetName(), members,
                        killed: new Set(), domainPos: game.location(domain) };
                    groups.set(id, g);
                    found.push(g);
                }
            }
            catch (e) {
                log("could not read the groups of " + domainName + ": " + errText(e));
            }
        }
        return found;
    }

    function describe(list, done) {
        for (const g of list)
            log("group " + g.id + " (" + g.script + ") at " + where(g) + ", " + status(g, done) + ", enemies " + g.members.join(", "));
    }

    function onItem(propID, isAdd, num) {
        try {
            if (!isAdd)
                return;
            for (const w of windows)
                w.items.push({ id: String(propID), num: Number(num) });
        }
        catch (e) {
            // never let a report break the game's own broadcast
        }
    }

    function listen() {
        try {
            const sub = tsHelper.getWorldSubsystem(ctx, UE.PBZBackPackSubsystem.StaticClass());
            itemHandler = (propID, isAdd, num) => onItem(propID, isAdd, num);
            sub.UpdateProps.Add(itemHandler);
            itemSource = sub.UpdateProps;
        }
        catch (e) {
            itemHandler = undefined;
            log("could not listen to item gains: " + errText(e));
        }
    }

    function unlisten() {
        try {
            if (itemSource && itemHandler)
                itemSource.Remove(itemHandler);
        }
        catch (e) {
            // the backpack is gone with its level
        }
        itemSource = undefined;
        itemHandler = undefined;
    }

    function stop() {
        unlisten();
        groups = new Map();
        near = new Set();
        windows = [];
    }

    // Remembers each group's status as of now. The game records a reward the moment the last enemy
    // dies, which can be before the kill watch reports that kill, so a clear is judged by the status
    // from the look before it, never by the list at the time the kill is seen.
    function remember(done) {
        for (const g of groups.values())
            g.wasGiven = done.has(g.key);
    }

    function ready(player) {
        stop();
        ctx = player;
        const found = scan();
        const done = given();
        remember(done);
        const open = found.filter((g) => !done.has(g.key)).length;
        log(found.length + " reward group(s) found, " + open + " not given yet");
        describe(found, done);
        if (found.length > 0)
            show(ctx, "EP: " + found.length + " reward group(s) here, " + open + " not given yet");
        listen();
    }

    function finish(w) {
        const done = given();
        const items = w.items.length ? "items in 10 s: " + itemsText(w.items) : "no item in 10 s";
        if (!w.wasGiven) {
            log("result " + w.g.id + ": first clear, reward " + (done.has(w.g.key) ? "recorded" : "not recorded") + ", " + items);
            show(ctx, "EP: reward group cleared (first time): " + (w.items.length ? itemsText(w.items) : "no item"));
        }
        else if (w.items.length) {
            log("result " + w.g.id + ": cleared again, " + items + " (reward given again?)");
            show(ctx, "EP: reward group cleared again: " + itemsText(w.items) + " (given again?)");
        }
        else {
            log("result " + w.g.id + ": cleared again, no item in 10 s (the game did not repeat the reward)");
            show(ctx, "EP: reward group cleared again: no item");
        }
    }

    function tick(player) {
        ctx = player;
        const now = clock();
        if (now - lastScan >= RESCAN_MS) {
            const found = scan();
            if (found.length)
                describe(found, given());
        }
        if (groups.size)
            remember(given());
        checkNear(player);
        // The game's tip shows one line at a time, so a clear result goes out last and is not covered.
        const due = windows.filter((w) => now - w.at >= WINDOW_MS);
        windows = windows.filter((w) => now - w.at < WINDOW_MS);
        due.forEach(finish);
    }

    function checkNear(player) {
        const fresh = [...groups.values()].filter((g) => !near.has(g.id));
        if (!fresh.length)
            return;
        const at = game.location(player);
        const done = given();
        for (const g of fresh) {
            const d = Math.min(...placesOf(g).map((p) => distance(at, p)));
            if (d > NEAR_CM)
                continue;
            near.add(g.id);
            log("nearby: " + g.id + ", " + Math.round(d / 100) + " m, " + status(g, done));
            show(ctx, "EP: reward group nearby (" + status(g, done) + "), " + g.members.length + " enemies");
        }
    }

    function kill(name) {
        const mine = [...groups.values()].filter((g) => g.members.includes(name));
        if (!mine.length)
            return;
        for (const g of mine) {
            const was = g.wasGiven ? "given before" : "not given yet";
            g.killed.add(name);
            const left = g.members.filter((m) => !g.killed.has(m)).length;
            if (left > 0) {
                log("kill " + name + " in reward group " + g.id + " (" + was + "), " + left + " of " + g.members.length + " left");
                continue;
            }
            g.killed = new Set();
            log("cleared " + g.id + " (" + was + "), watching items for 10 s");
            windows.push({ g, at: clock(), wasGiven: !!g.wasGiven, items: [] });
        }
    }

    // A death: the enemies come back, so kills start over and the nearby messages can come again.
    function death() {
        for (const g of groups.values())
            g.killed = new Set();
        near = new Set();
    }

    return { ready, tick, kill, death, stop };
}

exports.createRewardWatch = createRewardWatch;
