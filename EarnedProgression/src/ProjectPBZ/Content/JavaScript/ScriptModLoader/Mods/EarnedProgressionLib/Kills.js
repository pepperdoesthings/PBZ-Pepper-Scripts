"use strict";
// Earned Progression kill watch: notices when the enemy of a normal spawner is killed.
Object.defineProperty(exports, "__esModule", { value: true });

const { TAG_DEAD } = require("./Game");

const LIST_REFRESH_MS = 5000;

// deps: game, spawners, clock() in ms, log(text), onKill(kill).
// kill = { k: spawner actor name, l: level name, x, y, z: spawner position, name }.
function createKills(deps) {
    const game = deps.game;
    const spawners = deps.spawners;
    const log = deps.log || (() => { });
    let list = [];
    let listedAt = -Infinity;
    let seenAlive = new Map();

    // Forget everything seen so far (a new level or a loaded save).
    function reset() {
        list = [];
        listedAt = -Infinity;
        seenAlive = new Map();
    }

    // One look at every normal spawner of the player's level. An enemy that was alive on the
    // previous look and is now a body with the dead tag was killed. One that simply vanished
    // (streamed out, removed far away) is not a kill. Returns how many kills were reported.
    function tick(player) {
        const now = deps.clock();
        if (now - listedAt >= LIST_REFRESH_MS) {
            const ai = game.aiSubsystem(player);
            list = ai ? spawners.classify(ai).normal : [];
            listedAt = now;
        }
        const level = game.levelName(player);
        let reported = 0;
        for (const s of list) {
            if (!game.isAlive(s))
                continue;
            const name = s.GetName();
            const pawn = s.SpawnedAI;
            const alive = game.isAlive(pawn) && !game.hasTag(pawn, TAG_DEAD);
            if (alive) {
                seenAlive.set(name, true);
                continue;
            }
            if (!seenAlive.has(name))
                continue;
            seenAlive.delete(name);
            if (!game.isAlive(pawn))
                continue;
            const where = game.location(s);
            reported++;
            deps.onKill({ k: name, l: level, x: where.x, y: where.y, z: where.z, name });
        }
        if (reported > 0)
            log("kill watch: " + reported + " kill(s) seen on " + level);
        return reported;
    }

    return { tick, reset };
}

exports.LIST_REFRESH_MS = LIST_REFRESH_MS;
exports.createKills = createKills;
