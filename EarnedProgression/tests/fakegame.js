"use strict";
// Hand-written stand-ins for the parts of the game that Earned Progression touches.
// They prove our own logic; whether the real game behaves the same is only known from a run.

const TAG_DEAD = "CharacterState.Dead";
const TAG_BOSS = "CharacterType.AI.Boss";

function makeAsc() {
    const tags = new Set();
    return { tags, HasMatchingGameplayTag: (t) => tags.has(t.name) };
}

function makePawn(name) {
    return {
        name,
        asc: makeAsc(),
        destroyed: false,
        GetName() { return this.name; },
        K2_DestroyActor() { this.destroyed = true; },
    };
}

function killPawn(pawn) {
    pawn.asc.tags.add(TAG_DEAD);
}

// opts: cls, group, pos {X,Y,Z}, noPawn, bossTag, spawnFn ("Respawn" by default), failSpawn
function makeSpawner(name, opts) {
    const o = opts || {};
    const pawn = o.noPawn ? undefined : makePawn(name + "_pawn");
    if (pawn && o.bossTag)
        pawn.asc.tags.add(TAG_BOSS);
    const s = {
        destroyed: false,
        ShouldSpawn: true,
        SpawnerSaveInfo: { IsAlive: true },
        Class: o.cls || "/Game/Enemies/BP_Grunt.BP_Grunt_C",
        SpawnInfo: o.group ? { MobDomain: "Domain1", MobGroupName: { toString: () => o.group } } : undefined,
        pos: o.pos || { X: 0, Y: 0, Z: 0 },
        spawnCalls: 0,
        SpawnedAI: pawn,
        GetName() { return name; },
        K2_GetActorLocation() { return this.pos; },
    };
    s[o.spawnFn || "Respawn"] = function () {
        if (o.failSpawn)
            throw new Error("cannot spawn");
        this.spawnCalls++;
        this.SpawnedAI = makePawn(name + "_new");
    };
    return s;
}

function makeWorld() {
    const world = {
        level: "LevelA",
        spawners: [],
        map: [],
        sections: new Map(),
        failRead: false,
        failWrite: false,
        noAi: false,
        noCodex: false,
        reviveAt: { X: 0, Y: 0, Z: 0 },
        reviveFails: false,
        saveActorId: "None",
        saveActors: {},
        saveActorFails: false,
        actors: [],
        failActors: false,
        codex: {},
        player: undefined,
        dustChanges: [],
        handlers: [],
        addSpawner(spawner, dead) {
            world.spawners.push(spawner);
            world.map.push({ key: { toString: () => world.level + spawner.GetName() }, info: { IsAlive: !dead } });
            return spawner;
        },
        addActor(name, pos) {
            const actor = { name, pos: pos || { X: 0, Y: 0, Z: 0 }, destroyed: false,
                GetName() { return this.name; }, K2_GetActorLocation() { return this.pos; } };
            world.actors.push(actor);
            return actor;
        },
        mapAlive(name) {
            const e = world.map.find((m) => m.key.toString().endsWith(name));
            return e ? e.info.IsAlive : undefined;
        },
    };

    class JsonObjectWrapper { constructor() { this.text = undefined; } }
    class Vector { }
    class Rotator { }
    class CodexEnemyRow { }

    const saveSystem = {
        GetDirtySectionCopy(id, jsonRef) {
            if (world.failRead)
                throw new Error("read broke");
            const w = new JsonObjectWrapper();
            w.text = world.sections.get(id);
            jsonRef.value = w;
        },
        SaveObjectData(id, wrapper) {
            if (world.failWrite)
                throw new Error("write broke");
            world.sections.set(id, wrapper.text);
        },
    };

    const saveData = {
        GetMaxIndex: () => world.map.length,
        IsValidIndex: (i) => i >= 0 && i < world.map.length,
        GetKey: (i) => world.map[i].key,
        Get: (key) => world.map.find((e) => e.key === key).info,
        Add: (key, info) => { world.map.find((e) => e.key === key).info = info; },
    };
    const ai = {
        GetAllSpawners: () => ({ Num: () => world.spawners.length, Get: (i) => world.spawners[i] }),
        get SpawnerSaveData() { return saveData; },
    };
    const gameSystem = {
        GetReviveTransform(transformRef) {
            if (world.reviveFails)
                throw new Error("no revive point");
            transformRef.value = world.reviveAt;
        },
        GetSaveActorID(idRef) {
            if (world.saveActorFails)
                throw new Error("no save actor");
            idRef.value = world.saveActorId;
        },
        GetSaveActorByID: (id) => world.saveActors[id],
    };
    world.bells = {
        OnInteractBell: {
            Add: (fn) => { world.handlers.push(fn); },
            Remove: (fn) => { world.handlers = world.handlers.filter((h) => h !== fn); },
        },
    };

    const UE = {
        JsonObjectWrapper, Vector, Rotator, CodexEnemyRow,
        KismetSystemLibrary: {
            IsValid: (o) => !!o && !o.destroyed,
            IsValidSoftClassReference: (c) => !!c,
            Conv_SoftClassReferenceToString: (c) => String(c),
            Conv_SoftObjectReferenceToString: (x) => String(x),
        },
        AbilitySystemBlueprintLibrary: { GetAbilitySystemComponent: (a) => a.asc },
        Actor: { StaticClass: () => "actor" },
        GameplayStatics: {
            GetCurrentLevelName: () => world.level,
            GetPlayerCharacter: () => world.player,
            GetAllActorsOfClass(ctx, cls, outRef) {
                if (world.failActors)
                    throw new Error("no actors");
                outRef.value = { Num: () => world.actors.length, Get: (i) => world.actors[i] };
            },
        },
        SubsystemBlueprintLibrary: {
            GetGameInstanceSubsystem: () => saveSystem,
            GetWorldSubsystem: () => world.bells,
        },
        PBZSaveLoadSubsystem: { StaticClass: () => "save" },
        PBZAISaveGameWorldSubsystem: { StaticClass: () => "ai" },
        PBZGameSystem: { StaticClass: () => "gs" },
        BellManager: { StaticClass: () => "bells" },
        JSONUtility: {
            JsonToString(wrapper, okRef, textRef) {
                okRef.value = wrapper.text !== undefined;
                textRef.value = wrapper.text || "";
            },
            ParseStringToJson(text, okRef, outRef) {
                try {
                    JSON.parse(text);
                    const w = new JsonObjectWrapper();
                    w.text = text;
                    outRef.value = w;
                    okRef.value = true;
                }
                catch (e) {
                    okRef.value = false;
                }
            },
        },
        KismetMathLibrary: {
            BreakTransform(transform, locRef) { locRef.value = transform; },
        },
        BuiltinName: {},
        NewArray: () => [],
        DataTable: { Load: () => (world.noCodex ? undefined : {}) },
        DataTableFunctionLibrary: {
            GetDataTableRowNames(table, namesRef) {
                const names = Object.keys(world.codex);
                namesRef.value = { Num: () => names.length, IsValidIndex: (i) => i < names.length, Get: (i) => names[i] };
            },
            Generic_GetDataTableRowFromName(table, name, row) {
                const r = world.codex[name];
                row.EnemyClass = r.cls;
                row.bIsBoss = !!r.boss;
                row.AliasEnemyClasses = r.aliases ? { Num: () => r.aliases.length, Get: (i) => r.aliases[i] } : undefined;
                return true;
            },
        },
    };

    const puerts = { $ref: (v) => ({ value: v }), $unref: (r) => r.value };
    const tsHelper = {
        constructGameplayTag: (name) => ({ name }),
        getWorldSubsystem: (ctx, cls) => (cls === "ai" ? (world.noAi ? undefined : ai) : cls === "gs" ? gameSystem : undefined),
    };

    // classes the plugin hooks, and a player object
    const popups = [];
    class RenewalPlayer {
        constructor() {
            this.controlled = true;
            this.respawnPendingGroup = 0;
            this.asc = makeAsc();
            this.pos = { X: 0, Y: 0, Z: 0 };
        }
        IsPlayerControlled() { return this.controlled; }
        K2_GetActorLocation() { return this.pos; }
        SaveLoad() { }
        PushWidgetAndChangeData() { }
        stepRespawnGroup() { }
        BindBellDelegate() { }
        ChangeDustNum(add, amount) { world.dustChanges.push({ add, amount }); }
    }
    class DustTips {
        enqueueDustChange(dust, target, base) { popups.push([dust, target, base]); }
    }

    const timers = {
        intervals: [],
        timeouts: [],
        setInterval(fn, ms) { const t = { fn, ms, cleared: false }; timers.intervals.push(t); return t; },
        clearInterval(t) { t.cleared = true; },
        setTimeout(fn) { timers.timeouts.push(fn); return fn; },
        runTimeouts() { while (timers.timeouts.length) timers.timeouts.shift()(); },
    };

    return { world, UE, puerts, tsHelper, RenewalPlayer, DustTips, popups, timers };
}

module.exports = { TAG_DEAD, TAG_BOSS, makeAsc, makePawn, killPawn, makeSpawner, makeWorld };
