"use strict";
// The api object EarnedProgression.js receives in start(api): a log file, method hooks and settings
// files in the game's Content/Paks/~mods folder. Taken from the retired ScriptModLoader (1.1.0).
Object.defineProperty(exports, "__esModule", { value: true });

const LOG_FILE = "EarnedProgression.log";
const LOG_MAX_LINES = 1000;
const FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
// Returned by a before hook to stop the wrapped method (and the after hook) from running.
const SKIP = Object.freeze({ skip: true });

function join(dir, name) {
    return dir.replace(/[\\/]+$/, "") + "/" + name;
}

// Turns anything that was thrown into printable text. It never throws itself.
function errorText(e) {
    try {
        return e && e.message ? String(e.message) : String(e);
    }
    catch (ignored) {
        return "unprintable error";
    }
}

// The game's file and timer functions. UE and puerts are the game's own modules; they are passed
// in so tests can supply stand-ins.
function makeIo(UE, puerts, setTimer) {
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
        setTimeout: setTimer,
    };
}

// Replaces cls.prototype[methodName] with a function that calls before(self, args), then the
// method it replaced, then after(self, args, state) with whatever before returned. The caller
// gets the replaced method's own return value. args is the very array the replaced method is
// then called with, so before may change args[i] to change what the method receives. If before
// returns SKIP, neither the replaced method nor after runs and the caller gets undefined.
// Problems inside before or after are logged one time per method and phase and never reach the
// game. Returns false (and logs) if there is nothing to replace.
function wrap(log, cls, className, methodName, before, after) {
    const proto = cls && cls.prototype;
    const inner = proto && proto[methodName];
    if (typeof inner !== "function") {
        log("hook " + className + "." + methodName + " not found, skipping this hook");
        return false;
    }
    const reported = new Set();
    function reportOnce(phase, e) {
        if (reported.has(phase))
            return;
        reported.add(phase);
        log("hook " + phase + " " + className + "." + methodName + " failed: " + errorText(e));
    }
    proto[methodName] = function (...args) {
        let state;
        if (before) {
            try {
                state = before(this, args);
            }
            catch (e) {
                reportOnce("before", e);
            }
            if (state === SKIP)
                return undefined;
        }
        const result = inner.apply(this, args);
        if (after) {
            try {
                after(this, args, state);
            }
            catch (e) {
                reportOnce("after", e);
            }
        }
        return result;
    };
    return true;
}

// io: { modsDir, now, readText, writeText, setTimeout } (see makeIo).
function createApi(io) {
    const modsDir = io.modsDir;
    let lines = [];
    let timer = null;
    let mergedOldLog = false;

    // The file writer saves a log containing any non-ASCII character as UTF-16, so keep lines ASCII.
    function clean(message) {
        return String(message).replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7e]/g, "?");
    }

    function flush() {
        timer = null;
        try {
            const path = join(modsDir, LOG_FILE);
            if (!mergedOldLog) {
                mergedOldLog = true;
                const old = io.readText(path);
                if (old) {
                    const previous = old.split(/\r?\n/).filter((l) => l).map(clean);
                    lines = previous.concat(["---- new session"], lines).slice(-LOG_MAX_LINES);
                }
            }
            io.writeText(path, lines.join("\r\n") + "\r\n");
        }
        catch (e) {
            // logging must never disturb the game
        }
    }

    // Lines are written on the next timer turn, so a burst of lines costs one file write.
    function log(message) {
        lines.push(io.now() + " " + clean(message));
        if (lines.length > LOG_MAX_LINES)
            lines = lines.slice(-LOG_MAX_LINES);
        if (timer === null)
            timer = io.setTimeout(flush, 0);
    }

    return Object.freeze({
        SKIP: SKIP,
        log: log,
        flush: flush,
        wrap: (cls, className, methodName, before, after) => wrap(log, cls, className, methodName, before, after),
        settingsPath: (fileName) => {
            if (typeof fileName !== "string" || !FILE_PATTERN.test(fileName) || fileName.includes(".."))
                throw new Error("invalid settings file name: " + fileName);
            return join(modsDir, fileName);
        },
        readText: (path) => io.readText(path),
        writeText: (path, text) => io.writeText(path, text),
    });
}

exports.LOG_FILE = LOG_FILE;
exports.SKIP = SKIP;
exports.errorText = errorText;
exports.makeIo = makeIo;
exports.createApi = createApi;
