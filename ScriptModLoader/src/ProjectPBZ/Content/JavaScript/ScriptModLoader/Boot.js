"use strict";
// ScriptModLoader: connects the loader to the game's file and timer functions and starts it.
Object.defineProperty(exports, "__esModule", { value: true });

const Loader = require("./Loader");

let booted = false;

// UE and puerts are the game's own modules; they are passed in so tests can supply stand-ins.
function makeIo(UE, puerts, requireMod, setTimer) {
    const paths = UE.BlueprintPathsLibrary;
    const modsDir = paths.ConvertRelativePathToFull(paths.ProjectContentDir() + "Paks/~mods", "");
    return {
        modsDir: modsDir,
        now: () => new Date().toISOString().substring(11, 23),
        readText: (path) => {
            if (!paths.FileExists(path))
                return undefined;
            const out = puerts.$ref("");
            UE.EasyCsv.LoadStringFromLocalFile(path, out);
            return puerts.$unref(out) || undefined;
        },
        writeText: (path, text) => {
            UE.EasyCsv.SaveStringToFileWithFullPath(text, path);
        },
        requireMod: requireMod,
        setTimeout: setTimer,
    };
}

function boot() {
    if (booted)
        return;
    booted = true;
    const UE = require("ue");
    const puerts = require("puerts");
    const io = makeIo(UE, puerts, (id) => require("./Mods/" + id), (fn, ms) => setTimeout(fn, ms));
    Loader.createLoader(io).run();
}

exports.makeIo = makeIo;
exports.boot = boot;