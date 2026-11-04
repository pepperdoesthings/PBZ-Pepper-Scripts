"use strict";
// Earned Progression: entry point loaded by Mods Menu (https://www.nexusmods.com/phantombladezero/mods/149)
// after the game's own MainStart has run.
Object.defineProperty(exports, "__esModule", { value: true });

require("./lib/Boot").boot(
    () => ({ UE: require("ue"), puerts: require("puerts"), setTimeout: (fn, ms) => setTimeout(fn, ms) }),
    require("./EarnedProgression"),
    exports);
