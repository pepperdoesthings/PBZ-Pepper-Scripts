"use strict";
// Earned Progression settings: defaults, validation, and a throttled reload of two files in ~mods:
// EarnedProgression.txt, which Mods Menu writes (key=value lines), and EarnedProgression.json, which
// the player may write by hand. A key set in the JSON wins over the menu file.
Object.defineProperty(exports, "__esModule", { value: true });

// Bells where a death revives nothing. An id is the bell's BellID (as the game names it, logged as
// "respawn bell <id>" at each death) or the bell actor's name. Add one here to except it by default.
const bellExceptionIds = [
    // "Brokenbell_FujiDaronngshu",
    // "Brokenbell_HouJieDaronngshu",
    // "Brokenbell_DaYingDaronngshu",
];

// Spawners whose kills are never recorded, so they never come back. Add a spawner's actor name
// here (it is printed after "kill:" in the log when debugLog is on) to except it by default.
const enemyExceptionIds = [
    // "BP_AISpawner_C_UAID_BCFCE704F72584FE02_1365768171",
    // "BP_AISpawner_C_UAID_BCFCE704F7250AEA02_1632314381",
    // "BP_AISpawner_C_UAID_BCFCE704F7250AEA02_1632345382",
    // "BP_AISpawner_C_UAID_BCFCE704F7250BEA02_1118764563",
    // "BP_AISpawner_C_UAID_BCFCE704F72584FE02_1378567172",
    // "BP_AISpawner_C_UAID_BCFCE704F7250BEA02_1199443566",
    // "BP_AISpawner_C_2146533651",
    // "BP_AISpawner_C_UAID_BCFCE704F7250BEA02_1143080564",
    // "BP_AISpawner_C_2146533915",
    // "BP_AISpawner_C_UAID_E89C25A75120CC0003_1580536790",
    // "BP_AISpawner_C_UAID_BCFCE704F72584FE02_1400667173",
    // "BP_AISpawner_C_UAID_E89C25A751200A0103_1112069752",
];

// Mob domains (the game's areas that group enemies into fights) whose kills are never recorded. An
// entry matches any part of the domain actor's name, ignoring case, so a class name such as
// "PBZ_MobDomain_C" covers every domain of that kind. The domain is printed after "kill:" in the log.
const domainExceptionIds = [
    // "PBZ_MobDomain_C",
];

const DEFAULTS = Object.freeze({
    bellSafeRadius: 1000,
    respawnDust: 25,
    debugLog: true,
    debugWaveProbe: false,
    bellProximityFallback: false,
    useBellExceptionPartialId: false,
    newBellMessage: true,
    bellExceptions: Object.freeze([...bellExceptionIds]),
    enemyExceptions: Object.freeze([...enemyExceptionIds]),
    domainExceptions: Object.freeze([...domainExceptionIds]),
});
const LISTS = ["bellExceptions", "enemyExceptions", "domainExceptions"];
const SWITCHES = ["debugLog", "debugWaveProbe", "bellProximityFallback", "useBellExceptionPartialId", "newBellMessage"];
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
    const out = { ...DEFAULTS };
    for (const key of LISTS)
        out[key] = [...DEFAULTS[key]];
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
    for (const key of SWITCHES) {
        if (key in raw) {
            if (typeof raw[key] === "boolean")
                out[key] = raw[key];
            else
                warn(key + " must be true or false, using " + DEFAULTS[key]);
        }
    }
    for (const key of LISTS) {
        if (key in raw) {
            const list = idList(key, raw[key], warn);
            if (list)
                out[key] = list;
        }
    }
    return out;
}

// ---- the Mods Menu file
const JSON_FILE = "EarnedProgression.json";
const MENU_FILE = "EarnedProgression.txt";
// The settings Mods Menu shows and writes to MENU_FILE. Ranges and steps match the menu's rows (Menu.js).
const MENU_SETTINGS = Object.freeze([
    Object.freeze({ key: "respawnDust", type: "number", min: 0, max: 100, step: 5 }),
    Object.freeze({ key: "bellSafeRadius", type: "number", min: 0, max: 2000, step: 100 }),
    Object.freeze({ key: "newBellMessage", type: "toggle" }),
    Object.freeze({ key: "debugLog", type: "toggle" }),
]);
const MENU_HEADER = "; Earned Progression settings for Mods Menu. A key set in " + JSON_FILE + " wins over this file.";
// The words Mods Menu reads as a switch (it writes On and Off).
const SWITCH_WORDS = { on: true, true: true, yes: true, 1: true, off: false, false: false, no: false, 0: false };

// The value of key in a Mods Menu file: the first line "key = value", any case, before a ; or # comment.
function readKey(text, key) {
    const re = new RegExp("^[ \\t]*" + key + "[ \\t]*=[ \\t]*([^;#\\r\\n]*?)[ \\t]*(?:[;#].*)?$", "i");
    for (const line of String(text).replace(/^\uFEFF/, "").split(/\r?\n/)) {
        const m = re.exec(line);
        if (m)
            return m[1];
    }
    return undefined;
}

// The menu settings found in a Mods Menu file, as normalize() takes them. Numbers outside the
// menu's range are clamped; anything unusable is left out after a warning.
function parseMenu(text, warn) {
    const out = {};
    for (const s of MENU_SETTINGS) {
        const raw = readKey(text, s.key);
        if (raw === undefined)
            continue;
        const where = MENU_FILE + ": " + s.key;
        if (s.type === "toggle") {
            const b = SWITCH_WORDS[raw.trim().toLowerCase()];
            if (b === undefined)
                warn(where + " must be On or Off, using " + (DEFAULTS[s.key] ? "On" : "Off"));
            else
                out[s.key] = b;
            continue;
        }
        const n = raw.trim() === "" ? NaN : Number(raw.trim().replace(",", "."));
        if (!Number.isFinite(n)) {
            warn(where + " must be a number from " + s.min + " to " + s.max + ", using " + DEFAULTS[s.key]);
            continue;
        }
        const clamped = Math.max(s.min, Math.min(s.max, n));
        if (clamped !== n)
            warn(where + " is outside " + s.min + " to " + s.max + ", using " + clamped);
        out[s.key] = clamped;
    }
    return out;
}

// A JSON value the menu can show as it is: a number in range, or a switch.
function menuCanHold(s, value) {
    if (s.type === "toggle")
        return typeof value === "boolean";
    return isNumber(value) && value >= s.min && value <= s.max;
}

function menuWord(s, value) {
    return s.type === "toggle" ? (value ? "On" : "Off") : String(value);
}

// True when normalize() takes this one value without a warning (a clamped respawnDust counts).
function usable(key, value) {
    let ok = true;
    normalize({ [key]: value }, () => { ok = false; });
    return ok;
}

function parseJson(text) {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

// deps: jsonPath, menuPath, readText(path), writeText(path, text), clock() in milliseconds, log(text).
// get() returns the current settings and re-reads both files at most every RELOAD_MS.
// overridden() lists the menu settings whose value comes from the JSON file.
// invalidate() makes the next get() read the files again (after the menu saved a change).
function createSettings(deps) {
    let current = normalize({}, () => { });
    let loadedAt = -Infinity;
    let checkedMove = false;
    let lastJson = {};
    let jsonKeys = [];
    const warned = new Set();

    function warn(text) {
        if (warned.has(text))
            return;
        warned.add(text);
        deps.log("settings: " + text);
    }

    // Once per start, when there is a JSON file but no menu file yet (an install from before the
    // menu): the menu settings in the JSON go to a new menu file and leave the JSON, so the menu
    // controls them from now on. Values the menu cannot hold stay in the JSON. A failed write
    // leaves the JSON alone. Returns the JSON object to use.
    function moveToMenu(raw) {
        const moved = MENU_SETTINGS.filter((s) => s.key in raw && menuCanHold(s, raw[s.key]));
        if (!moved.length)
            return raw;
        const text = MENU_HEADER + "\r\n" + moved.map((s) => s.key + "=" + menuWord(s, raw[s.key]) + "\r\n").join("");
        try {
            deps.writeText(deps.menuPath, text);
        }
        catch (e) {
            warn("could not write " + MENU_FILE + ", leaving " + JSON_FILE + " as it is: " + errorText(e));
            return raw;
        }
        const rest = { ...raw };
        for (const s of moved)
            delete rest[s.key];
        try {
            deps.writeText(deps.jsonPath, JSON.stringify(rest, null, 2) + "\n");
        }
        catch (e) {
            warn("could not rewrite " + JSON_FILE + ": " + errorText(e));
        }
        deps.log("settings: moved " + moved.map((s) => s.key).join(", ") + " from " + JSON_FILE + " to " + MENU_FILE +
            " (Mods Menu now changes them)");
        return rest;
    }

    // The JSON object to use: the file's, or its last good one while it does not parse.
    function readJson() {
        const text = deps.readText(deps.jsonPath);
        if (!text)
            return { raw: {}, fresh: false };
        let raw;
        try {
            raw = parseJson(text);
        }
        catch (e) {
            warn("the file " + JSON_FILE + " is not valid JSON (" + errorText(e) + "), keeping its previous values");
            return { raw: lastJson, fresh: false };
        }
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            warn("the file " + JSON_FILE + " is not a JSON object, ignoring it");
            return { raw: {}, fresh: false };
        }
        return { raw, fresh: true };
    }

    function reload() {
        let { raw, fresh } = readJson();
        let menuText = deps.readText(deps.menuPath);
        if (!checkedMove) {
            checkedMove = true;
            if (fresh && !menuText) {
                raw = moveToMenu(raw);
                menuText = deps.readText(deps.menuPath);
            }
        }
        lastJson = raw;
        // the menu's values over the defaults, then every usable JSON value over those
        const merged = normalize(menuText ? parseMenu(menuText, warn) : {}, warn);
        const json = normalize(raw, warn);
        const won = Object.keys(DEFAULTS).filter((key) => key in raw && usable(key, raw[key]));
        for (const key of won)
            merged[key] = json[key];
        jsonKeys = MENU_SETTINGS.map((s) => s.key).filter((key) => won.includes(key));
        current = merged;
    }

    function get() {
        const now = deps.clock();
        if (now - loadedAt >= RELOAD_MS) {
            loadedAt = now;
            try {
                reload();
            }
            catch (e) {
                warn("could not read the settings files: " + errorText(e));
            }
        }
        return current;
    }

    return {
        get,
        overridden: () => (get(), [...jsonKeys]),
        invalidate: () => { loadedAt = -Infinity; },
    };
}

exports.DEFAULTS = DEFAULTS;
exports.RELOAD_MS = RELOAD_MS;
exports.JSON_FILE = JSON_FILE;
exports.MENU_FILE = MENU_FILE;
exports.MENU_SETTINGS = MENU_SETTINGS;
exports.normalize = normalize;
exports.createSettings = createSettings;
