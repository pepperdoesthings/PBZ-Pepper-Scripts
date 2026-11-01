"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lib } = require("./paths");
const { createGame } = lib("Game");
const { createSpawners } = lib("Spawners");
const { makeWorld, makeSpawner, killPawn } = require("./fakegame");

function setup() {
    const g = makeWorld();
    g.world.codex = {
        Grunt: { cls: "/Game/Enemies/BP_Grunt.BP_Grunt_C", boss: false },
        BigBoss: { cls: "/Game/Enemies/BP_BigBoss.BP_BigBoss_C", boss: true },
    };
    const game = createGame({ UE: g.UE, puerts: g.puerts, tsHelper: g.tsHelper });
    const logs = [];
    const spawners = createSpawners({ UE: g.UE, puerts: g.puerts, game, log: (t) => logs.push(t) });
    const ai = g.tsHelper.getWorldSubsystem({}, "ai");
    return { g, game, spawners, ai, logs };
}

test("loaded lists only spawners that still exist", () => {
    const { g, spawners, ai } = setup();
    g.world.addSpawner(makeSpawner("S1"));
    const gone = g.world.addSpawner(makeSpawner("S2"));
    gone.destroyed = true;
    assert.deepEqual(spawners.loaded(ai).map((s) => s.GetName()), ["S1"]);
});

test("a spawner of a boss class or with a boss-tagged enemy is a boss", () => {
    const { g, spawners } = setup();
    const byClass = g.world.addSpawner(makeSpawner("B1", { cls: "/Game/Enemies/BP_BigBoss.BP_BigBoss_C" }));
    const byTag = g.world.addSpawner(makeSpawner("B2", { bossTag: true }));
    const grunt = g.world.addSpawner(makeSpawner("G1"));
    assert.equal(spawners.isBoss(byClass), true);
    assert.equal(spawners.isBoss(byTag), true);
    assert.equal(spawners.isBoss(grunt), false);
});

test("classify leaves out bosses and the other members of a boss's mob group", () => {
    const { g, spawners, ai } = setup();
    g.world.addSpawner(makeSpawner("Boss", { cls: "/Game/Enemies/BP_BigBoss.BP_BigBoss_C", group: "ArenaA" }));
    g.world.addSpawner(makeSpawner("Add1", { group: "ArenaA" }));
    g.world.addSpawner(makeSpawner("Plain1"));
    g.world.addSpawner(makeSpawner("Plain2", { group: "Camp" }));
    const r = spawners.classify(ai);
    assert.deepEqual(r.normal.map((s) => s.GetName()).sort(), ["Plain1", "Plain2"]);
    assert.equal(r.skipped, 2);
});

test("the boss table is read once and a missing table is logged", () => {
    const { g, spawners, logs } = setup();
    g.world.noCodex = true;
    const s = g.world.addSpawner(makeSpawner("G1"));
    assert.equal(spawners.isBoss(s), false);
    assert.match(logs.join("\n"), /boss table is empty/);
});

test("setMapAlive changes matching save map entries and counts them", () => {
    const { g, spawners, ai } = setup();
    g.world.addSpawner(makeSpawner("S1"), true);
    g.world.addSpawner(makeSpawner("S2"), false);
    assert.equal(spawners.setMapAlive(ai, ["S1", "S2", "Missing"], true), 1);
    assert.equal(g.world.mapAlive("S1"), true);
    assert.equal(spawners.setMapAlive(ai, ["S2"], false), 1);
    assert.equal(g.world.mapAlive("S2"), false);
});

test("setMapAlive with nothing to do changes nothing", () => {
    const { g, spawners, ai } = setup();
    g.world.addSpawner(makeSpawner("S1"), true);
    assert.equal(spawners.setMapAlive(ai, ["S1"], false), 0);
    assert.equal(spawners.setMapAlive(ai, [], true), 0);
});

test("respawnNamed removes a corpse, marks the spawner alive and spawns again", () => {
    const { g, spawners, ai } = setup();
    const s = g.world.addSpawner(makeSpawner("S1"));
    const corpse = s.SpawnedAI;
    killPawn(corpse);
    s.ShouldSpawn = false;
    s.SpawnerSaveInfo = { IsAlive: false };
    const r = spawners.respawnNamed(ai, ["S1"]);
    assert.deepEqual(r, { spawned: 1, alreadyAlive: 0, failed: 0 });
    assert.equal(corpse.destroyed, true);
    assert.equal(s.ShouldSpawn, true);
    assert.equal(s.SpawnerSaveInfo.IsAlive, true);
    assert.equal(s.spawnCalls, 1);
});

test("respawnNamed leaves a living enemy alone and skips unnamed spawners", () => {
    const { g, spawners, ai } = setup();
    const alive = g.world.addSpawner(makeSpawner("Alive"));
    const other = g.world.addSpawner(makeSpawner("Other"));
    killPawn(other.SpawnedAI);
    const r = spawners.respawnNamed(ai, ["Alive"]);
    assert.deepEqual(r, { spawned: 0, alreadyAlive: 1, failed: 0 });
    assert.equal(alive.spawnCalls, 0);
    assert.equal(other.spawnCalls, 0);
});

test("respawnNamed spawns a spawner whose enemy is gone", () => {
    const { g, spawners, ai } = setup();
    const s = g.world.addSpawner(makeSpawner("S1", { noPawn: true }));
    assert.equal(spawners.respawnNamed(ai, ["S1"]).spawned, 1);
    assert.equal(s.spawnCalls, 1);
});

test("respawnNamed falls back to Spawn and reports a spawner that cannot spawn", () => {
    const { g, spawners, ai, logs } = setup();
    const viaSpawn = g.world.addSpawner(makeSpawner("A", { spawnFn: "Spawn", noPawn: true }));
    g.world.addSpawner(makeSpawner("B", { failSpawn: true, noPawn: true }));
    const r = spawners.respawnNamed(ai, ["A", "B"]);
    assert.equal(r.spawned, 1);
    assert.equal(r.failed, 1);
    assert.equal(viaSpawn.spawnCalls, 1);
    assert.match(logs.join("\n"), /Respawn failed on B: cannot spawn/);
});
