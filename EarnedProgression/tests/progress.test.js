"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lib } = require("./paths");
const P = lib("Progress");

function kill(k, x, y, z, level) {
    return { k, l: level || "LevelA", x: x || 0, y: y || 0, z: z || 0 };
}

test("isListed matches any candidate name that is on the list", () => {
    const list = ["BellA", "Level|BellB"];
    assert.equal(P.isListed(list, "BellA"), true);
    assert.equal(P.isListed(list, "Nope", "Level|BellB"), true);
    assert.equal(P.isListed(list, "Nope", undefined, ""), false);
    assert.equal(P.isListed(list), false);
});

test("isListed is false for a list that is missing or is not a list", () => {
    assert.equal(P.isListed(undefined, "BellA"), false);
    assert.equal(P.isListed("BellA", "BellA"), false);
    assert.equal(P.isListed([], "BellA"), false);
});

test("bankAll makes every pending kill permanent and forgets their again marks", () => {
    const s = P.emptyState();
    P.recordKill(s, kill("a"));
    P.recordKill(s, kill("b"));
    s.again.push("a", "other");
    const banked = P.bankAll(s);
    assert.deepEqual(banked.map((e) => e.k), ["a", "b"]);
    assert.deepEqual(s.pending, []);
    assert.deepEqual(s.again, ["other"]);
    assert.deepEqual(s.bells, []);
});

test("isListedAnyCase ignores case and skips empty candidates", () => {
    assert.equal(P.isListedAnyCase(["Bell_A"], "bell_a"), true);
    assert.equal(P.isListedAnyCase(["bell_a"], undefined, "", "BELL_A"), true);
    assert.equal(P.isListedAnyCase(["bell_a"], "bell_b"), false);
    assert.equal(P.isListedAnyCase(undefined, "bell_a"), false);
});

test("bankAll with nothing pending returns an empty list", () => {
    const s = P.emptyState();
    assert.deepEqual(P.bankAll(s), []);
});

test("nearestBell picks the closest bell within the distance, in three dimensions", () => {
    const bells = [
        { name: "Far", x: 900, y: 0, z: 0 },
        { name: "Near", x: 100, y: 100, z: 100 },
        { name: "Mid", x: 400, y: 0, z: 0 },
    ];
    const r = P.nearestBell(bells, { x: 0, y: 0, z: 0 }, 1000);
    assert.equal(r.name, "Near");
    assert.equal(Math.round(r.distance), 173);
});

test("nearestBell gives nothing when no bell is within the distance, or there is no center or bells", () => {
    const bells = [{ name: "Far", x: 5000, y: 0, z: 0 }];
    assert.equal(P.nearestBell(bells, { x: 0, y: 0, z: 0 }, 1000), undefined);
    assert.equal(P.nearestBell(bells, undefined, 1000), undefined);
    assert.equal(P.nearestBell([], { x: 0, y: 0, z: 0 }, 1000), undefined);
    assert.equal(P.nearestBell(undefined, { x: 0, y: 0, z: 0 }, 1000), undefined);
});

test("rankBells lists the closest bells first, at most count of them", () => {
    const bells = [
        { name: "C", x: 300, y: 0, z: 0 },
        { name: "A", x: 100, y: 0, z: 0 },
        { name: "B", x: 200, y: 0, z: 0 },
        { name: "D", x: 400, y: 0, z: 0 },
    ];
    assert.deepEqual(P.rankBells(bells, { x: 0, y: 0, z: 0 }, 3), [
        { name: "A", distance: 100 }, { name: "B", distance: 200 }, { name: "C", distance: 300 },
    ]);
});

test("rankBells gives an empty list without a center or bells", () => {
    assert.deepEqual(P.rankBells([{ name: "A", x: 1, y: 0, z: 0 }], undefined, 3), []);
    assert.deepEqual(P.rankBells(undefined, { x: 0, y: 0, z: 0 }, 3), []);
});

test("nearestBell includes a bell exactly at the distance", () => {
    const r = P.nearestBell([{ name: "Edge", x: 1000, y: 0, z: 0 }], { x: 0, y: 0, z: 0 }, 1000);
    assert.equal(r.name, "Edge");
});

test("dropListed removes listed spawners from pending and says how many", () => {
    const s = P.emptyState();
    P.recordKill(s, kill("a"));
    P.recordKill(s, kill("b"));
    P.recordKill(s, kill("c"));
    assert.equal(P.dropListed(s, ["b", "zzz", "c"]), 2);
    assert.deepEqual(s.pending.map((e) => e.k), ["a"]);
});

test("dropListed also forgets the again mark of a dropped spawner", () => {
    const s = P.emptyState();
    P.recordKill(s, kill("a"));
    s.again.push("a", "other");
    P.dropListed(s, ["a"]);
    assert.deepEqual(s.again, ["other"]);
});

test("dropListed with an empty or missing list changes nothing", () => {
    const s = P.emptyState();
    P.recordKill(s, kill("a"));
    assert.equal(P.dropListed(s, []), 0);
    assert.equal(P.dropListed(s, undefined), 0);
    assert.equal(s.pending.length, 1);
});

test("a new state is empty and has the current version", () => {
    assert.deepEqual(P.emptyState(), { version: 1, pending: [], again: [], bells: [] });
});

test("load of nothing, an array, or an empty object gives an empty state without a problem", () => {
    for (const raw of [undefined, null, [], {}, "text", 5]) {
        const r = P.load(raw);
        assert.deepEqual(r.state, P.emptyState());
        assert.equal(r.problem, undefined);
    }
});

test("load of data with another version starts empty and says so", () => {
    const r = P.load({ version: 2, pending: [kill("a")], again: [], bells: [] });
    assert.deepEqual(r.state, P.emptyState());
    assert.match(r.problem, /version 2, expected 1/);
});

test("load of data with a missing list starts empty and says so", () => {
    const r = P.load({ version: 1, pending: [], again: [] });
    assert.deepEqual(r.state, P.emptyState());
    assert.match(r.problem, /missing a list/);
});

test("load keeps valid data and does not share arrays with the input", () => {
    const raw = { version: 1, pending: [kill("a", 1, 2, 3)], again: ["b"], bells: ["LevelA|Bell1"] };
    const r = P.load(raw);
    assert.equal(r.problem, undefined);
    assert.deepEqual(r.state, raw);
    r.state.pending.push(kill("z"));
    r.state.again.push("z");
    assert.equal(raw.pending.length, 1);
    assert.equal(raw.again.length, 1);
});

test("load drops invalid and repeated entries and reports how many", () => {
    const raw = {
        version: 1,
        pending: [kill("a"), kill("a"), null, { k: "b" }, { k: "c", l: "L", x: NaN, y: 0, z: 0 }, { k: "", l: "L", x: 0, y: 0, z: 0 }, kill("d")],
        again: ["x", "x", 5, ""],
        bells: ["b1", null, "b1"],
    };
    const r = P.load(raw);
    assert.deepEqual(r.state.pending.map((e) => e.k), ["a", "d"]);
    assert.deepEqual(r.state.again, ["x"]);
    assert.deepEqual(r.state.bells, ["b1"]);
    assert.match(r.problem, /^10 invalid or repeated saved entries dropped$/);
});

test("recordKill adds a kill, and refuses a repeat or a bad kill", () => {
    const s = P.emptyState();
    assert.equal(P.recordKill(s, kill("a", 1, 2, 3)), true);
    assert.equal(P.recordKill(s, kill("a", 9, 9, 9)), false);
    assert.equal(P.recordKill(s, { k: "b" }), false);
    assert.equal(P.recordKill(s, null), false);
    assert.deepEqual(s.pending, [kill("a", 1, 2, 3)]);
});

test("recordKill copies the kill so later changes to it do not leak in", () => {
    const s = P.emptyState();
    const k = kill("a");
    P.recordKill(s, k);
    k.x = 99;
    assert.equal(s.pending[0].x, 0);
});

test("inSafeZone is inclusive at exactly the radius and false just outside", () => {
    const ctx = { level: "LevelA", center: { x: 0, y: 0, z: 0 }, radius: 1000 };
    assert.equal(P.inSafeZone(kill("a", 1000, 0, 0), ctx), true);
    assert.equal(P.inSafeZone(kill("a", 1000.01, 0, 0), ctx), false);
});

test("inSafeZone measures in three dimensions", () => {
    const ctx = { level: "LevelA", center: { x: 0, y: 0, z: 0 }, radius: 1000 };
    assert.equal(P.inSafeZone(kill("a", 600, 600, 600), ctx), false);
    assert.equal(P.inSafeZone(kill("a", 500, 500, 500), ctx), true);
});

test("inSafeZone is false for another level, a zero radius, or an unknown center", () => {
    const near = kill("a", 0, 0, 0, "LevelA");
    assert.equal(P.inSafeZone(near, { level: "LevelB", center: { x: 0, y: 0, z: 0 }, radius: 1000 }), false);
    assert.equal(P.inSafeZone(near, { level: "LevelA", center: { x: 0, y: 0, z: 0 }, radius: 0 }), false);
    assert.equal(P.inSafeZone(near, { level: "LevelA", center: undefined, radius: 1000 }), false);
});

test("splitForDeath revives kills outside the safe zone and keeps those inside pending", () => {
    const s = P.emptyState();
    P.recordKill(s, kill("near", 100, 0, 0));
    P.recordKill(s, kill("far", 5000, 0, 0));
    P.recordKill(s, kill("other", 0, 0, 0, "LevelB"));
    const r = P.splitForDeath(s, { level: "LevelA", center: { x: 0, y: 0, z: 0 }, radius: 1000 });
    assert.deepEqual(r.revive.map((e) => e.k).sort(), ["far", "other"]);
    assert.deepEqual(r.keep.map((e) => e.k), ["near"]);
    assert.deepEqual(s.pending.map((e) => e.k), ["near"]);
    assert.deepEqual(s.again.sort(), ["far", "other"]);
});

test("splitForDeath does not add a key to again twice", () => {
    const s = P.emptyState();
    s.again.push("far");
    P.recordKill(s, kill("far", 5000, 0, 0));
    P.splitForDeath(s, { level: "LevelA", center: undefined, radius: 1000 });
    assert.deepEqual(s.again, ["far"]);
});

test("splitForDeath with nothing pending does nothing", () => {
    const s = P.emptyState();
    const r = P.splitForDeath(s, { level: "LevelA", center: undefined, radius: 1000 });
    assert.deepEqual(r, { revive: [], keep: [] });
    assert.deepEqual(s, P.emptyState());
});

test("a new bell banks every pending kill and forgets their again marks", () => {
    const s = P.emptyState();
    P.recordKill(s, kill("a"));
    P.recordKill(s, kill("b"));
    s.again.push("a", "unrelated");
    const r = P.bankAtBell(s, "LevelA|Bell1");
    assert.equal(r.newBell, true);
    assert.deepEqual(r.banked.map((e) => e.k), ["a", "b"]);
    assert.deepEqual(s.pending, []);
    assert.deepEqual(s.again, ["unrelated"]);
    assert.deepEqual(s.bells, ["LevelA|Bell1"]);
});

test("a known bell changes nothing", () => {
    const s = P.emptyState();
    P.bankAtBell(s, "LevelA|Bell1");
    P.recordKill(s, kill("a"));
    const before = JSON.stringify(s);
    const r = P.bankAtBell(s, "LevelA|Bell1");
    assert.deepEqual(r, { newBell: false, banked: [] });
    assert.equal(JSON.stringify(s), before);
});

test("a new bell with nothing pending is still remembered", () => {
    const s = P.emptyState();
    const r = P.bankAtBell(s, "LevelA|Bell2");
    assert.deepEqual(r, { newBell: true, banked: [] });
    assert.deepEqual(s.bells, ["LevelA|Bell2"]);
});

test("whole story: kill, die, kill again, bank at a new bell, die again", () => {
    const s = P.emptyState();
    const ctx = { level: "LevelA", center: { x: 0, y: 0, z: 0 }, radius: 1000 };
    P.recordKill(s, kill("safe", 100, 0, 0));
    P.recordKill(s, kill("far", 5000, 0, 0));
    P.splitForDeath(s, ctx);
    assert.equal(P.isAgain(s, "far"), true);
    assert.equal(P.isAgain(s, "safe"), false);
    P.recordKill(s, kill("far", 5000, 0, 0));
    assert.deepEqual(s.pending.map((e) => e.k).sort(), ["far", "safe"]);
    const banked = P.bankAtBell(s, "LevelA|Bell2");
    assert.equal(banked.banked.length, 2);
    assert.deepEqual(s.again, []);
    const second = P.splitForDeath(s, ctx);
    assert.deepEqual(second.revive, []);
});
