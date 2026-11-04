"use strict";
// Starts Earned Progression the way Mods Menu expects: build the api, call start(api), then set
// ready = true on the entry module's exports. Mods Menu reports an entry without ready as failed.
Object.defineProperty(exports, "__esModule", { value: true });

const { createApi, makeIo, errorText } = require("./Api");

// loadGame() returns { UE, puerts, setTimeout } (the game's modules and timer).
// mod is the module with start(api). out is the entry module's exports.
// A failure is written to EarnedProgression.log and then thrown again, so Mods Menu logs it too.
function boot(loadGame, mod, out) {
    let api;
    try {
        const game = loadGame();
        api = createApi(makeIo(game.UE, game.puerts, game.setTimeout));
        mod.start(api);
        out.ready = true;
    }
    catch (e) {
        if (api) {
            api.log("failed to start: " + errorText(e));
            api.flush();
        }
        throw e;
    }
}

exports.boot = boot;
