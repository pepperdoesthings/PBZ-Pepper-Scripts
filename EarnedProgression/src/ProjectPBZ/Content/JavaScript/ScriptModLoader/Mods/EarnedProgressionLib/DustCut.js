"use strict";
// Earned Progression Dust cut: pairs a Dust gain with the kill that caused it and works out how
// much of the gain to take back when the killed enemy had already come back once.
Object.defineProperty(exports, "__esModule", { value: true });

const WINDOW_MS = 2000;

function clampPercent(percent) {
    const n = Number(percent);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
}

// The amount to take back from a gain of change when percent of it is kept (0 = nothing to take).
function takeFor(change, percent) {
    if (!(change > 0))
        return 0;
    const take = Math.round(change * (100 - clampPercent(percent)) / 100);
    return take > 0 ? take : 0;
}

// claim comes from claim(); only a kill of an enemy that had come back, seen on its own, is cut.
function cutFor(claim, change, percent) {
    if (!claim || !claim.again || claim.mixed)
        return 0;
    return takeFor(change, percent);
}

function createDustCut() {
    let kills = [];

    // kill: { at (ms), again (the enemy had come back before), name }
    function noteKill(kill) {
        kills.push({ at: kill.at, again: !!kill.again, name: String(kill.name) });
    }

    // Drops kills older than the window and returns them.
    function expire(now) {
        const dropped = kills.filter((k) => now - k.at >= WINDOW_MS);
        kills = kills.filter((k) => now - k.at < WINDOW_MS);
        return dropped;
    }

    // Pairs a Dust gain with the oldest kill in the window and removes that kill. mixed is true
    // when the window holds both returned and fresh enemies, so whose gain it is is unknown.
    function claim(now) {
        expire(now);
        if (kills.length === 0)
            return undefined;
        const mixed = kills.some((k) => k.again) && kills.some((k) => !k.again);
        const kill = kills.shift();
        return { again: kill.again, mixed, name: kill.name };
    }

    function pending() {
        return kills.length;
    }

    return { noteKill, expire, claim, pending };
}

exports.WINDOW_MS = WINDOW_MS;
exports.takeFor = takeFor;
exports.cutFor = cutFor;
exports.createDustCut = createDustCut;
