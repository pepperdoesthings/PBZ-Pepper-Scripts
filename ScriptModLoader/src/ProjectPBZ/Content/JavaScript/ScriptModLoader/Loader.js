"use strict";
// ScriptModLoader: loads the script mods listed in ScriptModLoader.json.
Object.defineProperty(exports, "__esModule", { value: true });

const VERSION = "1.1.0";
// Returned by a before hook to stop the wrapped method (and the after hook) from running.
const SKIP = Object.freeze({ skip: true });
const REGISTRY_FILE = "ScriptModLoader.json";
const LOG_FILE = "ScriptModLoader.log";
const LOG_MAX_LINES = 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

function join(dir, name) {
    return dir.replace(/[\\/]+$/, "") + "/" + name;
}

function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
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

// Printable form of a registry id for the log, cut to 60 characters. It never throws itself.
function idText(id) {
    try {
        return String(JSON.stringify(id)).slice(0, 60);
    }
    catch (ignored) {
        return "unprintable id";
    }
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

function createLoader(io) {
    const modsDir = io.modsDir;
    let lines = [];
    let timer = null;
    let mergedOldLog = false;

    // The file writer saves a log containing any non-ASCII character as UTF-16, so keep lines ASCII.
    function clean(message) {
        return String(message).replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7e]/g, "?");
    }

    function log(message) {
        lines.push(io.now() + " " + clean(message));
        if (lines.length > LOG_MAX_LINES)
            lines = lines.slice(-LOG_MAX_LINES);
        if (timer === null)
            timer = io.setTimeout(flush, 0);
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

    // Returns the registry's "mods" array, or an empty array (with a log line) when it cannot be used.
    function readRegistry() {
        const path = join(modsDir, REGISTRY_FILE);
        const text = io.readText(path);
        if (!text) {
            log("no registry file at " + path + ", nothing to load");
            return [];
        }
        let data;
        try {
            data = JSON.parse(stripBom(text));
        }
        catch (e) {
            log("registry is not valid JSON: " + errorText(e));
            return [];
        }
        if (!data || !Array.isArray(data.mods)) {
            log('registry has no "mods" list, nothing to load');
            return [];
        }
        return data.mods;
    }

    // The object a plugin receives in start(api).
    function buildApi(id) {
        const pluginLog = (message) => log("[" + id + "] " + message);
        return Object.freeze({
            loaderVersion: VERSION,
            SKIP: SKIP,
            log: pluginLog,
            wrap: (cls, className, methodName, before, after) => wrap(pluginLog, cls, className, methodName, before, after),
            settingsPath: (fileName) => {
                if (typeof fileName !== "string" || !FILE_PATTERN.test(fileName) || fileName.includes(".."))
                    throw new Error("invalid settings file name: " + fileName);
                return join(modsDir, fileName);
            },
            readText: (path) => io.readText(path),
            writeText: (path, text) => io.writeText(path, text),
        });
    }

    // Loads every enabled registry entry in order. One failing plugin never stops the next.
    function run() {
        const entries = readRegistry();
        const result = { loaded: 0, skipped: 0, failed: 0 };
        const seen = new Set();
        log("ScriptModLoader " + VERSION + ": " + entries.length + " registry entries");
        for (const entry of entries) {
            const id = entry && entry.id;
            if (typeof id !== "string" || !ID_PATTERN.test(id)) {
                log("skipped an entry with an invalid id: " + idText(id));
                result.skipped++;
                continue;
            }
            if (entry.enabled === false) {
                log(id + ": skipped (disabled)");
                result.skipped++;
                continue;
            }
            if (seen.has(id)) {
                log(id + ": skipped (duplicate entry)");
                result.skipped++;
                continue;
            }
            seen.add(id);
            try {
                const mod = io.requireMod(id);
                if (!mod || typeof mod.start !== "function")
                    throw new Error("module has no start(api) function");
                mod.start(buildApi(id));
                log(id + ": loaded");
                result.loaded++;
            }
            catch (e) {
                log(id + ": failed: " + errorText(e));
                result.failed++;
            }
        }
        log("done: " + result.loaded + " loaded, " + result.skipped + " skipped, " + result.failed + " failed");
        return result;
    }

    return { log, flush, readRegistry, buildApi, run };
}

exports.VERSION = VERSION;
exports.SKIP = SKIP;
exports.createLoader = createLoader;