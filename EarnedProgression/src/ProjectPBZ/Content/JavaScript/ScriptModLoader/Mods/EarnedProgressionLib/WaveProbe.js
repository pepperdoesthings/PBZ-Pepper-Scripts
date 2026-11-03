"use strict";
// Diagnostic only (experimental branch). Logs how the game groups enemies into mob domains and mob
// groups, and how those groups change during a fight, so wave events can be recognised. It reads and
// logs; it never changes anything in the game. Every entry point catches its own errors.
Object.defineProperty(exports, "__esModule", { value: true });

const POLL_MS = 1000;
const MAX_MEMBERS = 40;

function errText(e) {
    return e && e.message ? String(e.message) : String(e);
}

function createWaveProbe(deps) {
    const { UE, puerts, tsHelper, game, spawners, timers, log } = deps;
    const clock = deps.clock || (() => Date.now());
    const dumped = new Set();
    let ctx;
    let itemSource;
    let itemHandler;
    let lastKill;
    let seenRewards = new Set();
    let domains = new Map();
    let watched = new Map();
    let bound = [];
    let poll;
    let lastComplete;

    function quiet(fn, fallback) {
        try {
            return fn();
        }
        catch (e) {
            return fallback;
        }
    }

    function guard(label, fn) {
        try {
            return fn();
        }
        catch (e) {
            log(label + " failed: " + errText(e));
            return undefined;
        }
    }

    function nameOf(obj) {
        return quiet(() => (game.isAlive(obj) ? obj.GetName() : "none"), "?");
    }

    function classOf(obj) {
        return quiet(() => obj.GetClass().GetName(), "?");
    }

    function text(v) {
        if (v === undefined || v === null)
            return String(v);
        if (typeof v !== "object")
            return String(v);
        if (typeof v.GetName === "function")
            return nameOf(v);
        return quiet(() => v.toString(), "?");
    }

    // Names a reflected object offers to scripts, from its own class down to (not including) Actor/Object.
    function members(obj) {
        const stop = new Set([UE.Actor, UE.Object, UE.ActorComponent].map((c) => quiet(() => c.prototype)).filter(Boolean));
        stop.add(Object.prototype);
        const out = new Set();
        for (const n of quiet(() => Object.getOwnPropertyNames(obj), [])) {
            if (!n.startsWith("_"))
                out.add(n);
        }
        let p = quiet(() => Object.getPrototypeOf(obj), null);
        for (let depth = 0; p && !stop.has(p) && depth < 16; depth++) {
            for (const n of quiet(() => Object.getOwnPropertyNames(p), [])) {
                if (n !== "constructor" && !n.startsWith("__"))
                    out.add(n);
            }
            p = quiet(() => Object.getPrototypeOf(p), null);
        }
        return [...out].sort();
    }

    function dumpClass(obj, label) {
        const cls = classOf(obj);
        if (dumped.has(cls))
            return;
        dumped.add(cls);
        log("class " + cls + " (" + label + "): " + members(obj).join(", "));
    }

    // Entries of a TArray, TSet or TMap ({ key, value } for a map).
    function items(c) {
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

    function scan() {
        domains = new Map();
        const counts = {};
        const outRef = puerts.$ref(UE.NewArray(UE.Actor));
        UE.GameplayStatics.GetAllActorsOfClass(ctx, UE.Actor.StaticClass(), outRef);
        const actors = puerts.$unref(outRef);
        for (let i = 0; actors && i < actors.Num(); i++) {
            const a = actors.Get(i);
            if (!game.isAlive(a))
                continue;
            const cls = classOf(a);
            if (!/MobDomain|MonsterParty|MobGroup/i.test(cls))
                continue;
            counts[cls] = (counts[cls] || 0) + 1;
            if (/MobDomain/i.test(cls))
                domains.set(a.GetName(), a);
        }
        return counts;
    }

    function domainOf(spawner) {
        const info = quiet(() => spawner.SpawnInfo);
        if (!info)
            return { ref: "", short: "", group: "" };
        const ref = quiet(() => UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(info.MobDomain), "") || "";
        const group = quiet(() => (info.MobGroupName ? info.MobGroupName.toString() : ""), "");
        const short = ref ? ref.slice(ref.lastIndexOf(".") + 1) : "";
        let actor = short ? domains.get(short) : undefined;
        if (!actor && short) {
            guard("probe rescan", scan);
            actor = domains.get(short);
        }
        if (!actor && ref)
            actor = quiet(() => UE.KismetSystemLibrary.Conv_SoftObjectReferenceToObject(info.MobDomain));
        return { ref, short, group, actor: game.isAlive(actor) ? actor : undefined };
    }

    function describeSpawner(s) {
        const d = domainOf(s);
        const where = quiet(() => game.location(s));
        return s.GetName() + " domain=" + (d.short || "-") + (d.short && !d.actor ? " (not found)" : "") +
            " group=" + (d.group || "-") + " placed=" + /_UAID_/.test(s.GetName()) +
            " pawn=" + nameOf(quiet(() => s.SpawnedAI)) +
            (where ? " at " + Math.round(where.x) + "," + Math.round(where.y) + "," + Math.round(where.z) : "");
    }

    function persistence() {
        const cls = quiet(() => UE.MobGroupCombatPersistenceSubsystem);
        if (!cls)
            return undefined;
        return quiet(() => UE.SubsystemBlueprintLibrary.GetWorldSubsystem(ctx, cls.StaticClass())) ||
            quiet(() => UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(ctx, cls.StaticClass()));
    }

    // GetConfiguredNextGroup is tried on every object that might own it, as a return value and as an
    // out parameter, because its signature is not known. The first form that gives a result is reported.
    function nextGroup(group, domain) {
        const owners = [["persistence", persistence()], ["group", group], ["domain", domain]];
        const tried = [];
        for (const [label, owner] of owners) {
            if (!owner || typeof owner.GetConfiguredNextGroup !== "function")
                continue;
            const direct = quiet(() => owner.GetConfiguredNextGroup(group), "err");
            if (direct !== undefined && direct !== "err")
                return label + ":" + text(direct);
            const outRef = quiet(() => puerts.$ref(""));
            const viaRef = quiet(() => {
                owner.GetConfiguredNextGroup(group, outRef);
                return puerts.$unref(outRef);
            }, "err");
            if (viaRef !== undefined && viaRef !== "err")
                return label + "(out):" + text(viaRef);
            tried.push(label + (direct === "err" ? " threw" : " gave nothing"));
        }
        return tried.length ? "unknown (" + tried.join(", ") + ")" : "no GetConfiguredNextGroup";
    }

    function groupLine(name, g, domain) {
        const count = (n) => quiet(() => { const c = g[n]; return c && typeof c.Num === "function" ? c.Num() : "-"; }, "?");
        const call = (n) => quiet(() => (typeof g[n] === "function" ? text(g[n]()) : "-"), "err");
        return name + ": active=" + text(quiet(() => g.IsActivating)) + " combat=" + text(quiet(() => g.IsCombating)) +
            " members=" + count("Members") + " runtime=" + count("RuntimeMembers") + " preEdit=" + count("PreEditMembers") +
            " anyAlive=" + call("IsAnyMemberAlive_IncludeChildren") + " root=" + call("GetRootMobGroup") +
            " next=" + nextGroup(g, domain);
    }

    function groupsOf(domain) {
        return items(quiet(() => domain.MobGroups)).map((e) =>
            e && e.key !== undefined ? { name: text(e.key), group: e.value } : { name: nameOf(e), group: e });
    }

    function short(s, max) {
        return s.length > max ? s.slice(0, max) + "..." : s;
    }

    // A value as one short line: containers list their first items, objects give their name.
    function valueText(v) {
        if (v === undefined || v === null || typeof v !== "object")
            return String(v);
        if (typeof v.Num === "function") {
            const list = quiet(() => items(v), []);
            return "[" + list.length + (list.length ? ": " + list.slice(0, 8).map((e) =>
                e && e.key !== undefined ? text(e.key) + "=" + text(e.value) : text(e)).join(", ") : "") + "]";
        }
        if (typeof v.Add === "function" && typeof v.Remove === "function")
            return "(event)";
        return text(v);
    }

    // The non-function members of obj with their values, for objects whose shape is unknown.
    function fields(obj) {
        const out = [];
        for (const n of members(obj)) {
            const v = quiet(() => obj[n], "?");
            if (typeof v === "function")
                continue;
            out.push(n + "=" + short(quiet(() => valueText(v), "?"), 160));
        }
        return out.join("; ");
    }

    function dumpFields(obj, label) {
        const cls = classOf(obj);
        const key = "fields " + cls + " " + label;
        if (dumped.has(key))
            return;
        dumped.add(key);
        log("fields " + cls + " (" + label + "): " + short(fields(obj), 4000));
    }

    // Which groups the domain says are active. The call's shape is unknown, so both forms are tried.
    function activeGroups(domain) {
        if (typeof domain.GetCurrentActivatingGroups === "function") {
            const direct = quiet(() => domain.GetCurrentActivatingGroups(), "err");
            if (direct !== "err" && direct !== undefined)
                return valueText(direct);
            const outRef = quiet(() => puerts.$ref(undefined));
            const viaRef = quiet(() => {
                domain.GetCurrentActivatingGroups(outRef);
                return puerts.$unref(outRef);
            }, "err");
            if (viaRef !== "err" && viaRef !== undefined)
                return valueText(viaRef) + " (out)";
        }
        return "field " + quiet(() => valueText(domain.ActivatingGroups), "?");
    }

    // What a domain looks like now: active groups, enabled, config and attached scripts.
    function domainState(domain) {
        return "active=" + activeGroups(domain) +
            " enabled=" + quiet(() => text(domain.bEnabled), "?") +
            " config=" + short(quiet(() => valueText(domain.MobDomainConfig), "?"), 300) +
            " scripts=" + quiet(() => valueText(domain.TriggerScripts), "?");
    }

    function describeDomain(domain, label) {
        const where = quiet(() => game.location(domain));
        log(label + " " + domain.GetName() + " (" + classOf(domain) + ")" +
            (where ? " at " + Math.round(where.x) + "," + Math.round(where.y) + "," + Math.round(where.z) : "") +
            " " + domainState(domain));
        const config = quiet(() => domain.MobDomainConfig);
        if (config && typeof config === "object")
            dumpFields(config, "mob domain config");
        for (const s of quiet(() => items(domain.TriggerScripts), [])) {
            if (s && typeof s === "object" && game.isAlive(s)) {
                dumpClass(s, "domain script");
                dumpFields(s, "domain script " + nameOf(s));
            }
        }
    }

    // The group names in a domain's config (MobDomainConfig.MobGroups is a map keyed by group name),
    // or undefined when the config cannot be read.
    function configGroupNames(domain) {
        try {
            const groups = domain.MobDomainConfig.MobGroups;
            if (!groups || typeof groups.Num !== "function")
                return undefined;
            return items(groups).map((e) => (e && e.key !== undefined ? text(e.key) : text(e)));
        }
        catch (e) {
            return undefined;
        }
    }

    // One line per domain with its group names, then a count per class of single-DefaultGroup
    // domains against domains with several groups. Wave fights seen so far have several groups.
    function logAllGroups() {
        const tally = new Map();
        for (const [name, d] of domains) {
            const cls = classOf(d);
            const groups = configGroupNames(d);
            log("groups " + name + " (" + cls + "): " + (groups ? groups.length + " [" + groups.join(", ") + "]" : "unreadable"));
            if (!tally.has(cls))
                tally.set(cls, { single: 0, several: 0 });
            const t = tally.get(cls);
            if (groups && groups.length === 1 && groups[0] === "DefaultGroup")
                t.single++;
            else if (groups && groups.length > 1)
                t.several++;
        }
        if (tally.size > 0) {
            log("group summary: " + [...tally].sort((a, b) => (a[0] < b[0] ? -1 : 1))
                .map(([cls, t]) => cls + " " + t.single + " single DefaultGroup, " + t.several + " with several groups").join("; "));
        }
    }

    function snapshot(domain) {
        const lines = new Map();
        lines.set("domain", quiet(() => domainState(domain), "unreadable"));
        for (const { name, group } of groupsOf(domain))
            lines.set(name, quiet(() => groupLine(name, group, domain), name + ": unreadable"));
        return lines;
    }

    function argText(a) {
        return quiet(() => text(a), "?");
    }

    function bindEvents(obj, label) {
        for (const n of members(obj)) {
            if (!/^On/.test(n))
                continue;
            const d = quiet(() => obj[n]);
            if (!d || typeof d !== "object" || typeof d.Add !== "function" || typeof d.Remove !== "function")
                continue;
            const fn = (...args) => {
                try {
                    log("event " + label + " " + n + (args.length ? " (" + args.map(argText).join(", ") + ")" : ""));
                }
                catch (e) {
                    // never let a log line break the game's own broadcast
                }
            };
            if (quiet(() => { d.Add(fn); return true; }, false))
                bound.push({ d, fn, owner: obj });
        }
    }

    function unbindAll() {
        for (const b of bound) {
            if (game.isAlive(b.owner))
                quiet(() => b.d.Remove(b.fn));
        }
        bound = [];
    }

    function watch(short, domain) {
        if (watched.has(short))
            return;
        dumpClass(domain, "mob domain");
        dumpFields(domain, "mob domain");
        describeDomain(domain, "watching domain");
        const lines = snapshot(domain);
        for (const { name, group } of groupsOf(domain)) {
            if (game.isAlive(group))
                dumpClass(group, "mob group");
            log("  " + lines.get(name));
            const list = items(quiet(() => group.Members)).slice(0, MAX_MEMBERS);
            if (list.length)
                log("    members: " + list.map((m) => text(m) + (typeof m === "object" ? "[" + classOf(m) + "]" : "")).join(", "));
            if (game.isAlive(group))
                bindEvents(group, short + "|" + name);
        }
        bindEvents(domain, short);
        watched.set(short, { domain, lines });
    }

    // The game's list of finished rewards ("<domain>+<reward script>"), as text.
    function completeEntries() {
        const sys = quiet(() => tsHelper.getWorldSubsystem(ctx, UE.PBZGameSystem.StaticClass()));
        return items(quiet(() => sys.CompleteAddItemMobDomainNames)).map(text).sort();
    }

    function completeList() {
        return completeEntries().join(", ");
    }

    // Finished-reward entries that were not there the last time this was asked.
    function newRewards() {
        const fresh = completeEntries().filter((e) => !seenRewards.has(e));
        fresh.forEach((e) => seenRewards.add(e));
        return fresh;
    }

    // One line per item the backpack gains or loses, with the last kill and whether the game recorded
    // a finished group reward at the same moment. This tells per-enemy drops from group-clear rewards.
    function onItem(propID, isAdd, num) {
        try {
            const line = "item " + (isAdd ? "+" : "-") + text(num) + " " + text(propID);
            if (!isAdd) {
                log(line);
                return;
            }
            const fresh = newRewards();
            const rewards = fresh.length ? "new finished reward: " + fresh.join(", ") : "no new finished reward";
            if (!lastKill) {
                log(line + ", no kill yet; " + rewards);
                return;
            }
            const secs = ((clock() - lastKill.at) / 1000).toFixed(1);
            log(line + ", " + secs + " s after kill " + lastKill.name + " (domain " + (lastKill.domain || "-") +
                ", group " + (lastKill.group || "-") + ", " + (lastKill.again ? "came back before" : "first kill") + "); " + rewards);
        }
        catch (e) {
            // never let a log line break the game's own broadcast
        }
    }

    function listenItems() {
        const sub = quiet(() => tsHelper.getWorldSubsystem(ctx, UE.PBZBackPackSubsystem.StaticClass()));
        const event = quiet(() => sub.UpdateProps);
        if (!event || typeof event.Add !== "function") {
            log("item gains: backpack UpdateProps not found, not listening");
            return;
        }
        itemHandler = (propID, isAdd, num) => onItem(propID, isAdd, num);
        event.Add(itemHandler);
        itemSource = event;
        log("item gains: listening to the backpack");
    }

    function unlistenItems() {
        if (itemSource && itemHandler)
            quiet(() => itemSource.Remove(itemHandler));
        itemSource = undefined;
        itemHandler = undefined;
    }

    function tick() {
        if (!game.isAlive(ctx))
            return stopPoll();
        for (const [short, w] of watched) {
            if (!game.isAlive(w.domain))
                continue;
            const now = snapshot(w.domain);
            for (const [name, line] of now) {
                if (w.lines.get(name) !== line)
                    log("change " + short + "|" + line);
            }
            w.lines = now;
        }
        const complete = completeList();
        if (complete !== lastComplete) {
            log("finished domains: " + (complete || "none"));
            lastComplete = complete;
        }
    }

    function stopPoll() {
        if (poll) {
            timers.clearInterval(poll);
            poll = undefined;
        }
    }

    function logAll(label) {
        for (const [short, w] of watched) {
            if (!game.isAlive(w.domain)) {
                log(label + " " + short + ": not loaded");
                continue;
            }
            w.lines = snapshot(w.domain);
            for (const line of w.lines.values())
                log(label + " " + short + "|" + line);
        }
    }

    function findSpawner(name) {
        const ai = game.aiSubsystem(ctx);
        return ai ? spawners.loaded(ai).find((s) => s.GetName() === name) : undefined;
    }

    function ready(player) {
        guard("probe ready", () => {
            stopPoll();
            unbindAll();
            watched = new Map();
            ctx = player;
            log("wave probe on (diagnostic build, logs only)");
            const counts = guard("probe scan", scan);
            log("scan: " + (counts ? JSON.stringify(counts) : "failed") + ", " + domains.size + " domain actor(s)");
            // The PBZ_ domains are few and include the wave fight; describe them all, and a sample of the
            // ordinary ones to compare against.
            let ordinary = 0;
            for (const [, d] of domains) {
                const pbz = /^PBZ_/.test(classOf(d));
                if (!pbz && ordinary >= 3)
                    continue;
                if (!pbz)
                    ordinary++;
                guard("probe describe", () => describeDomain(d, pbz ? "domain" : "sample domain"));
            }
            guard("probe groups", logAllGroups);
            const sub = persistence();
            log("MobGroupCombatPersistenceSubsystem: " + (quiet(() => UE.MobGroupCombatPersistenceSubsystem) ? (sub ? "found" : "class known, no instance") : "class not exposed"));
            if (sub)
                dumpClass(sub, "persistence subsystem");
            lastComplete = completeList();
            log("finished domains: " + (lastComplete || "none"));
            seenRewards = new Set(completeEntries());
            lastKill = undefined;
            unlistenItems();
            guard("probe items", listenItems);
            poll = timers.setInterval(() => guard("probe poll", tick), POLL_MS);
        });
    }

    // again: the killed enemy had been killed and brought back before.
    function kill(name, again) {
        guard("probe kill", () => {
            lastKill = { name, at: clock(), again: !!again };
            const s = findSpawner(name);
            if (!s) {
                log("kill " + name + ": spawner not loaded");
                return;
            }
            log("kill " + describeSpawner(s) + (again ? " (came back before)" : ""));
            const info = quiet(() => s.SpawnInfo);
            if (info && typeof info === "object")
                dumpFields(info, "spawn info");
            const d = domainOf(s);
            lastKill.domain = d.short;
            lastKill.group = d.group;
            if (d.actor)
                watch(d.short, d.actor);
        });
    }

    function death(names) {
        guard("probe death", () => {
            log("death: " + names.length + " pending kill(s) before the mod decides");
            for (const n of names) {
                const s = findSpawner(n);
                log("  pending " + (s ? describeSpawner(s) : n + " (not loaded)"));
            }
            logAll("at death");
        });
    }

    function respawned() {
        guard("probe respawn", () => {
            logAll("after respawn");
            for (const ms of [3000, 8000])
                timers.setTimeout(() => guard("probe respawn " + ms, () => logAll("respawn+" + ms / 1000 + "s")), ms);
        });
    }

    // Stops the poll and lets go of everything the probe was listening to.
    function stop() {
        guard("probe stop", () => {
            stopPoll();
            unbindAll();
            unlistenItems();
            watched = new Map();
        });
    }

    return { ready, kill, death, respawned, stop };
}

exports.createWaveProbe = createWaveProbe;
