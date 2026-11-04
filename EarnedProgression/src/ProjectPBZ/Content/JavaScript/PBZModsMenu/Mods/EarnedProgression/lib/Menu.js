"use strict";
// Earned Progression's section in Mods Menu (by SLEEP, a separate download). The menu draws the rows
// and saves them to EarnedProgression.txt in ~mods; Settings.js reads that file. Mods Menu takes a
// section through globalThis.PBZModsMenu: push(section) once it runs, or an array it drains at start.
Object.defineProperty(exports, "__esModule", { value: true });

const { DEFAULTS, JSON_FILE, MENU_FILE, MENU_SETTINGS } = require("./Settings");

const MENU_ID = "EarnedProgression";

const ROWS = {
    respawnDust: {
        label: "Respawned Enemy Dust Percentage",
        help: "Percent of its Dust that an enemy gives when it is killed again after coming back. 100 is full Dust.",
    },
    bellSafeRadius: {
        label: "Avoid Spawning near bell",
        help: "Centimetres (1000 is 10 m). Enemies killed this close to the bell you respawn at do not come back. 0 turns it off.",
    },
    newBellMessage: {
        label: "Show Message When Reaching New Bell",
        help: "On: resting at a bell for the first time shows how many enemies will stay dead.",
    },
    debugLog: {
        label: "Debug Log",
        help: "On: EarnedProgression.log gets a line for each kill, with the ids the exception lists need. Off: a quieter log.",
    },
};

const OVERRIDDEN = "Set in " + JSON_FILE + ", which wins over this menu. Remove the key there to use this value.";

// The section as Mods Menu takes it. settings: the object from createSettings().
function describe(settings, version) {
    return {
        id: MENU_ID,
        title: "Earned Progression",
        description: "Enemies you kill only stay dead once you rest at a new bell.",
        version: version,
        file: MENU_FILE,
        settings: MENU_SETTINGS.map((s) => Object.assign(
            { key: s.key, type: s.type, label: ROWS[s.key].label, help: ROWS[s.key].help, default: DEFAULTS[s.key] },
            s.type === "number" ? { min: s.min, max: s.max, step: s.step } : {})),
        // the rows whose value EarnedProgression.json sets get a warning
        check: () => {
            const out = {};
            for (const key of settings.overridden())
                out[key] = OVERRIDDEN;
            return out;
        },
        // the menu has just saved the file: use the new value now, not up to 2 s later
        onChange: () => settings.invalidate(),
    };
}

// Hands the section to Mods Menu. host: the global object. Never throws.
function register(host, settings, version, log) {
    try {
        const section = describe(settings, version);
        const menu = host.PBZModsMenu;
        if (menu && !Array.isArray(menu) && typeof menu.push === "function") {
            menu.push(section);
            const known = typeof menu.value === "function" && menu.value(MENU_ID, MENU_SETTINGS[0].key) !== undefined;
            log(known ? "menu: registered with Mods Menu" : "menu: Mods Menu did not accept the settings section, see PBZModsMenu-log.txt");
            return known;
        }
        if (Array.isArray(menu))
            menu.push(section);
        else
            host.PBZModsMenu = [section];
        log("menu: Mods Menu not running yet, the settings section waits for it");
        return true;
    }
    catch (e) {
        log("menu: could not register: " + (e && e.message ? e.message : e));
        return false;
    }
}

exports.MENU_ID = MENU_ID;
exports.describe = describe;
exports.register = register;
