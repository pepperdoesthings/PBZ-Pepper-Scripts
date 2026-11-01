"use strict";
// Earned Progression settings: defaults, validation, and a throttled reload of EarnedProgression.json.
Object.defineProperty(exports, "__esModule", { value: true });

// Bells where a death revives nothing. An id is the bell's BellID (as the game names it, logged as
// "respawn bell <id>" at each death) or the bell actor's name. Add one here to except it by default.
const bellExceptionIds = [
    "Brokenbell_FujiDaronngshu",
    "BP_BrokenBell_C_UAID_E89C25A7512053C502_1432849353",
    "BP_WoodenFrameBell_C_2147475504",
    "BP_WoodenFrameBell_C_2147475609",
];

// Spawners whose kills are never recorded, so they never come back. Add a spawner's actor name
// here (it is printed after "kill:" in the log when debugLog is on) to except it by default.
const enemyExceptionIds = [
    "BP_AISpawner_C_UAID_BCFCE704F72584FE02_1365768171",
    "BP_AISpawner_C_UAID_BCFCE704F7250AEA02_1632314381",
    "BP_AISpawner_C_UAID_BCFCE704F7250AEA02_1632345382",
    "BP_AISpawner_C_UAID_BCFCE704F7250BEA02_1118764563",
    "BP_AISpawner_C_UAID_BCFCE704F72584FE02_1378567172",
    "BP_AISpawner_C_UAID_BCFCE704F7250BEA02_1199443566",
    "BP_AISpawner_C_2146533651",
    "BP_AISpawner_C_UAID_BCFCE704F7250BEA02_1143080564",
    "BP_AISpawner_C_2146533915",
    "BP_AISpawner_C_UAID_E89C25A75120CC0003_1580536790",
    "BP_AISpawner_C_UAID_BCFCE704F72584FE02_1400667173",
    "BP_AISpawner_C_UAID_E89C25A751200A0103_1112069752",
];

const DEFAULTS = Object.freeze({
    bellSafeRadius: 1000,
    respawnDust: 25,
    debugLog: false,
    bellProximityFallback: false,
    bellExceptions: Object.freeze([...bellExceptionIds]),
    enemyExceptions: Object.freeze([...enemyExceptionIds]),
});
const RELOAD_MS = 2000;

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function errorText(e) {
    try {
        return e && e.message ? String(e.message) : String(e);
    }
    catch (ignored) {
        return "unprintable error";
    }
}

// A list of ids from the settings file: trimmed text, no blanks, no repeats. Returns undefined
// (after warning) when value is not a list at all.
function idList(key, value, warn) {
    if (!Array.isArray(value)) {
        warn(key + " must be a list of text, using the default list");
        return undefined;
    }
    const out = [];
    let ignored = 0;
    for (const item of value) {
        const text = typeof item === "string" ? item.trim() : "";
        if (!text)
            ignored++;
        else if (!out.includes(text))
            out.push(text);
    }
    if (ignored > 0)
        warn(key + ": " + ignored + " entries ignored because they are not text");
    return out;
}

// Builds a complete settings object from parsed JSON. warn(text) hears about every unusable value.
function normalize(raw, warn) {
    const out = {
        bellSafeRadius: DEFAULTS.bellSafeRadius,
        respawnDust: DEFAULTS.respawnDust,
        debugLog: DEFAULTS.debugLog,
        bellProximityFallback: DEFAULTS.bellProximityFallback,
        bellExceptions: [...DEFAULTS.bellExceptions],
        enemyExceptions: [...DEFAULTS.enemyExceptions],
    };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        warn("the file is not a JSON object, using the defaults");
        return out;
    }
    if ("bellSafeRadius" in raw) {
        if (isNumber(raw.bellSafeRadius) && raw.bellSafeRadius >= 0)
            out.bellSafeRadius = raw.bellSafeRadius;
        else
            warn("bellSafeRadius must be a number of 0 or more, using " + DEFAULTS.bellSafeRadius);
    }
    if ("respawnDust" in raw) {
        if (isNumber(raw.respawnDust))
            out.respawnDust = Math.max(0, Math.min(100, raw.respawnDust));
        else
            warn("respawnDust must be a number, using " + DEFAULTS.respawnDust);
    }
    if ("debugLog" in raw) {
        if (typeof raw.debugLog === "boolean")
            out.debugLog = raw.debugLog;
        else
            warn("debugLog must be true or false, using false");
    }
    if ("bellProximityFallback" in raw) {
        if (typeof raw.bellProximityFallback === "boolean")
            out.bellProximityFallback = raw.bellProximityFallback;
        else
            warn("bellProximityFallback must be true or false, using false");
    }
    for (const key of ["bellExceptions", "enemyExceptions"]) {
        if (key in raw) {
            const list = idList(key, raw[key], warn);
            if (list)
                out[key] = list;
        }
    }
    return out;
}

function defaultsText() {
    return JSON.stringify(DEFAULTS, null, 2) + "\n";
}

// deps: path, readText(path), writeText(path, text), clock() in milliseconds, log(text).
// get() returns the current settings and re-reads the file at most every RELOAD_MS.
function createSettings(deps) {
    let current = normalize({}, () => { });
    let loadedAt = -Infinity;
    let wroteDefaults = false;
    const warned = new Set();

    function warn(text) {
        if (warned.has(text))
            return;
        warned.add(text);
        deps.log("settings: " + text);
    }

    function reload() {
        const text = deps.readText(deps.path);
        if (!text) {
            if (!wroteDefaults) {
                wroteDefaults = true;
                try {
                    deps.writeText(deps.path, defaultsText());
                    deps.log("settings: no file, wrote the defaults to " + deps.path);
                }
                catch (e) {
                    warn("could not write the defaults file: " + errorText(e));
                }
            }
            current = normalize({}, warn);
            return;
        }
        let raw;
        try {
            raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
        }
        catch (e) {
            warn("the file is not valid JSON (" + errorText(e) + "), keeping the previous values");
            return;
        }
        current = normalize(raw, warn);
    }

    function get() {
        const now = deps.clock();
        if (now - loadedAt >= RELOAD_MS) {
            loadedAt = now;
            try {
                reload();
            }
            catch (e) {
                warn("could not read the file: " + errorText(e));
            }
        }
        return current;
    }

    return { get };
}

exports.DEFAULTS = DEFAULTS;
exports.RELOAD_MS = RELOAD_MS;
exports.normalize = normalize;
exports.createSettings = createSettings;
