"use strict";
// Earned Progression game access, part 2: spawners (the game objects that create enemies) and the
// game's save map of which spawners are alive.
Object.defineProperty(exports, "__esModule", { value: true });

const BossNames = require("./BossNames");
const { TAG_BOSS, TAG_DEAD } = require("./Game");

const CODEX_TABLE = "/Game/PBZContent/DataTable/DT_CodexEnemyDataTable.DT_CodexEnemyDataTable";
const SPAWN_FUNCTIONS = ["Respawn", "Spawn", "Refresh"];

// deps: UE, puerts (the game's modules), game (from createGame), log(text).
function createSpawners(deps) {
    const UE = deps.UE;
    const puerts = deps.puerts;
    const game = deps.game;
    const log = deps.log || (() => { });
    let isBossClass;
    const classIsBoss = new Map();

    function bossMatcher() {
        if (isBossClass)
            return isBossClass;
        const rows = [];
        try {
            const table = UE.DataTable.Load(CODEX_TABLE);
            const namesRef = puerts.$ref(UE.NewArray(UE.BuiltinName));
            if (table)
                UE.DataTableFunctionLibrary.GetDataTableRowNames(table, namesRef);
            const names = puerts.$unref(namesRef);
            for (let i = 0; table && i < names.Num(); i++) {
                if (!names.IsValidIndex(i))
                    continue;
                const row = new UE.CodexEnemyRow();
                if (!UE.DataTableFunctionLibrary.Generic_GetDataTableRowFromName(table, names.Get(i), row))
                    continue;
                const refs = [row.EnemyClass];
                const aliases = row.AliasEnemyClasses;
                for (let j = 0; aliases && j < aliases.Num(); j++)
                    refs.push(aliases.Get(j));
                const classes = refs
                    .filter((c) => UE.KismetSystemLibrary.IsValidSoftClassReference(c))
                    .map((c) => UE.KismetSystemLibrary.Conv_SoftClassReferenceToString(c));
                rows.push({ classes, isBoss: !!row.bIsBoss });
            }
        }
        catch (e) {
            log("boss table could not be read: " + (e && e.message ? e.message : e));
        }
        if (rows.length === 0)
            log("boss table is empty, bosses are only recognised by their tag");
        isBossClass = BossNames.createBossMatcher(rows);
        return isBossClass;
    }

    // Spawners that currently exist in the level.
    function loaded(ai) {
        const list = [];
        const all = ai.GetAllSpawners();
        for (let i = 0; all && i < all.Num(); i++) {
            const s = all.Get(i);
            if (game.isAlive(s))
                list.push(s);
        }
        return list;
    }

    function isBoss(spawner) {
        const pawn = spawner.SpawnedAI;
        if (game.isAlive(pawn) && game.hasTag(pawn, TAG_BOSS))
            return true;
        const name = spawner.GetName();
        if (!classIsBoss.has(name))
            classIsBoss.set(name, bossMatcher()(UE.KismetSystemLibrary.Conv_SoftClassReferenceToString(spawner.Class)));
        return classIsBoss.get(name);
    }

    // The mob group a spawner belongs to ("" for none). A boss's arena adds share its group.
    function groupKey(spawner) {
        try {
            const info = spawner.SpawnInfo;
            if (!info)
                return "";
            const domain = UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(info.MobDomain);
            const group = info.MobGroupName ? info.MobGroupName.toString() : "";
            return domain && group && group !== "None" ? domain + "|" + group : "";
        }
        catch (e) {
            return "";
        }
    }

    // Splits the level's spawners: normal ones, and how many were left out as bosses or boss adds.
    function classify(ai) {
        const list = loaded(ai);
        const bossNames = new Set();
        const bossGroups = new Set();
        for (const s of list) {
            if (!isBoss(s))
                continue;
            bossNames.add(s.GetName());
            const g = groupKey(s);
            if (g)
                bossGroups.add(g);
        }
        const normal = list.filter((s) => !bossNames.has(s.GetName()) && !bossGroups.has(groupKey(s)));
        return { normal, skipped: list.length - normal.length };
    }

    // The save map's keys as text (a key is the level name followed by the spawner's actor name).
    function mapIndex(ai) {
        const data = ai.SpawnerSaveData;
        const entries = [];
        for (let i = 0; i < data.GetMaxIndex(); i++) {
            if (!data.IsValidIndex(i))
                continue;
            const key = data.GetKey(i);
            entries.push({ key, text: key.toString() });
        }
        return { data, entries };
    }

    // Sets the alive flag in the save map for the spawners with these actor names.
    // Returns how many entries were changed.
    function setMapAlive(ai, names, alive) {
        const index = mapIndex(ai);
        let changed = 0;
        for (const name of names) {
            const entry = index.entries.find((e) => e.text.endsWith(name));
            if (!entry)
                continue;
            const info = index.data.Get(entry.key);
            if (!info || !!info.IsAlive === alive)
                continue;
            info.IsAlive = alive;
            index.data.Add(entry.key, info);
            changed++;
        }
        return changed;
    }

    function markAlive(spawner) {
        spawner.ShouldSpawn = true;
        const own = spawner.SpawnerSaveInfo;
        if (own && !own.IsAlive) {
            own.IsAlive = true;
            spawner.SpawnerSaveInfo = own;
        }
        if (typeof spawner.SetShouldSpawn === "function") {
            try {
                spawner.SetShouldSpawn(true);
            }
            catch (e) {
                log("SetShouldSpawn failed on " + spawner.GetName() + ": " + (e && e.message ? e.message : e));
            }
        }
    }

    function spawnNow(spawner) {
        for (const fn of SPAWN_FUNCTIONS) {
            if (typeof spawner[fn] !== "function")
                continue;
            try {
                spawner[fn]();
                return fn;
            }
            catch (e) {
                log(fn + " failed on " + spawner.GetName() + ": " + (e && e.message ? e.message : e));
            }
        }
        return "";
    }

    // Brings back the enemy of every loaded spawner whose actor name is in names.
    // A corpse that is still lying there is removed first. Returns { spawned, alreadyAlive, failed }.
    function respawnNamed(ai, names) {
        const wanted = new Set(names);
        const result = { spawned: 0, alreadyAlive: 0, failed: 0 };
        for (const s of loaded(ai)) {
            if (!wanted.has(s.GetName()))
                continue;
            const pawn = s.SpawnedAI;
            const present = game.isAlive(pawn);
            const corpse = present && game.hasTag(pawn, TAG_DEAD);
            if (present && !corpse) {
                result.alreadyAlive++;
                continue;
            }
            if (corpse)
                pawn.K2_DestroyActor();
            markAlive(s);
            if (spawnNow(s))
                result.spawned++;
            else
                result.failed++;
        }
        return result;
    }

    return { loaded, isBoss, groupKey, classify, setMapAlive, respawnNamed };
}

exports.createSpawners = createSpawners;
