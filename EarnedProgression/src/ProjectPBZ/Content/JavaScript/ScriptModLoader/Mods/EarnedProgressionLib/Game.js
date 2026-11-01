"use strict";
// Earned Progression game access, part 1: small primitives over the game's own objects.
// UE and puerts are the game's modules and tsHelper is its Library/TsHelper; all three are passed
// in so tests can supply stand-ins.
Object.defineProperty(exports, "__esModule", { value: true });

const SECTION_ID = "EarnedProgression";
const TAG_BOSS = "CharacterType.AI.Boss";
const TAG_DEAD = "CharacterState.Dead";

function createGame(deps) {
    const UE = deps.UE;
    const puerts = deps.puerts;
    const tsHelper = deps.tsHelper;

    function isAlive(obj) {
        if (!obj)
            return false;
        try {
            return UE.KismetSystemLibrary.IsValid(obj);
        }
        catch (e) {
            return false;
        }
    }

    function hasTag(actor, tagName) {
        try {
            const asc = UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor);
            return !!asc && asc.HasMatchingGameplayTag(tsHelper.constructGameplayTag(tagName));
        }
        catch (e) {
            return false;
        }
    }

    function levelName(ctx) {
        return UE.GameplayStatics.GetCurrentLevelName(ctx, true);
    }

    function location(actor) {
        const v = actor.K2_GetActorLocation();
        return { x: v.X, y: v.Y, z: v.Z };
    }

    function player(ctx) {
        return UE.GameplayStatics.GetPlayerCharacter(ctx, 0);
    }

    function saveSystem(ctx) {
        return UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(ctx, UE.PBZSaveLoadSubsystem.StaticClass());
    }

    // { ok: true, data } where data is the saved object or undefined when nothing was saved yet;
    // { ok: false, error } when the save could not be read.
    function readSection(ctx) {
        try {
            const jsonRef = puerts.$ref(new UE.JsonObjectWrapper());
            saveSystem(ctx).GetDirtySectionCopy(SECTION_ID, jsonRef);
            const okRef = puerts.$ref(false);
            const textRef = puerts.$ref("");
            UE.JSONUtility.JsonToString(puerts.$unref(jsonRef), okRef, textRef);
            const text = puerts.$unref(textRef);
            if (!puerts.$unref(okRef) || !text)
                return { ok: true, data: undefined };
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                return { ok: true, data: undefined };
            return { ok: true, data: parsed };
        }
        catch (e) {
            return { ok: false, error: e && e.message ? String(e.message) : String(e) };
        }
    }

    // Stored with the next real save. A JSON null crashes the game's serializer, so nulls are dropped.
    function writeSection(ctx, root) {
        try {
            const okRef = puerts.$ref(false);
            const jsonRef = puerts.$ref(new UE.JsonObjectWrapper());
            UE.JSONUtility.ParseStringToJson(JSON.stringify(root, (k, v) => (v === null ? undefined : v)), okRef, jsonRef);
            if (!puerts.$unref(okRef))
                return false;
            saveSystem(ctx).SaveObjectData(SECTION_ID, puerts.$unref(jsonRef));
            return true;
        }
        catch (e) {
            return false;
        }
    }

    function aiSubsystem(ctx) {
        return tsHelper.getWorldSubsystem(ctx, UE.PBZAISaveGameWorldSubsystem.StaticClass());
    }

    function bellManager(ctx) {
        return UE.SubsystemBlueprintLibrary.GetWorldSubsystem(ctx, UE.BellManager.StaticClass());
    }

    // Where the player comes back after dying (the bell), or undefined when the game will not say.
    function reviveCenter(ctx) {
        try {
            const system = tsHelper.getWorldSubsystem(ctx, UE.PBZGameSystem.StaticClass());
            const transformRef = puerts.$ref(undefined);
            const controllerRef = puerts.$ref(undefined);
            system.GetReviveTransform(transformRef, controllerRef);
            const locationRef = puerts.$ref(new UE.Vector());
            const rotationRef = puerts.$ref(new UE.Rotator());
            const scaleRef = puerts.$ref(new UE.Vector());
            UE.KismetMathLibrary.BreakTransform(puerts.$unref(transformRef), locationRef, rotationRef, scaleRef);
            const v = puerts.$unref(locationRef);
            return { x: v.X, y: v.Y, z: v.Z };
        }
        catch (e) {
            return undefined;
        }
    }

    // The bell the game will respawn the player at, read the way the game's own death code reads it:
    // PBZGameSystem.GetSaveActorID gives the bell's BellID, GetSaveActorByID gives the bell actor.
    // { ok: true, id, actorName } where id is "" when no bell is set (the game uses "None"), and
    // actorName is undefined when the actor is not loaded; or { ok: false, error }.
    function respawnBell(ctx) {
        try {
            const system = tsHelper.getWorldSubsystem(ctx, UE.PBZGameSystem.StaticClass());
            const idRef = puerts.$ref("");
            system.GetSaveActorID(idRef);
            const raw = puerts.$unref(idRef);
            const id = raw === undefined || raw === null ? "" : String(raw);
            if (id === "" || id === "None")
                return { ok: true, id: "", actorName: undefined };
            const actor = system.GetSaveActorByID(id);
            return { ok: true, id, actorName: isAlive(actor) ? actor.GetName() : undefined };
        }
        catch (e) {
            return { ok: false, error: e && e.message ? String(e.message) : String(e) };
        }
    }

    // Every actor in the level whose name contains "Bell" but not "BellGuideLine" (the guide-line
    // actors sit near the bells and would otherwise be picked as the nearest bell), with its position.
    // { ok: true, list: [{name, x, y, z}] } or { ok: false, error }.
    function listBells(ctx) {
        try {
            const outRef = puerts.$ref(UE.NewArray(UE.Actor));
            UE.GameplayStatics.GetAllActorsOfClass(ctx, UE.Actor.StaticClass(), outRef);
            const actors = puerts.$unref(outRef);
            const list = [];
            for (let i = 0; actors && i < actors.Num(); i++) {
                const actor = actors.Get(i);
                if (!isAlive(actor))
                    continue;
                const name = actor.GetName();
                if (!/bell/i.test(name) || /bellguideline/i.test(name))
                    continue;
                const where = location(actor);
                list.push({ name, x: where.x, y: where.y, z: where.z });
            }
            return { ok: true, list };
        }
        catch (e) {
            return { ok: false, error: e && e.message ? String(e.message) : String(e) };
        }
    }

    // Takes amount of Dust away from the player.
    function takeDust(playerActor, amount) {
        playerActor.ChangeDustNum(false, amount);
    }

    return { isAlive, hasTag, levelName, location, player, readSection, writeSection, aiSubsystem, bellManager, reviveCenter, respawnBell, listBells, takeDust };
}

exports.SECTION_ID = SECTION_ID;
exports.TAG_BOSS = TAG_BOSS;
exports.TAG_DEAD = TAG_DEAD;
exports.createGame = createGame;
