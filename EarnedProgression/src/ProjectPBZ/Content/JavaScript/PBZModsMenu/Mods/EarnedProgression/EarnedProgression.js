"use strict";
// Earned Progression: kills only become permanent when the player rests at a bell not used before.
// Started by main.js, which Mods Menu loads.
Object.defineProperty(exports, "__esModule", { value: true });

const { createGame, TAG_DEAD } = require("./lib/Game");
const { createSpawners } = require("./lib/Spawners");
const { createKills } = require("./lib/Kills");
const { createSettings, JSON_FILE, MENU_FILE } = require("./lib/Settings");
const Menu = require("./lib/Menu");
const { createDustCut, cutFor } = require("./lib/DustCut");
const Progress = require("./lib/Progress");
const { createWaveProbe } = require("./lib/WaveProbe");

const VERSION = "0.10.0";
const KILL_TICK_MS = 500;
// A bell counts as the one the player respawns at when it is this close (cm) to the respawn point.
const BELL_MATCH_CM = 1000;
const NEAREST_LISTED = 3;

function whole(n) {
    return String(Math.round(n));
}

// The game's own modules, loaded when the plugin starts (they do not exist under plain Node).
function gameModules() {
    return {
        UE: require("ue"),
        puerts: require("puerts"),
        tsHelper: require("../../../Library/TsHelper").default,
        RenewalPlayer: require("../../../Gameplay/RenewalPlayer").RenewalPlayerinXinInterface,
        DustTips: require("../../../UI/Widget/Foundation/DustTips").PBZUpdateDustWidgetInterface,
        timers: { setInterval, clearInterval, setTimeout },
        showText: gameShowText,
    };
}

// The game's one-line tip with our own text (UIHelper.showTipsText). Loaded on first use, so a
// failure only affects the messages.
function gameShowText(ctx, text) {
    const cpp = require("cpp");
    const UIHelper = require("../../../Library/UIHelper").default;
    UIHelper.showTipsText(ctx, cpp.FText.FromString(text));
}

function start(api, modules) {
    return startWith(api, modules || gameModules());
}

function startWith(api, modules) {
    const { UE, puerts, tsHelper, RenewalPlayer, DustTips, timers } = modules;
    const clock = modules.clock || (() => Date.now());
    const settings = createSettings({
        jsonPath: api.settingsPath(JSON_FILE),
        menuPath: api.settingsPath(MENU_FILE),
        readText: api.readText,
        writeText: api.writeText,
        clock,
        log: api.log,
    });
    const debug = (text) => {
        if (settings.get().debugLog)
            api.log(text);
    };

    const game = createGame({ UE, puerts, tsHelper });
    const spawners = createSpawners({ UE, puerts, game, log: api.log });
    const dustCut = createDustCut();
    // Diagnostic logging of mob domains, waves and item gains, only while debugWaveProbe is on. It is
    // turned on or off at a level load; the kill, death and respawn lines follow that choice.
    const waveProbe = createWaveProbe({ UE, puerts, tsHelper, game, spawners, timers, clock, log: (t) => api.log("probe: " + t) });
    let probing = false;
    const probe = {
        ready(player) {
            probing = settings.get().debugWaveProbe;
            if (probing)
                waveProbe.ready(player);
            else
                waveProbe.stop();
        },
        kill(name, again) { if (probing) waveProbe.kill(name, again); },
        death(names) { if (probing) waveProbe.death(names); },
        respawned() { if (probing) waveProbe.respawned(); },
    };

    // A message in the game's one-line tip. A failure is logged once, then messages are skipped.
    let screenBroken = false;
    function showMessage(ctx, text) {
        if (screenBroken || !modules.showText)
            return;
        try {
            modules.showText(ctx, text);
        }
        catch (e) {
            screenBroken = true;
            api.log("on-screen message failed: " + (e && e.message ? e.message : e) + "; no more on-screen messages this session");
        }
    }

    function newBellText(count) {
        if (count === 0)
            return "New bell reached. No pending kills to keep.";
        return "New bell reached. " + count + (count === 1 ? " enemy" : " enemies") + " will stay dead.";
    }

    let state = Progress.emptyState();
    let watch;
    let hiddenTakeBacks = [];

    function save(ctx) {
        if (!game.writeSection(ctx, state))
            api.log("could not store the progress in the save");
    }

    function load(ctx) {
        const read = game.readSection(ctx);
        if (!read.ok) {
            api.log("could not read the saved progress: " + read.error);
            state = Progress.emptyState();
            return;
        }
        const loaded = Progress.load(read.data);
        if (loaded.problem)
            api.log("saved progress: " + loaded.problem);
        state = loaded.state;
    }

    // The loaded spawners with these actor names whose mob domain is on the domain exception list.
    function inExceptedDomain(player, names) {
        const list = settings.get().domainExceptions;
        const ai = list.length > 0 && names.length > 0 ? game.aiSubsystem(player) : undefined;
        if (!ai)
            return [];
        const wanted = new Set(names);
        return spawners.loaded(ai).filter((s) => wanted.has(s.GetName()) && spawners.inDomainList(s, list));
    }

    // The loaded spawner with this actor name, or undefined.
    function findSpawner(player, name) {
        const ai = game.aiSubsystem(player);
        return ai ? spawners.loaded(ai).find((s) => s.GetName() === name) : undefined;
    }

    function onKill(player, kill) {
        probe.kill(kill.k, Progress.isAgain(state, kill.k));
        if (Progress.isListed(settings.get().enemyExceptions, kill.k)) {
            debug("kill: " + kill.k + " is on the enemy exception list, not recorded");
            return;
        }
        const spawner = findSpawner(player, kill.k);
        const domain = spawner ? spawners.domainName(spawner) : "";
        if (spawner && spawners.inDomainList(spawner, settings.get().domainExceptions)) {
            debug("kill: " + kill.k + " is in domain " + domain + " on the domain exception list, not recorded");
            return;
        }
        const where = domain ? " in domain " + domain : " in no domain";
        const again = Progress.isAgain(state, kill.k);
        // A trial behind a broken bell resets itself when you die, so its enemies are left to the game.
        // The Dust pairing still sees the kill as a first kill, so it gives full Dust.
        const trial = game.brokenBellTrial(player);
        if (trial.ok && trial.value) {
            dustCut.noteKill({ at: clock(), again: false, name: kill.k });
            debug("kill: " + kill.k + where + " in a broken bell trial, not recorded");
            return;
        }
        // Not knowing, the kill is recorded with a mark; a death in a trial then makes it permanent.
        const entry = trial.ok ? kill : { ...kill, t: true };
        if (Progress.recordKill(state, entry)) {
            dustCut.noteKill({ at: clock(), again, name: kill.k });
            debug("kill: " + kill.k + where + (again ? " (came back before)" : "") + ", pending " + state.pending.length +
                (trial.ok ? "" : ", marked: could not tell whether this is a broken bell trial (" + trial.error + ")"));
        }
    }

    // A level is ready: read the saved progress and start watching for kills.
    function onReady(player) {
        if (!player.IsPlayerControlled())
            return;
        if (watch) {
            timers.clearInterval(watch.timer);
            watch = undefined;
        }
        load(player);
        const kills = createKills({ game, spawners, clock, log: debug, onKill: (kill) => onKill(player, kill) });
        const timer = timers.setInterval(() => {
            try {
                if (!game.isAlive(player)) {
                    timers.clearInterval(timer);
                    return;
                }
                if (game.hasTag(player, TAG_DEAD))
                    return;
                const dropped = Progress.dropListed(state, settings.get().enemyExceptions);
                if (dropped > 0)
                    api.log("dropped " + dropped + " pending kill(s) of enemies that are on the exception list");
                if (kills.tick(player) > 0 || dropped > 0)
                    save(player);
            }
            catch (e) {
                api.log("kill watch failed: " + (e && e.message ? e.message : e));
            }
        }, KILL_TICK_MS);
        watch = { timer };
        probe.ready(player);
        api.log("ready on " + game.levelName(player) + ": " + state.pending.length + " pending, " + state.bells.length + " known bells");
    }

    // The bell the game will respawn the player at. It is read from the game (the same calls its own
    // death code makes), never from the last bell rested at: the game can change the respawn bell on
    // its own. Only when the game has none set, and bellProximityFallback is on, the bell actor nearest
    // to the respawn point is used instead.
    // Returns { bell: { id, actorName } } or { unknown: reason }.
    function findDeathBell(player, center) {
        const read = game.respawnBell(player);
        if (!read.ok)
            return { unknown: "could not read the respawn bell: " + read.error };
        if (read.id) {
            api.log("death: respawn bell " + read.id + " (actor " + (read.actorName || "not loaded") + ")");
            return { bell: { id: read.id, actorName: read.actorName } };
        }
        const none = "the game has no respawn bell set";
        if (!settings.get().bellProximityFallback)
            return { unknown: none };
        if (!center)
            return { unknown: none + "; the respawn point is unknown" };
        const listed = game.listBells(player);
        if (!listed.ok)
            return { unknown: none + "; could not list the bells: " + listed.error };
        const ranked = Progress.rankBells(listed.list, center, NEAREST_LISTED);
        const at = whole(center.x) + ", " + whole(center.y) + ", " + whole(center.z);
        api.log("death: respawn point " + at + "; nearest bells: " +
            (ranked.length ? ranked.map((b) => b.name + " " + whole(b.distance) + " cm").join(", ") : "none"));
        const near = Progress.nearestBell(listed.list, center, BELL_MATCH_CM);
        if (!near) {
            return { unknown: none + "; no bell within " + BELL_MATCH_CM + " cm of the respawn point " + at + "; nearest: " +
                (ranked.length ? ranked[0].name + " " + whole(ranked[0].distance) + " cm" : "none") };
        }
        api.log("death: using the nearest bell actor " + near.name);
        return { bell: { id: "", actorName: near.name } };
    }

    // The player died: pending kills outside the safe zone come back. Their map entries are set to
    // alive now, before the game saves for the respawn, and they are spawned at the monster step.
    let reviving = [];
    function onDeath(player) {
        if (!player.IsPlayerControlled())
            return;
        const ai = game.aiSubsystem(player);
        if (!ai) {
            api.log("death: no spawner subsystem, nothing brought back");
            return;
        }
        probe.death(state.pending.map((e) => e.k));
        const excepted = inExceptedDomain(player, state.pending.map((e) => e.k)).map((s) => s.GetName());
        if (excepted.length > 0) {
            const dropped = Progress.dropListed(state, excepted);
            api.log("death: " + dropped + " pending kill(s) dropped, their domain is on the domain exception list");
        }
        const level = game.levelName(player);
        const center = game.reviveCenter(player);
        const found = findDeathBell(player, center);
        const bell = found.bell;
        const bellIds = bell ? [bell.id, bell.actorName, bell.actorName && level + "|" + bell.actorName] : [];
        // Kills made in the trial were never recorded. Those whose trial state could not be read were
        // marked: they are made permanent here, and every other pending kill goes on as normal.
        const trial = game.brokenBellTrial(player);
        if (!trial.ok)
            api.log("death: could not tell whether this is a broken bell trial (" + trial.error + ")");
        else if (trial.value) {
            const banked = Progress.bankMarked(state);
            spawners.setMapAlive(ai, banked.map((e) => e.k), false);
            api.log("death: in a broken bell trial (respawn bell " + (bell ? bell.id || bell.actorName : "unknown") + "), " +
                banked.length + " marked kill(s) made permanent, the rest as normal");
        }
        const matchBells = { partial: settings.get().useBellExceptionPartialId };
        if (bell && Progress.isListedAnyCase(settings.get().bellExceptions, matchBells, ...bellIds)) {
            // Nothing comes back and pending kills become permanent, as in the base game.
            const banked = Progress.bankAll(state);
            spawners.setMapAlive(ai, banked.map((e) => e.k), false);
            save(player);
            api.log("death: respawning at an excepted bell (" + (bell.id || bell.actorName) + "), " + banked.length + " kill(s) made permanent");
            return;
        }
        if (!bell)
            api.log("death: could not tell which bell you respawn at (" + found.unknown + "), reviving as normal");
        const split = Progress.splitForDeath(state, { level, center, radius: settings.get().bellSafeRadius });
        const names = split.revive.map((e) => e.k);
        const changed = spawners.setMapAlive(ai, names, true);
        reviving = reviving.concat(names);
        save(player);
        api.log("death: " + names.length + " kill(s) coming back, " + split.keep.length + " kept dead near the bell (" + changed + " map entries)");
    }

    function onRespawnMonsters(player) {
        if (!player.IsPlayerControlled() || reviving.length === 0)
            return;
        const ai = game.aiSubsystem(player);
        const names = reviving;
        reviving = [];
        if (!ai)
            return;
        const r = spawners.respawnNamed(ai, names);
        api.log("respawn: " + r.spawned + " spawned, " + r.alreadyAlive + " already alive, " + r.failed + " failed, " + (names.length - r.spawned - r.alreadyAlive - r.failed) + " in areas not loaded");
    }

    function onRest(player, bell) {
        if (!player.IsPlayerControlled())
            return;
        const ai = game.aiSubsystem(player);
        if (!ai) {
            api.log("rest: no spawner subsystem, nothing changed");
            return;
        }
        const id = game.levelName(player) + "|" + (game.isAlive(bell) ? bell.GetName() : "unknown");
        const result = Progress.bankAtBell(state, id);
        if (result.newBell) {
            spawners.setMapAlive(ai, result.banked.map((e) => e.k), false);
            save(player);
            if (settings.get().newBellMessage)
                showMessage(player, newBellText(result.banked.length));
        }
        let bellId = "";
        try {
            if (game.isAlive(bell) && bell.BellID !== undefined && bell.BellID !== null)
                bellId = String(bell.BellID);
        }
        catch (e) {
            bellId = "";
        }
        api.log("rest at " + id + ": " + (result.newBell ? "new bell, " + result.banked.length + " kill(s) made permanent" : "known bell, nothing changes") +
            (bellId ? "; bell id " + bellId : ""));
    }

    // A kill's Dust gain: show only respawnDust percent and take the rest back right after.
    function onDustGain(widget, args) {
        const change = args[0];
        const hidden = change < 0 ? hiddenTakeBacks.indexOf(-change) : -1;
        if (hidden >= 0) {
            hiddenTakeBacks.splice(hidden, 1);
            return api.SKIP;
        }
        if (!(change > 0))
            return undefined;
        const claim = dustCut.claim(clock());
        const take = cutFor(claim, change, settings.get().respawnDust);
        if (take <= 0)
            return undefined;
        const player = game.player(widget);
        if (!game.isAlive(player))
            return undefined;
        hiddenTakeBacks.push(take);
        timers.setTimeout(() => {
            try {
                game.takeDust(player, take);
                debug("dust: " + claim.name + " gave " + change + ", " + take + " taken back");
            }
            catch (e) {
                hiddenTakeBacks.splice(hiddenTakeBacks.indexOf(take), 1);
                api.log("Dust take-back failed: " + (e && e.message ? e.message : e));
            }
        }, 0);
        args[0] = change - take;
        if (typeof args[2] === "number")
            args[1] = args[2] + args[0];
        return undefined;
    }

    api.wrap(RenewalPlayer, "RenewalPlayer", "SaveLoad", undefined, (self) => onReady(self));
    api.wrap(RenewalPlayer, "RenewalPlayer", "PushWidgetAndChangeData", (self) => { onDeath(self); });
    api.wrap(RenewalPlayer, "RenewalPlayer", "stepRespawnGroup", (self) => self.respawnPendingGroup, (self, args, group) => {
        if (group === 3) {
            onRespawnMonsters(self);
            if (self.IsPlayerControlled())
                probe.respawned();
        }
    });
    api.wrap(RenewalPlayer, "RenewalPlayer", "BindBellDelegate", undefined, (self) => {
        const bells = game.bellManager(self);
        if (!bells)
            return;
        if (self.earnedProgressionBell)
            bells.OnInteractBell.Remove(self.earnedProgressionBell);
        self.earnedProgressionBell = (bell) => {
            try {
                onRest(self, bell);
            }
            catch (e) {
                api.log("rest failed: " + (e && e.message ? e.message : e));
            }
        };
        bells.OnInteractBell.Add(self.earnedProgressionBell);
    });
    api.wrap(DustTips, "DustTips", "enqueueDustChange", (self, args) => onDustGain(self, args));

    api.log("started " + VERSION + ": bellSafeRadius " + settings.get().bellSafeRadius + ", respawnDust " + settings.get().respawnDust);
    Menu.register(modules.host || globalThis, settings, VERSION, api.log);
}

exports.VERSION = VERSION;
exports.KILL_TICK_MS = KILL_TICK_MS;
exports.start = start;
exports.startWith = startWith;
