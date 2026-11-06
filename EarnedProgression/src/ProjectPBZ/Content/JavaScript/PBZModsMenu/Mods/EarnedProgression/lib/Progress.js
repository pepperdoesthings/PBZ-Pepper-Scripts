"use strict";
// Earned Progression rules on plain data: which kills are pending, which come back on a death,
// and what a bell banks. Functions change the state object they are given and say what they did.
Object.defineProperty(exports, "__esModule", { value: true });

const VERSION = 1;

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

// A whole number 0 or more: a New Game Plus cycle as the game counts it (0 = first playthrough).
function isCycle(value) {
    return Number.isInteger(value) && value >= 0;
}

// cycle: the New Game Plus cycle the state belongs to, or left out when it is not known.
function emptyState(cycle) {
    if (isCycle(cycle))
        return { version: VERSION, cycle, pending: [], again: [], bells: [] };
    return { version: VERSION, pending: [], again: [], bells: [] };
}

// A kill: k = key of the spawner in the game's save map, l = level name, x/y/z = spawner position,
// and t = true when the kill may have been made in a broken bell trial (the state could not be read).
function validKill(e) {
    return !!e && typeof e === "object" && typeof e.k === "string" && e.k.length > 0 &&
        typeof e.l === "string" && isNumber(e.x) && isNumber(e.y) && isNumber(e.z);
}

// The stored form of a valid kill: only known fields, and the mark only when it is true.
function entryOf(e) {
    const entry = { k: e.k, l: e.l, x: e.x, y: e.y, z: e.z };
    if (e.t === true)
        entry.t = true;
    return entry;
}

// raw is whatever the save held for this mod; cycle is the game's New Game Plus cycle now, or
// undefined when it could not be read. Returns { state, problem, cycleReset }: problem is a sentence
// when the saved data had to be replaced or trimmed; cycleReset is { from, to } when the data was
// made in another cycle and was dropped (a new cycle resets the world, so its kills and bells no
// longer mean anything). Only a New Game Plus cycle (above 0) drops data: in the first playthrough
// nothing is dropped. Data saved without a cycle counts as cycle 0. With no known cycle the data is
// kept with whatever cycle it had.
function load(raw, cycle) {
    const known = isCycle(cycle);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length === 0)
        return { state: emptyState(cycle) };
    if (raw.version !== VERSION)
        return { state: emptyState(cycle), problem: "saved data has version " + String(raw.version).slice(0, 20) + ", expected " + VERSION + ", starting empty" };
    if (!Array.isArray(raw.pending) || !Array.isArray(raw.again) || !Array.isArray(raw.bells))
        return { state: emptyState(cycle), problem: "saved data is missing a list, starting empty" };
    const savedCycle = isCycle(raw.cycle) ? raw.cycle : 0;
    if (known && cycle > 0 && savedCycle !== cycle)
        return { state: emptyState(cycle), cycleReset: { from: savedCycle, to: cycle } };
    const state = emptyState(known ? cycle : (isCycle(raw.cycle) ? raw.cycle : undefined));
    let dropped = 0;
    const seenKills = new Set();
    for (const e of raw.pending) {
        if (validKill(e) && !seenKills.has(e.k)) {
            seenKills.add(e.k);
            state.pending.push(entryOf(e));
        }
        else
            dropped++;
    }
    for (const [from, to] of [[raw.again, state.again], [raw.bells, state.bells]]) {
        for (const text of from) {
            if (typeof text === "string" && text.length > 0 && !to.includes(text))
                to.push(text);
            else
                dropped++;
        }
    }
    return dropped > 0 ? { state, problem: dropped + " invalid or repeated saved entries dropped" } : { state };
}

// A drop of saved progress from another cycle, as one log line.
function cycleResetText(reset) {
    return "load: saved progress is from cycle " + reset.from + ", now cycle " + reset.to + ", starting empty";
}

// Adds a kill to pending. Returns false (and changes nothing) for a bad or already pending kill.
function recordKill(state, kill) {
    if (!validKill(kill) || state.pending.some((e) => e.k === kill.k))
        return false;
    state.pending.push(entryOf(kill));
    return true;
}

function isAgain(state, key) {
    return state.again.includes(key);
}

// ctx: level (current level name), center ({x,y,z} of the respawn bell or missing), radius (cm).
function inSafeZone(entry, ctx) {
    if (!(ctx.radius > 0) || !ctx.center || entry.l !== ctx.level)
        return false;
    const dx = entry.x - ctx.center.x;
    const dy = entry.y - ctx.center.y;
    const dz = entry.z - ctx.center.z;
    return dx * dx + dy * dy + dz * dz <= ctx.radius * ctx.radius;
}

// A death: every pending kill outside the safe zone comes back (it leaves pending and joins
// again); kills inside the safe zone stay pending. Returns { revive, keep }.
function splitForDeath(state, ctx) {
    const revive = [];
    const keep = [];
    for (const e of state.pending)
        (inSafeZone(e, ctx) ? keep : revive).push(e);
    state.pending = keep;
    for (const e of revive) {
        if (!state.again.includes(e.k))
            state.again.push(e.k);
    }
    return { revive, keep };
}

// Makes every pending kill permanent: they leave pending and again. Returns the kills made permanent.
function bankAll(state) {
    const banked = state.pending;
    state.pending = [];
    const keys = new Set(banked.map((e) => e.k));
    state.again = state.again.filter((k) => !keys.has(k));
    return banked;
}

// Makes the marked pending kills (t: true) permanent: they leave pending and again. The rest stay
// pending. Returns the kills made permanent.
function bankMarked(state) {
    const banked = state.pending.filter((e) => e.t === true);
    state.pending = state.pending.filter((e) => e.t !== true);
    const keys = new Set(banked.map((e) => e.k));
    state.again = state.again.filter((k) => !keys.has(k));
    return banked;
}

// A rest at bellId. At a bell not seen before, every pending kill becomes permanent (it leaves
// pending and again) and the bell is remembered. At a known bell nothing changes.
// Returns { newBell, banked }.
function bankAtBell(state, bellId) {
    if (state.bells.includes(bellId))
        return { newBell: false, banked: [] };
    const banked = bankAll(state);
    state.bells.push(bellId);
    return { newBell: true, banked };
}

// True when list (an array of text) holds any of the candidate names.
function isListed(list, ...candidates) {
    if (!Array.isArray(list))
        return false;
    return candidates.some((c) => typeof c === "string" && c.length > 0 && list.includes(c));
}

// isListed ignoring case. Unreal names (FName) ignore case, and the game compares bell ids in lower case.
// An optional first argument { partial: true } makes an entry match anywhere inside a candidate.
function isListedAnyCase(list, ...args) {
    if (!Array.isArray(list))
        return false;
    const hasOptions = args.length > 0 && args[0] !== null && typeof args[0] === "object";
    const partial = hasOptions && args[0].partial === true;
    const candidates = hasOptions ? args.slice(1) : args;
    const lower = list.map((x) => String(x).toLowerCase()).filter((x) => x.length > 0);
    return candidates.some((c) => {
        if (typeof c !== "string" || c.length === 0)
            return false;
        const name = c.toLowerCase();
        return partial ? lower.some((e) => name.includes(e)) : lower.includes(name);
    });
}

// Removes the listed spawners from pending (and from again). Returns how many pending kills went.
function dropListed(state, list) {
    if (!Array.isArray(list) || list.length === 0)
        return 0;
    const before = state.pending.length;
    state.pending = state.pending.filter((e) => !list.includes(e.k));
    state.again = state.again.filter((k) => !list.includes(k));
    return before - state.pending.length;
}

// bells: [{name, x, y, z}]. The closest `count` bells to center, nearest first, as { name, distance }.
function rankBells(bells, center, count) {
    if (!center || !Array.isArray(bells))
        return [];
    return bells
        .map((b) => {
            const dx = b.x - center.x;
            const dy = b.y - center.y;
            const dz = b.z - center.z;
            return { name: b.name, distance: Math.sqrt(dx * dx + dy * dy + dz * dz) };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count);
}

// The bell closest to center, if it is within maxDistance (cm). Returns { name, distance } or undefined.
function nearestBell(bells, center, maxDistance) {
    const closest = rankBells(bells, center, 1)[0];
    return closest && closest.distance <= maxDistance ? closest : undefined;
}

exports.VERSION = VERSION;
exports.emptyState = emptyState;
exports.load = load;
exports.cycleResetText = cycleResetText;
exports.recordKill = recordKill;
exports.isAgain = isAgain;
exports.inSafeZone = inSafeZone;
exports.splitForDeath = splitForDeath;
exports.bankAll = bankAll;
exports.bankMarked = bankMarked;
exports.bankAtBell = bankAtBell;
exports.isListed = isListed;
exports.isListedAnyCase = isListedAnyCase;
exports.dropListed = dropListed;
exports.rankBells = rankBells;
exports.nearestBell = nearestBell;
