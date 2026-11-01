"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lib } = require("./paths");
const { WINDOW_MS, takeFor, cutFor, createDustCut } = lib("DustCut");

test("takeFor removes the part of a gain that is not kept", () => {
    assert.equal(takeFor(100, 25), 75);
    assert.equal(takeFor(100, 100), 0);
    assert.equal(takeFor(100, 0), 100);
    assert.equal(takeFor(10, 25), 8);
});

test("takeFor treats a bad percentage as keeping everything or clamps it", () => {
    assert.equal(takeFor(100, NaN), 0);
    assert.equal(takeFor(100, "abc"), 0);
    assert.equal(takeFor(100, 150), 0);
    assert.equal(takeFor(100, -10), 100);
});

test("takeFor of a loss, nothing, or a tiny gain is zero", () => {
    assert.equal(takeFor(-5, 25), 0);
    assert.equal(takeFor(0, 25), 0);
    assert.equal(takeFor(1, 90), 0);
});

test("cutFor only cuts a returned enemy seen on its own", () => {
    assert.equal(cutFor(undefined, 100, 25), 0);
    assert.equal(cutFor({ again: false, mixed: false }, 100, 25), 0);
    assert.equal(cutFor({ again: true, mixed: true }, 100, 25), 0);
    assert.equal(cutFor({ again: true, mixed: false }, 100, 25), 75);
});

test("claim with no kills gives nothing", () => {
    assert.equal(createDustCut().claim(0), undefined);
});

test("claims pair the oldest kill first and use each kill once", () => {
    const d = createDustCut();
    d.noteKill({ at: 0, again: true, name: "A" });
    d.noteKill({ at: 100, again: true, name: "B" });
    assert.deepEqual(d.claim(200), { again: true, mixed: false, name: "A" });
    assert.deepEqual(d.claim(200), { again: true, mixed: false, name: "B" });
    assert.equal(d.claim(200), undefined);
});

test("a kill older than the window is forgotten, one just inside it is kept", () => {
    const d = createDustCut();
    d.noteKill({ at: 0, again: true, name: "A" });
    assert.equal(d.claim(WINDOW_MS - 1).name, "A");
    d.noteKill({ at: 0, again: true, name: "B" });
    assert.equal(d.claim(WINDOW_MS), undefined);
    assert.equal(d.pending(), 0);
});

test("expire returns the kills it drops", () => {
    const d = createDustCut();
    d.noteKill({ at: 0, again: false, name: "A" });
    d.noteKill({ at: 1500, again: false, name: "B" });
    assert.deepEqual(d.expire(2500).map((k) => k.name), ["A"]);
    assert.equal(d.pending(), 1);
});

test("a window with returned and fresh enemies is mixed for the first claim only", () => {
    const d = createDustCut();
    d.noteKill({ at: 0, again: true, name: "A" });
    d.noteKill({ at: 50, again: false, name: "B" });
    assert.equal(d.claim(100).mixed, true);
    const second = d.claim(100);
    assert.equal(second.name, "B");
    assert.equal(second.mixed, false);
});

test("noteKill turns the name into text and again into a boolean", () => {
    const d = createDustCut();
    d.noteKill({ at: 0, again: 1, name: 5 });
    assert.deepEqual(d.claim(0), { again: true, mixed: false, name: "5" });
});
