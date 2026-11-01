"use strict";
// Earned Progression boss test: decides from codex rows whether an enemy class is a boss or miniboss.
Object.defineProperty(exports, "__esModule", { value: true });

// "/Game/Dir/BP_Foo_P2.BP_Foo_P2_C" (or the same inside Class'...') becomes "bp_foo_p2".
function shortName(classPath) {
    if (!classPath)
        return "";
    let text = String(classPath);
    const open = text.indexOf("'");
    if (open >= 0) {
        const close = text.indexOf("'", open + 1);
        if (close > open)
            text = text.substring(open + 1, close);
    }
    text = text.toLowerCase();
    const dot = text.lastIndexOf(".");
    const name = dot >= 0 ? text.substring(dot + 1) : text.substring(text.lastIndexOf("/") + 1);
    return name.endsWith("_c") ? name.substring(0, name.length - 2) : name;
}

function stripNumber(name) {
    return name.replace(/_\d+$/, "");
}

// rows: [{ classes: [class path text], isBoss: boolean }], one per codex row (its own class and aliases).
// Returns isBossClass(classPath). A class listed as a boss is a boss; a class listed as a normal
// enemy is not; otherwise it is a boss when it is a numbered variant of a boss, or the base name of one.
function createBossMatcher(rows) {
    const boss = new Set();
    const normal = new Set();
    const bossWithoutNumber = new Set();
    for (const row of rows) {
        for (const path of row.classes) {
            const name = shortName(path);
            if (!name)
                continue;
            (row.isBoss ? boss : normal).add(name);
            if (row.isBoss)
                bossWithoutNumber.add(stripNumber(name));
        }
    }
    return function isBossClass(classPath) {
        const name = shortName(classPath);
        if (!name)
            return false;
        if (boss.has(name))
            return true;
        if (normal.has(name))
            return false;
        if (bossWithoutNumber.has(stripNumber(name)))
            return true;
        for (const b of boss) {
            if (b.startsWith(name + "_"))
                return true;
        }
        return false;
    };
}

exports.shortName = shortName;
exports.createBossMatcher = createBossMatcher;
