"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lib } = require("./paths");
const { createGame, SECTION_ID } = lib("Game");
const { makeWorld, makePawn, killPawn, TAG_DEAD } = require("./fakegame");

function setup() {
    const g = makeWorld();
    const game = createGame({ UE: g.UE, puerts: g.puerts, tsHelper: g.tsHelper });
    return { g, game };
}

test("isAlive is false for nothing and for destroyed objects", () => {
    const { game } = setup();
    assert.equal(game.isAlive(undefined), false);
    assert.equal(game.isAlive({ destroyed: true }), false);
    assert.equal(game.isAlive({}), true);
});

test("isAlive is false when the game throws", () => {
    const g = makeWorld();
    g.UE.KismetSystemLibrary.IsValid = () => { throw new Error("bad handle"); };
    const game = createGame({ UE: g.UE, puerts: g.puerts, tsHelper: g.tsHelper });
    assert.equal(game.isAlive({}), false);
});

test("hasTag reads the pawn's tags and is false when anything goes wrong", () => {
    const { game } = setup();
    const pawn = makePawn("p");
    assert.equal(game.hasTag(pawn, TAG_DEAD), false);
    killPawn(pawn);
    assert.equal(game.hasTag(pawn, TAG_DEAD), true);
    assert.equal(game.hasTag({}, TAG_DEAD), false);
    assert.equal(game.hasTag(undefined, TAG_DEAD), false);
});

test("levelName, location and player come from the game", () => {
    const { g, game } = setup();
    g.world.level = "LevelZ";
    g.world.player = { name: "me" };
    assert.equal(game.levelName({}), "LevelZ");
    assert.deepEqual(game.location({ K2_GetActorLocation: () => ({ X: 1, Y: 2, Z: 3 }) }), { x: 1, y: 2, z: 3 });
    assert.equal(game.player({}).name, "me");
});

test("readSection of an empty save says there is no data", () => {
    const { game } = setup();
    assert.deepEqual(game.readSection({}), { ok: true, data: undefined });
});

test("writeSection then readSection round-trips the data", () => {
    const { g, game } = setup();
    assert.equal(game.writeSection({}, { version: 1, pending: [{ k: "a" }] }), true);
    assert.equal(g.world.sections.has(SECTION_ID), true);
    assert.deepEqual(game.readSection({}), { ok: true, data: { version: 1, pending: [{ k: "a" }] } });
});

test("writeSection drops null values so the game's serializer never sees one", () => {
    const { g, game } = setup();
    game.writeSection({}, { a: 1, b: null, c: { d: null, e: 2 } });
    assert.deepEqual(JSON.parse(g.world.sections.get(SECTION_ID)), { a: 1, c: { e: 2 } });
});

test("a failing save is reported by writeSection as false, not thrown", () => {
    const { g, game } = setup();
    g.world.failWrite = true;
    assert.equal(game.writeSection({}, { a: 1 }), false);
});

test("a failing read is reported with the reason", () => {
    const { g, game } = setup();
    g.world.failRead = true;
    assert.deepEqual(game.readSection({}), { ok: false, error: "read broke" });
});

test("saved text that is not an object counts as no data", () => {
    const { g, game } = setup();
    g.world.sections.set(SECTION_ID, "[1,2]");
    assert.deepEqual(game.readSection({}), { ok: true, data: undefined });
});

test("saved text that is not JSON is reported as a failed read", () => {
    const { g, game } = setup();
    g.world.sections.set(SECTION_ID, "{ nope");
    assert.equal(game.readSection({}).ok, false);
});

test("reviveCenter gives the respawn point, or undefined when the game cannot say", () => {
    const { g, game } = setup();
    g.world.reviveAt = { X: 10, Y: 20, Z: 30 };
    assert.deepEqual(game.reviveCenter({}), { x: 10, y: 20, z: 30 });
    g.world.reviveFails = true;
    assert.equal(game.reviveCenter({}), undefined);
});

test("respawnBell gives the game's respawn BellID and the bell actor's name", () => {
    const { g, game } = setup();
    g.world.saveActorId = "bell_a_001";
    g.world.saveActors.bell_a_001 = g.world.addActor("BP_Bell_C_5");
    assert.deepEqual(game.respawnBell({}), { ok: true, id: "bell_a_001", actorName: "BP_Bell_C_5" });
});

test("respawnBell gives the id without an actor name when the bell actor is not loaded", () => {
    const { g, game } = setup();
    g.world.saveActorId = "bell_a_001";
    assert.deepEqual(game.respawnBell({}), { ok: true, id: "bell_a_001", actorName: undefined });
    g.world.saveActors.bell_a_001 = g.world.addActor("BP_Bell_C_5");
    g.world.saveActors.bell_a_001.destroyed = true;
    assert.deepEqual(game.respawnBell({}), { ok: true, id: "bell_a_001", actorName: undefined });
});

test("respawnBell gives an empty id when the game has no respawn bell set", () => {
    const { g, game } = setup();
    for (const none of ["None", "", undefined]) {
        g.world.saveActorId = none;
        assert.deepEqual(game.respawnBell({}), { ok: true, id: "", actorName: undefined });
    }
});

test("respawnBell reports a failure with the reason", () => {
    const { g, game } = setup();
    g.world.saveActorFails = true;
    assert.deepEqual(game.respawnBell({}), { ok: false, error: "no save actor" });
});

test("aiSubsystem is undefined when the game has none, and bellManager is found", () => {
    const { g, game } = setup();
    assert.notEqual(game.aiSubsystem({}), undefined);
    g.world.noAi = true;
    assert.equal(game.aiSubsystem({}), undefined);
    assert.equal(game.bellManager({}), g.world.bells);
});

test("listBells returns only actors with Bell in the name, with their positions", () => {
    const { g, game } = setup();
    g.world.addActor("BP_BrokenBell_C_UAID_1", { X: 1, Y: 2, Z: 3 });
    g.world.addActor("BP_Door_C_5", { X: 9, Y: 9, Z: 9 });
    g.world.addActor("BP_bellRing_C_2", { X: 4, Y: 5, Z: 6 });
    assert.deepEqual(game.listBells({}), {
        ok: true,
        list: [{ name: "BP_BrokenBell_C_UAID_1", x: 1, y: 2, z: 3 }, { name: "BP_bellRing_C_2", x: 4, y: 5, z: 6 }],
    });
});

test("listBells leaves out BellGuideLine actors, even when they are closer than the bell", () => {
    const { g, game } = setup();
    g.world.addActor("BP_WoodenFrameBell_C_2147475609", { X: 500, Y: 0, Z: 0 });
    g.world.addActor("BP_BellGuideLine_C_12", { X: 10, Y: 0, Z: 0 });
    g.world.addActor("BellGuideLine_Spline_3", { X: 20, Y: 0, Z: 0 });
    assert.deepEqual(game.listBells({}), {
        ok: true,
        list: [{ name: "BP_WoodenFrameBell_C_2147475609", x: 500, y: 0, z: 0 }],
    });
});

test("listBells skips destroyed actors and reports a failure with the reason", () => {
    const { g, game } = setup();
    g.world.addActor("BP_Bell_C_1").destroyed = true;
    assert.deepEqual(game.listBells({}), { ok: true, list: [] });
    g.world.failActors = true;
    assert.deepEqual(game.listBells({}), { ok: false, error: "no actors" });
});

test("takeDust removes Dust from the player", () => {
    const { g, game } = setup();
    game.takeDust(new g.RenewalPlayer(), 75);
    assert.deepEqual(g.world.dustChanges, [{ add: false, amount: 75 }]);
});
