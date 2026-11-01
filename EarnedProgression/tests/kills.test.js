"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lib } = require("./paths");
const { createGame } = lib("Game");
const { createSpawners } = lib("Spawners");
const { createKills, LIST_REFRESH_MS } = lib("Kills");
const { makeWorld, makeSpawner, killPawn } = require("./fakegame");

function setup() {
    const g = makeWorld();
    const game = createGame({ UE: g.UE, puerts: g.puerts, tsHelper: g.tsHelper });
    const spawners = createSpawners({ UE: g.UE, puerts: g.puerts, game });
    let now = 0;
    const kills = [];
    const watch = createKills({ game, spawners, clock: () => now, onKill: (k) => kills.push(k) });
    const player = new g.RenewalPlayer();
    return { g, watch, kills, player, advance: (ms) => { now += ms; } };
}

test("an enemy seen alive and then dead is reported once, with its spawner's position", () => {
    const { g, watch, kills, player } = setup();
    const s = g.world.addSpawner(makeSpawner("S1", { pos: { X: 5, Y: 6, Z: 7 } }));
    assert.equal(watch.tick(player), 0);
    killPawn(s.SpawnedAI);
    assert.equal(watch.tick(player), 1);
    assert.equal(watch.tick(player), 0);
    assert.deepEqual(kills, [{ k: "S1", l: "LevelA", x: 5, y: 6, z: 7, name: "S1" }]);
});

test("an enemy that is already dead when first seen is not a kill", () => {
    const { g, watch, kills, player } = setup();
    const s = g.world.addSpawner(makeSpawner("S1"));
    killPawn(s.SpawnedAI);
    assert.equal(watch.tick(player), 0);
    assert.deepEqual(kills, []);
});

test("an enemy that vanishes without dying is not a kill", () => {
    const { g, watch, kills, player } = setup();
    const s = g.world.addSpawner(makeSpawner("S1"));
    watch.tick(player);
    s.SpawnedAI.destroyed = true;
    assert.equal(watch.tick(player), 0);
    assert.deepEqual(kills, []);
});

test("bosses and boss adds are never reported", () => {
    const { g, watch, kills, player } = setup();
    g.world.codex = { Boss: { cls: "/Game/Enemies/BP_BigBoss.BP_BigBoss_C", boss: true } };
    const boss = g.world.addSpawner(makeSpawner("Boss", { cls: "/Game/Enemies/BP_BigBoss.BP_BigBoss_C", group: "Arena" }));
    const add = g.world.addSpawner(makeSpawner("Add", { group: "Arena" }));
    watch.tick(player);
    killPawn(boss.SpawnedAI);
    killPawn(add.SpawnedAI);
    watch.tick(player);
    assert.deepEqual(kills, []);
});

test("an enemy that comes back is seen again and its next death is a new kill", () => {
    const { g, watch, kills, player } = setup();
    const s = g.world.addSpawner(makeSpawner("S1"));
    watch.tick(player);
    killPawn(s.SpawnedAI);
    watch.tick(player);
    s.Respawn();
    watch.tick(player);
    killPawn(s.SpawnedAI);
    watch.tick(player);
    assert.equal(kills.length, 2);
});

test("the spawner list is refreshed only every few seconds, and reset forgets everything", () => {
    const { g, watch, kills, player, advance } = setup();
    watch.tick(player);
    const late = g.world.addSpawner(makeSpawner("Late"));
    watch.tick(player);
    killPawn(late.SpawnedAI);
    watch.tick(player);
    assert.equal(kills.length, 0);
    advance(LIST_REFRESH_MS);
    watch.tick(player);
    assert.equal(kills.length, 0);
    const later = g.world.addSpawner(makeSpawner("Later"));
    advance(LIST_REFRESH_MS);
    watch.tick(player);
    killPawn(later.SpawnedAI);
    watch.tick(player);
    assert.equal(kills.length, 1);
    watch.reset();
    const again = g.world.addSpawner(makeSpawner("Again"));
    watch.tick(player);
    killPawn(again.SpawnedAI);
    watch.tick(player);
    assert.equal(kills.length, 2);
});

test("with no spawner subsystem nothing is reported and nothing throws", () => {
    const { g, watch, kills, player } = setup();
    g.world.noAi = true;
    assert.equal(watch.tick(player), 0);
    assert.deepEqual(kills, []);
});
