"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { plugin } = require("./paths");
const { createLoader } = require(path.join(__dirname, "..", "..", "ScriptModLoader", "src", "ProjectPBZ", "Content", "JavaScript", "ScriptModLoader", "Loader"));
const { SECTION_ID } = require("./paths").lib("Game");
const { makeWorld, makeSpawner, killPawn } = require("./fakegame");

const MODS = "C:/Game/ProjectPBZ/Content/Paks/~mods";
const SETTINGS = MODS + "/EarnedProgression.json";
// The default enemy list changes while playing (ids get added, or commented out to test), so the
// tests follow whatever the source holds instead of repeating the ids.
const SAFE_ENEMIES = [...require("./paths").lib("Settings").DEFAULTS.enemyExceptions];

// Starts the plugin on a fake game through the real loader api. Returns handles for the tests.
function boot(settingsText) {
    const g = makeWorld();
    g.world.codex = { Grunt: { cls: "/Game/Enemies/BP_Grunt.BP_Grunt_C", boss: false } };
    const files = new Map();
    if (settingsText !== undefined)
        files.set(SETTINGS, settingsText);
    const flushes = [];
    let now = 0;
    const io = {
        modsDir: MODS,
        now: () => "T",
        readText: (p) => files.get(p),
        writeText: (p, t) => { files.set(p, t); },
        requireMod: () => ({}),
        setTimeout: (fn) => { flushes.push(fn); return 1; },
    };
    const loader = createLoader(io);
    const api = loader.buildApi("EarnedProgression");
    const player = new g.RenewalPlayer();
    g.world.player = player;
    plugin().startWith(api, {
        UE: g.UE, puerts: g.puerts, tsHelper: g.tsHelper,
        RenewalPlayer: g.RenewalPlayer, DustTips: g.DustTips, timers: g.timers, clock: () => now,
    });
    const advance = (ms) => { now += ms; };
    const logText = () => { flushes.splice(0).forEach((f) => f()); return files.get(MODS + "/ScriptModLoader.log") || ""; };
    const saved = () => JSON.parse(g.world.sections.get(SECTION_ID));
    const tick = () => g.timers.intervals.filter((t) => !t.cleared).forEach((t) => t.fn());
    return { g, files, player, logText, saved, tick, advance };
}

// player has entered a level: the game calls SaveLoad
function enter(h) {
    h.player.SaveLoad();
}

function killNow(h, spawner) {
    killPawn(spawner.SpawnedAI);
    h.tick();
}

function die(h) {
    h.player.PushWidgetAndChangeData();
    h.player.respawnPendingGroup = 3;
    h.player.stepRespawnGroup();
}

function rest(h, bellName) {
    h.g.world.handlers.forEach((fn) => fn({ GetName: () => bellName }));
}

test("starting writes the default settings file and logs that it started", () => {
    const h = boot();
    assert.deepEqual(JSON.parse(h.files.get(SETTINGS)), {
        bellSafeRadius: 1000, respawnDust: 25, debugLog: true, bellProximityFallback: false,
        bellExceptions: [...require("./paths").lib("Settings").DEFAULTS.bellExceptions],
        enemyExceptions: SAFE_ENEMIES,
    });
    assert.match(h.logText(), /\[EarnedProgression\] started: bellSafeRadius 1000, respawnDust 25/);
});

test("starting hooks the player, the respawn steps, the bell and the Dust pop-up", () => {
    const h = boot();
    const wrapped = (cls, name) => String(cls.prototype[name]).includes("inner.apply");
    for (const name of ["SaveLoad", "PushWidgetAndChangeData", "stepRespawnGroup", "BindBellDelegate"])
        assert.equal(wrapped(h.g.RenewalPlayer, name), true, name);
    assert.equal(wrapped(h.g.DustTips, "enqueueDustChange"), true);
});

test("a missing hook target is logged and the others still work", () => {
    const g = makeWorld();
    delete g.RenewalPlayer.prototype.stepRespawnGroup;
    const logs = [];
    const loader = createLoader({ modsDir: MODS, now: () => "T", readText: () => undefined, writeText: () => { }, requireMod: () => ({}), setTimeout: (fn) => { fn(); return 1; } });
    const api = loader.buildApi("EP");
    const wrapped = Object.assign({}, api, { log: (t) => logs.push(t) });
    plugin().startWith(Object.freeze(wrapped), {
        UE: g.UE, puerts: g.puerts, tsHelper: g.tsHelper, RenewalPlayer: g.RenewalPlayer, DustTips: g.DustTips, timers: g.timers,
    });
    assert.equal(String(g.RenewalPlayer.prototype.SaveLoad).includes("inner.apply"), true);
    assert.equal(String(g.DustTips.prototype.enqueueDustChange).includes("inner.apply"), true);
});

test("entering a level loads the progress, starts the watch and logs the counts", () => {
    const h = boot();
    enter(h);
    assert.equal(h.g.timers.intervals.length, 1);
    assert.match(h.logText(), /ready on LevelA: 0 pending, 0 known bells/);
});

test("entering a level again replaces the watch instead of stacking another", () => {
    const h = boot();
    enter(h);
    enter(h);
    assert.equal(h.g.timers.intervals.filter((t) => !t.cleared).length, 1);
});

test("a kill is stored as pending in the save", () => {
    const h = boot();
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }));
    enter(h);
    h.tick();
    killNow(h, s);
    assert.deepEqual(h.saved().pending, [{ k: "S1", l: "LevelA", x: 4000, y: 0, z: 0 }]);
});

test("a death brings a pending kill back and spawns it at the monster step", () => {
    const h = boot();
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    h.tick();
    killNow(h, s);
    h.g.world.map[0].info.IsAlive = false;
    die(h);
    assert.equal(h.g.world.mapAlive("S1"), true);
    assert.equal(s.spawnCalls, 1);
    assert.deepEqual(h.saved().pending, []);
    assert.deepEqual(h.saved().again, ["S1"]);
    assert.match(h.logText(), /death: 1 kill\(s\) coming back, 0 kept dead near the bell/);
    assert.match(h.logText(), /respawn: 1 spawned/);
});

test("a kill inside the safe zone stays dead and pending after a death", () => {
    const h = boot();
    const s = h.g.world.addSpawner(makeSpawner("Near", { pos: { X: 300, Y: 0, Z: 0 } }), false);
    enter(h);
    h.tick();
    killNow(h, s);
    h.g.world.map[0].info.IsAlive = false;
    die(h);
    assert.equal(h.g.world.mapAlive("Near"), false);
    assert.equal(s.spawnCalls, 0);
    assert.equal(h.saved().pending.length, 1);
});

test("a safe radius of 0 brings back even a kill at the bell", () => {
    const h = boot('{"bellSafeRadius": 0}');
    const s = h.g.world.addSpawner(makeSpawner("Near", { pos: { X: 0, Y: 0, Z: 0 } }), false);
    enter(h);
    h.tick();
    killNow(h, s);
    h.g.world.map[0].info.IsAlive = false;
    die(h);
    assert.equal(s.spawnCalls, 1);
});

test("a rest at a new bell makes kills permanent, so a later death brings nothing back", () => {
    const h = boot();
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    h.player.BindBellDelegate();
    h.tick();
    killNow(h, s);
    h.g.world.map[0].info.IsAlive = true;
    rest(h, "Bell1");
    assert.equal(h.g.world.mapAlive("S1"), false);
    assert.deepEqual(h.saved().pending, []);
    assert.deepEqual(h.saved().bells, ["LevelA|Bell1"]);
    die(h);
    assert.equal(s.spawnCalls, 0);
    assert.match(h.logText(), /rest at LevelA\|Bell1: new bell, 1 kill\(s\) made permanent/);
});

test("a rest at a known bell leaves pending kills pending", () => {
    const h = boot();
    h.g.player = h.player;
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    h.player.BindBellDelegate();
    rest(h, "Bell1");
    h.tick();
    killNow(h, s);
    rest(h, "Bell1");
    assert.equal(h.saved().pending.length, 1);
    assert.match(h.logText(), /known bell, nothing changes/);
});

test("binding the bell twice leaves a single listener", () => {
    const h = boot();
    enter(h);
    h.player.BindBellDelegate();
    h.player.BindBellDelegate();
    assert.equal(h.g.world.handlers.length, 1);
});

test("a second kill of a returned enemy shows only the kept part and takes the rest back", () => {
    const h = boot();
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    h.tick();
    killNow(h, s);
    new h.g.DustTips().enqueueDustChange(100, 300, 200);
    h.g.world.map[0].info.IsAlive = false;
    die(h);
    h.g.popups.length = 0;
    h.tick();
    killNow(h, s);
    new h.g.DustTips().enqueueDustChange(100, 300, 200);
    assert.deepEqual(h.g.popups, [[25, 225, 200]]);
    h.g.timers.runTimeouts();
    assert.deepEqual(h.g.world.dustChanges, [{ add: false, amount: 75 }]);
});

test("the shown target is the base plus the kept gain, whatever target the game passed", () => {
    const h = boot();
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    h.tick();
    killNow(h, s);
    new h.g.DustTips().enqueueDustChange(100, 300, 200);
    h.g.world.map[0].info.IsAlive = false;
    die(h);
    h.g.popups.length = 0;
    h.tick();
    killNow(h, s);
    new h.g.DustTips().enqueueDustChange(100, 999, 200);
    assert.deepEqual(h.g.popups, [[25, 225, 200]]);
});

test("the take-back's own pop-up is swallowed", () => {
    const h = boot();
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    h.tick();
    killNow(h, s);
    new h.g.DustTips().enqueueDustChange(100, 300, 200);
    h.g.world.map[0].info.IsAlive = false;
    die(h);
    h.tick();
    killNow(h, s);
    new h.g.DustTips().enqueueDustChange(100, 300, 200);
    h.g.popups.length = 0;
    new h.g.DustTips().enqueueDustChange(-75, 125, 200);
    assert.deepEqual(h.g.popups, []);
});

test("a first-time kill gives its full Dust", () => {
    const h = boot();
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    h.tick();
    killNow(h, s);
    new h.g.DustTips().enqueueDustChange(100, 300, 200);
    assert.deepEqual(h.g.popups, [[100, 300, 200]]);
    h.g.timers.runTimeouts();
    assert.deepEqual(h.g.world.dustChanges, []);
});

test("Dust with no kill next to it, and a respawnDust of 100, are never cut", () => {
    const h = boot('{"respawnDust": 100}');
    const s = h.g.world.addSpawner(makeSpawner("S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    new h.g.DustTips().enqueueDustChange(50, 150, 100);
    h.tick();
    killNow(h, s);
    h.g.world.map[0].info.IsAlive = false;
    die(h);
    h.tick();
    killNow(h, s);
    new h.g.DustTips().enqueueDustChange(100, 300, 200);
    assert.deepEqual(h.g.popups, [[50, 150, 100], [100, 300, 200]]);
});

test("a save that cannot be read is logged and the mod starts empty", () => {
    const h = boot();
    h.g.world.failRead = true;
    enter(h);
    assert.match(h.logText(), /could not read the saved progress: read broke/);
    assert.match(h.logText(), /0 pending/);
});

test("saved progress from an earlier session is picked up on entering a level", () => {
    const h = boot();
    h.g.world.sections.set(SECTION_ID, JSON.stringify({ version: 1, pending: [{ k: "S9", l: "LevelA", x: 1, y: 2, z: 3 }], again: [], bells: ["LevelA|Old"] }));
    enter(h);
    assert.match(h.logText(), /1 pending, 1 known bells/);
});

test("only the player-controlled character is handled", () => {
    const h = boot();
    h.player.controlled = false;
    enter(h);
    assert.equal(h.g.timers.intervals.length, 0);
    h.player.PushWidgetAndChangeData();
    assert.equal(h.g.world.sections.has(SECTION_ID), false);
});

const BROKEN = "BP_BrokenBell_C_UAID_E89C25A7512053C502_1432849353";

// One far-away kill that is pending, with the level ready. The respawn point is the origin.
function pendingKill(h, name) {
    const s = h.g.world.addSpawner(makeSpawner(name || "S1", { pos: { X: 4000, Y: 0, Z: 0 } }), false);
    enter(h);
    h.tick();
    killNow(h, s);
    h.g.world.map[h.g.world.map.length - 1].info.IsAlive = false;
    return s;
}

// The game's own respawn bell: its BellID, and the bell actor (when it is loaded).
function atBell(h, id, actorName) {
    h.g.world.saveActorId = id;
    if (actorName)
        h.g.world.saveActors[id] = h.g.world.addActor(actorName, { X: 99999, Y: 0, Z: 0 });
}

test("a death at a bell whose BellID is on the exception list brings nothing back and makes the kills permanent", () => {
    const h = boot('{"bellExceptions": ["bell_x_001"]}');
    const s = pendingKill(h);
    atBell(h, "bell_x_001", "BP_Bell_C_5");
    die(h);
    assert.equal(h.g.world.mapAlive("S1"), false);
    assert.equal(s.spawnCalls, 0);
    assert.deepEqual(h.saved().pending, []);
    assert.deepEqual(h.saved().again, []);
    assert.match(h.logText(), /death: respawning at an excepted bell \(bell_x_001\), 1 kill\(s\) made permanent/);
});

test("a bell can also be excepted by its actor name, so the existing default ids still match", () => {
    const h = boot();
    const s = pendingKill(h);
    atBell(h, "bell_x_002", BROKEN);
    die(h);
    assert.equal(s.spawnCalls, 0);
    assert.match(h.logText(), /excepted bell \(bell_x_002\)/);
});

test("a bell can be excepted as level|actor name too", () => {
    const h = boot('{"bellExceptions": ["LevelA|BP_Bell_C_77"]}');
    const s = pendingKill(h);
    atBell(h, "bell_x_003", "BP_Bell_C_77");
    die(h);
    assert.equal(s.spawnCalls, 0);
});

test("bell ids match regardless of case, as the game's own bell ids do", () => {
    const h = boot('{"bellExceptions": ["BELL_X_001"]}');
    const s = pendingKill(h);
    atBell(h, "Bell_X_001");
    die(h);
    assert.equal(s.spawnCalls, 0);
});

test("after a held death a second death revives nothing either", () => {
    const h = boot('{"bellExceptions": ["bell_x_001"]}');
    const s = pendingKill(h);
    atBell(h, "bell_x_001");
    die(h);
    die(h);
    assert.equal(s.spawnCalls, 0);
});

test("a death logs the respawn bell's BellID and actor name", () => {
    const h = boot();
    pendingKill(h);
    atBell(h, "bell_x_004", "BP_Bell_C_9");
    die(h);
    assert.match(h.logText(), /death: respawn bell bell_x_004 \(actor BP_Bell_C_9\)/);
});

test("a death logs the BellID even when the bell actor is not loaded", () => {
    const h = boot();
    pendingKill(h);
    atBell(h, "bell_x_005");
    die(h);
    assert.match(h.logText(), /death: respawn bell bell_x_005 \(actor not loaded\)/);
});

test("a respawn bell that is not on the list does not hold the death", () => {
    const h = boot();
    const s = pendingKill(h);
    atBell(h, "bell_x_006", "BP_Bell_C_5");
    die(h);
    assert.equal(s.spawnCalls, 1);
    assert.match(h.logText(), /death: 1 kill\(s\) coming back, 0 kept dead near the bell/);
});

test("the last bell rested at is not used to choose the death bell", () => {
    const h = boot('{"bellExceptions": ["bell_x_001"]}');
    const s = pendingKill(h);
    h.player.BindBellDelegate();
    rest(h, "BP_Bell_C_5");
    atBell(h, "bell_x_001");
    const again = h.g.world.addSpawner(makeSpawner("S2", { pos: { X: 4000, Y: 100, Z: 0 } }), false);
    h.advance(6000);
    h.tick();
    killNow(h, again);
    h.g.world.map[h.g.world.map.length - 1].info.IsAlive = false;
    die(h);
    assert.equal(again.spawnCalls, 0);
    assert.equal(s.spawnCalls, 0);
    assert.match(h.logText(), /excepted bell \(bell_x_001\)/);
});

test("a nearby excepted bell actor does not hold the death when the game names another bell", () => {
    const h = boot('{"bellProximityFallback": true}');
    const s = pendingKill(h);
    h.g.world.addActor(BROKEN, { X: 200, Y: 0, Z: 0 });
    atBell(h, "bell_x_007", "BP_Bell_C_5");
    die(h);
    assert.equal(s.spawnCalls, 1);
});

test("with no respawn bell set the death revives as normal, says why and does not search for bells", () => {
    const h = boot();
    const s = pendingKill(h);
    h.g.world.addActor(BROKEN, { X: 200, Y: 0, Z: 0 });
    die(h);
    assert.equal(s.spawnCalls, 1);
    assert.match(h.logText(), /death: could not tell which bell you respawn at \(the game has no respawn bell set\), reviving as normal/);
    assert.doesNotMatch(h.logText(), /nearest bells/);
});

test("when the respawn bell cannot be read the death revives as normal and the log gives the reason", () => {
    const h = boot();
    const s = pendingKill(h);
    h.g.world.saveActorFails = true;
    die(h);
    assert.equal(s.spawnCalls, 1);
    assert.match(h.logText(), /could not tell which bell you respawn at \(could not read the respawn bell: no save actor\), reviving as normal/);
});

test("with bellProximityFallback on and no respawn bell set, the nearest bell actor is used", () => {
    const h = boot('{"bellProximityFallback": true}');
    const s = pendingKill(h);
    h.g.world.addActor(BROKEN, { X: 200, Y: 0, Z: 0 });
    die(h);
    assert.equal(s.spawnCalls, 0);
    assert.match(h.logText(), /death: respawn point 0, 0, 0; nearest bells: BP_BrokenBell_C_UAID_E89C25A7512053C502_1432849353 200 cm/);
    assert.match(h.logText(), /excepted bell \(BP_BrokenBell_C_UAID_E89C25A7512053C502_1432849353\)/);
});

test("with bellProximityFallback on and no bell near, the death revives as normal and says why", () => {
    const h = boot('{"bellProximityFallback": true}');
    const s = pendingKill(h);
    h.g.world.addActor(BROKEN, { X: 99999, Y: 0, Z: 0 });
    die(h);
    assert.equal(s.spawnCalls, 1);
    assert.match(h.logText(), /could not tell which bell you respawn at \(the game has no respawn bell set; no bell within 1000 cm of the respawn point 0, 0, 0; nearest: BP_BrokenBell_C_UAID_E89C25A7512053C502_1432849353 99999 cm\), reviving as normal/);
});

test("with bellProximityFallback on, failures to find the respawn point or list bells are reported", () => {
    const h = boot('{"bellProximityFallback": true}');
    const s = pendingKill(h);
    h.g.world.failActors = true;
    die(h);
    assert.match(h.logText(), /\(the game has no respawn bell set; could not list the bells: no actors\)/);
    h.g.world.reviveFails = true;
    die(h);
    assert.match(h.logText(), /\(the game has no respawn bell set; the respawn point is unknown\)/);
    assert.equal(s.spawnCalls, 1);
});

test("a rest logs the bell's BellID", () => {
    const h = boot();
    enter(h);
    h.player.BindBellDelegate();
    h.g.world.handlers.forEach((fn) => fn({ GetName: () => "BP_Bell_C_5", BellID: { toString: () => "bell_x_008" } }));
    assert.match(h.logText(), /rest at LevelA\|BP_Bell_C_5: new bell, 0 kill\(s\) made permanent; bell id bell_x_008/);
});

test("an enemy on the exception list is never recorded, never revived and gives full Dust", () => {
    const h = boot('{"enemyExceptions": ["Boss1"]}');
    const s = pendingKill(h, "Boss1");
    assert.deepEqual(h.saved().pending, []);
    h.g.world.addActor("BP_Bell_C_5", { X: 200, Y: 0, Z: 0 });
    die(h);
    assert.equal(s.spawnCalls, 0);
    new h.g.DustTips().enqueueDustChange(100, 300, 200);
    assert.deepEqual(h.g.popups, [[100, 300, 200]]);
});

test("every enemy on the default list is skipped with the default settings, and others are still recorded", () => {
    const h = boot();
    const safe = SAFE_ENEMIES.map((name, i) => h.g.world.addSpawner(makeSpawner(name, { pos: { X: 4000, Y: i * 10, Z: 0 } }), false));
    const other = h.g.world.addSpawner(makeSpawner("BP_AISpawner_C_5", { pos: { X: 4000, Y: 500, Z: 0 } }), false);
    enter(h);
    h.tick();
    safe.forEach((s) => killPawn(s.SpawnedAI));
    killPawn(other.SpawnedAI);
    h.tick();
    assert.deepEqual(h.saved().pending.map((e) => e.k), ["BP_AISpawner_C_5"]);
});

test("an enemy added to the list after its kill was recorded is dropped from pending on the next tick", () => {
    const h = boot();
    pendingKill(h, "Boss2");
    assert.equal(h.saved().pending.length, 1);
    h.files.set("C:/Game/ProjectPBZ/Content/Paks/~mods/EarnedProgression.json", '{"enemyExceptions": ["Boss2"]}');
    h.advance(2500);
    h.tick();
    assert.deepEqual(h.saved().pending, []);
});

test("a kill-watch error is logged and the watch keeps running", () => {
    const h = boot();
    enter(h);
    h.g.world.addSpawner(makeSpawner("S1"));
    h.g.tsHelper.getWorldSubsystem = () => { throw new Error("subsystem gone"); };
    assert.doesNotThrow(() => h.tick());
    assert.match(h.logText(), /kill watch failed: subsystem gone/);
});
