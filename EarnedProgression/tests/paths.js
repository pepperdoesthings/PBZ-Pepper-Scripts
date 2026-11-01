"use strict";
const path = require("node:path");

const JS = path.join(__dirname, "..", "src", "ProjectPBZ", "Content", "JavaScript");
const MODS = path.join(JS, "ScriptModLoader", "Mods");
const LIB = path.join(MODS, "EarnedProgressionLib");

module.exports = {
    lib: (name) => require(path.join(LIB, name)),
    plugin: () => require(path.join(MODS, "EarnedProgression")),
};
