"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lib } = require("./paths");
const { DEFAULTS, RELOAD_MS, normalize, createSettings, defaultsText } = lib("Settings");

const PATH = "C:/Game/ProjectPBZ/Content/Paks/~mods/EarnedProgression.json";
const BROKEN_BELL = "BP_BrokenBell_C_UAID_E89C25A7512053C502_1432849353";
const WOODEN_FRAME_BELL = "BP_WoodenFrameBell_C_2147475609";
// The default lists are data that changes while playing, so the tests follow whatever the source holds.
const DEFAULT_BELLS = [...DEFAULTS.bellExceptions];
// The default enemy list is data that changes while playing (ids get added, or commented out to test),
// so these tests follow whatever the source holds instead of repeating the ids.
const DEFAULT_ENEMIES = [...DEFAULTS.enemyExceptions];

function setup(initial) {
    const files = new Map(initial === undefined ? [] : [[PATH, initial]]);
    const logs = [];
    let now = 0;
    let reads = 0;
    const settings = createSettings({
        path: PATH,
        readText: (p) => { reads++; return files.get(p); },
        writeText: (p, t) => { files.set(p, t); },
        clock: () => now,
        log: (t) => logs.push(t),
    });
    return { files, logs, settings, advance: (ms) => { now += ms; }, reads: () => reads };
}

function warnings(raw) {
    const warned = [];
    const value = normalize(raw, (t) => warned.push(t));
    return { value, warned };
}

test("the defaults are 1000 cm, 25 percent and the debug log on, and cannot be changed", () => {
    assert.deepEqual({ ...DEFAULTS }, {
        bellSafeRadius: 1000, respawnDust: 25, debugLog: true, bellProximityFallback: false,
        bellExceptions: DEFAULT_BELLS, enemyExceptions: DEFAULT_ENEMIES,
    });
    assert.equal(Object.isFrozen(DEFAULTS), true);
    assert.equal(Object.isFrozen(DEFAULTS.bellExceptions), true);
    assert.equal(Object.isFrozen(DEFAULTS.enemyExceptions), true);
});

test("the default bell list still holds the first two bells found in play", () => {
    assert.ok(DEFAULTS.bellExceptions.includes(BROKEN_BELL));
    assert.ok(DEFAULTS.bellExceptions.includes(WOODEN_FRAME_BELL));
});

test("every default bell id is a trimmed, non-empty text and none repeats", () => {
    for (const id of DEFAULTS.bellExceptions)
        assert.ok(typeof id === "string" && id.length > 0 && id === id.trim(), JSON.stringify(id));
    assert.equal(new Set(DEFAULTS.bellExceptions).size, DEFAULTS.bellExceptions.length);
});

test("every default enemy id is a trimmed, non-empty text and none repeats", () => {
    for (const id of DEFAULTS.enemyExceptions) {
        assert.equal(typeof id, "string");
        assert.ok(id.length > 0 && id === id.trim(), JSON.stringify(id));
    }
    assert.equal(new Set(DEFAULTS.enemyExceptions).size, DEFAULTS.enemyExceptions.length);
});

test("normalize keeps valid exception lists, trims entries and removes repeats", () => {
    const { value, warned } = warnings({ bellExceptions: [" BellA ", "BellB", "BellA"], enemyExceptions: ["Spawner1"] });
    assert.deepEqual(value.bellExceptions, ["BellA", "BellB"]);
    assert.deepEqual(value.enemyExceptions, ["Spawner1"]);
    assert.deepEqual(warned, []);
});

test("an empty exception list is accepted and replaces the default list", () => {
    const { value, warned } = warnings({ bellExceptions: [] });
    assert.deepEqual(value.bellExceptions, []);
    assert.deepEqual(warned, []);
});

test("entries that are not text are ignored with one warning that names the key", () => {
    const { value, warned } = warnings({ enemyExceptions: ["ok", 5, null, "", "  ", { a: 1 }] });
    assert.deepEqual(value.enemyExceptions, ["ok"]);
    assert.equal(warned.length, 1);
    assert.match(warned[0], /enemyExceptions: 5 entries/);
});

test("an exception setting that is not a list falls back to its default and warns", () => {
    for (const bad of ["BellA", 5, null, { a: 1 }, true]) {
        const { value, warned } = warnings({ bellExceptions: bad, enemyExceptions: bad });
        assert.deepEqual(value.bellExceptions, DEFAULT_BELLS);
        assert.deepEqual(value.enemyExceptions, DEFAULT_ENEMIES);
        assert.equal(warned.length, 2);
        assert.match(warned[0], /bellExceptions must be a list/);
        assert.match(warned[1], /enemyExceptions must be a list/);
    }
});

test("normalized lists are copies, so changing them cannot change the defaults", () => {
    const { value } = warnings({});
    value.bellExceptions.push("x");
    value.enemyExceptions.push("y");
    assert.deepEqual([...DEFAULTS.bellExceptions], DEFAULT_BELLS);
    assert.deepEqual([...DEFAULTS.enemyExceptions], DEFAULT_ENEMIES);
});

test("normalize keeps valid values", () => {
    const { value, warned } = warnings({ bellSafeRadius: 500, respawnDust: 40, debugLog: false });
    assert.deepEqual(value, { bellSafeRadius: 500, respawnDust: 40, debugLog: false, bellProximityFallback: false, bellExceptions: DEFAULT_BELLS, enemyExceptions: DEFAULT_ENEMIES });
    assert.deepEqual(warned, []);
});

test("bellProximityFallback is off by default, can be turned on, and must be true or false", () => {
    assert.equal(warnings({}).value.bellProximityFallback, false);
    assert.equal(warnings({ bellProximityFallback: true }).value.bellProximityFallback, true);
    for (const bad of ["true", 1, null]) {
        const { value, warned } = warnings({ bellProximityFallback: bad });
        assert.equal(value.bellProximityFallback, false);
        assert.match(warned[0], /bellProximityFallback must be true or false/);
    }
});

test("normalize fills in missing keys with the defaults without warning", () => {
    const { value, warned } = warnings({});
    assert.deepEqual(value, { ...DEFAULTS });
    assert.deepEqual(warned, []);
});

test("respawnDust is clamped to 0..100", () => {
    assert.equal(warnings({ respawnDust: 150 }).value.respawnDust, 100);
    assert.equal(warnings({ respawnDust: -5 }).value.respawnDust, 0);
    assert.equal(warnings({ respawnDust: 0 }).value.respawnDust, 0);
});

test("a bellSafeRadius of 0 turns the safe zone off and is accepted", () => {
    const { value, warned } = warnings({ bellSafeRadius: 0 });
    assert.equal(value.bellSafeRadius, 0);
    assert.deepEqual(warned, []);
});

test("unusable values fall back to the default and warn with the key name", () => {
    for (const bad of [-1, "10", NaN, Infinity, null, true]) {
        const { value, warned } = warnings({ bellSafeRadius: bad });
        assert.equal(value.bellSafeRadius, 1000, String(bad));
        assert.equal(warned.length, 1);
        assert.match(warned[0], /bellSafeRadius/);
    }
    for (const bad of ["50", NaN, null, {}]) {
        const { value, warned } = warnings({ respawnDust: bad });
        assert.equal(value.respawnDust, 25, String(bad));
        assert.match(warned[0], /respawnDust/);
    }
    for (const bad of ["true", 1, null]) {
        const { value, warned } = warnings({ debugLog: bad });
        assert.equal(value.debugLog, true);
        assert.match(warned[0], /debugLog must be true or false, using true/);
    }
});

test("input that is not a JSON object gives the defaults and a warning", () => {
    for (const bad of [null, [], "text", 5, undefined]) {
        const { value, warned } = warnings(bad);
        assert.deepEqual(value, { ...DEFAULTS });
        assert.equal(warned.length, 1);
    }
});

test("defaultsText is the defaults as JSON, and is what a missing file is created with", () => {
    const text = defaultsText();
    assert.equal(text.endsWith("\n"), true);
    assert.equal(text.charCodeAt(0), 0x7b);
    assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(DEFAULTS)));
    const { files } = setup();
    const created = createSettings({
        path: PATH, readText: () => undefined, writeText: (p, t) => files.set(p, t), clock: () => 0, log: () => { },
    });
    created.get();
    assert.equal(files.get(PATH), text);
});

test("a missing file is created with the defaults and logged once", () => {
    const { files, logs, settings, advance } = setup();
    assert.deepEqual({ ...settings.get() }, { ...DEFAULTS });
    assert.deepEqual(JSON.parse(files.get(PATH)), { ...DEFAULTS });
    assert.equal(logs.length, 1);
    assert.match(logs[0], /wrote the defaults/);
    advance(RELOAD_MS);
    settings.get();
    assert.equal(logs.length, 1);
});

test("a failure to write the defaults is logged and does not throw", () => {
    const logs = [];
    const settings = createSettings({
        path: PATH,
        readText: () => undefined,
        writeText: () => { throw new Error("read only"); },
        clock: () => 0,
        log: (t) => logs.push(t),
    });
    assert.deepEqual({ ...settings.get() }, { ...DEFAULTS });
    assert.match(logs.join("\n"), /could not write the defaults file: read only/);
});

test("an existing file is read, including after a byte order mark", () => {
    const { settings } = setup("\ufeff" + '{"respawnDust": 60, "bellSafeRadius": 250}');
    assert.deepEqual({ ...settings.get() }, { bellSafeRadius: 250, respawnDust: 60, debugLog: true, bellProximityFallback: false, bellExceptions: DEFAULT_BELLS, enemyExceptions: DEFAULT_ENEMIES });
});

test("the file is read at most once per reload interval and changes are picked up after it", () => {
    const { files, settings, advance, reads } = setup('{"respawnDust": 10}');
    assert.equal(settings.get().respawnDust, 10);
    files.set(PATH, '{"respawnDust": 90}');
    advance(RELOAD_MS - 1);
    assert.equal(settings.get().respawnDust, 10);
    assert.equal(reads(), 1);
    advance(1);
    assert.equal(settings.get().respawnDust, 90);
    assert.equal(reads(), 2);
});

test("invalid JSON keeps the previous values and warns only once", () => {
    const { files, logs, settings, advance } = setup('{"respawnDust": 50}');
    assert.equal(settings.get().respawnDust, 50);
    files.set(PATH, "{ not json");
    advance(RELOAD_MS);
    assert.equal(settings.get().respawnDust, 50);
    advance(RELOAD_MS);
    assert.equal(settings.get().respawnDust, 50);
    const bad = logs.filter((t) => /not valid JSON/.test(t));
    assert.equal(bad.length, 1);
});

test("a reading failure is logged and the previous values stay", () => {
    const logs = [];
    let fail = false;
    let now = 0;
    const settings = createSettings({
        path: PATH,
        readText: () => { if (fail) throw new Error("locked"); return '{"respawnDust": 70}'; },
        writeText: () => { },
        clock: () => now,
        log: (t) => logs.push(t),
    });
    assert.equal(settings.get().respawnDust, 70);
    fail = true;
    now += RELOAD_MS;
    assert.equal(settings.get().respawnDust, 70);
    assert.match(logs.join("\n"), /could not read the file: locked/);
});
