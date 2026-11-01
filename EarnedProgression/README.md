# Earned Progression

A script mod for Phantom Blade Zero (plugin for ScriptModLoader). Enemies you kill only stay dead once you have reached a new rest spot. Die before that and they come back.

Offline single-player only. The game build it was last checked against is in `TESTED_BUILD.txt` in the repository root.

## Status
Built and tested offline only, against hand-written stand-ins for the game. It has **not** been run inside the game yet. Treat everything below as intended behaviour until you have seen it work. "What to check on the first run" lists what to look for.

Back up your save before the first run. The mod stores its progress in the save under the section name `EarnedProgression`. What the game does with that section if you later remove the mod is untested.

## The rules
- A normal enemy you kill is **pending**.
- If you die, pending enemies come back, except those within `bellSafeRadius` of the bell you respawn at. Those stay dead and stay pending.
- If you rest at a bell you have never rested at before, every pending kill becomes **permanent**.
- Resting at a bell you already know changes nothing. Pending kills stay pending.
- An enemy that came back and is killed again gives only `respawnDust` percent of its Dust, until it is made permanent.
- If you die and the game puts you at a bell on `bellExceptions`, nothing comes back and every pending kill becomes permanent, as in the base game. This is for fights whose enemies would break if they came back all at once.
- An enemy on `enemyExceptions` is never recorded, so it never comes back and always gives full Dust.
- Bosses, minibosses and the enemies in a boss's arena are never touched. The base game handles them.
- Quitting and reloading does not bring pending enemies back. Only a death does.

## Install
1. Install **ScriptModLoader 1.1.0 or newer** first (see its README). Remove any other mod that replaces `WeaponNormalTextEntry.js`, such as Phantom Souls or Movement Speed. It does not work together with Phantom Souls, which has its own respawn rules.
2. Build this pack: `powershell -ExecutionPolicy Bypass -File EarnedProgression\build.ps1`. The files appear in `EarnedProgression\dist\`.
3. Copy `zzz_PBZ_SMLEarnedProgression_P.pak`, `.utoc` and `.ucas` into `<game folder>\ProjectPBZ\Content\Paks\~mods\`.
4. Add the mod to `ScriptModLoader.json` in the same folder:

```json
{
  "mods": [
    { "id": "EarnedProgression", "enabled": true }
  ]
}
```

5. Start the game. The mod writes `EarnedProgression.json` next to the paks if it is missing.

## Settings
`ProjectPBZ/Content/Paks/~mods/EarnedProgression.json`, re-read about every 2 seconds:

| Key | Default | Meaning |
|---|---|---|
| `bellSafeRadius` | `1000` | Centimetres (1000 = 10 m). Pending kills this close to the respawn bell are not brought back. `0` turns the safe zone off. |
| `respawnDust` | `25` | Percent of its Dust that an enemy gives when it is killed again after coming back. 0 to 100. `100` means full Dust. |
| `debugLog` | `false` | `true` adds a log line for each kill and Dust cut. |
| `bellProximityFallback` | `false` | `true` uses the bell actor nearest to the respawn point when the game has no respawn bell set. Off by default because it can pick the wrong actor. |
| `bellExceptions` | the list `bellExceptionIds` in `Settings.js` | Bell ids. A death that respawns you at one of these brings nothing back and makes pending kills permanent. An id is the game's BellID (logged as `respawn bell <id>`), the bell's actor name, or `<level>\|<actor name>`. Case does not matter. Writing your own list replaces the default one. |
| `enemyExceptions` | 12 spawner ids found safe in play (the list `enemyExceptionIds` in `Settings.js`) | Spawner ids (the name printed after `kill:` in the log). These enemies are never recorded as kills. Writing your own list replaces the default one. |

A value that cannot be used falls back to its default and is logged once. Entries in the two lists are trimmed, blanks are dropped and repeats are ignored.

**Finding ids.** Every death logs `death: respawn bell <BellID> (actor <actor name>)`, and every rest ends with `; bell id <BellID>`. Either id works in `bellExceptions`; the BellID is the one the game itself uses. Turn `debugLog` on to see `kill: <spawner>` lines; that name is the id for `enemyExceptions`. The file is re-read about every 2 seconds, so you can add ids while the game runs.

**How the death bell is found.** The mod does not use the last bell you rested at, because the game can change your current bell without a rest. At each death it asks the game which bell it will respawn you at, with the same two calls the game's own death code makes (`PBZGameSystem.GetSaveActorID`, then `GetSaveActorByID` for the actor). If the game has no bell set (it reports `None`, for example after a map teleport or a story respawn point), the log says `could not tell which bell you respawn at (the game has no respawn bell set)` and the death revives as normal, unless `bellProximityFallback` is on.

## What to check on the first run
Look in `ScriptModLoader.log` (same folder). Every line from this mod starts with `[EarnedProgression]`.

| Check | What you should see |
|---|---|
| The mod loads | `EarnedProgression: loaded`, then `started: bellSafeRadius 1000, respawnDust 25` |
| A level is ready | `ready on <level>: N pending, M known bells` |
| A death | `death: respawn bell <BellID> (actor <name>)`, then `death: N kill(s) coming back, M kept dead near the bell` and `respawn: N spawned` |
| A rest | the usual `rest at ...` line, ending with `; bell id <BellID>` |
| A death at an excepted bell | `death: respawning at an excepted bell (<name>), N kill(s) made permanent` |
| A death where the bell is not found | `death: could not tell which bell you respawn at (<reason>), reviving as normal` |
| A rest | `rest at <level>\|<bell>: new bell, N kill(s) made permanent` or `known bell, nothing changes` |
| Kills (set `debugLog` true) | `kill: <spawner> ...` for each enemy you kill |
| The Dust cut (`debugLog` true) | `dust: <spawner> gave N, M taken back` |

Things only the game can confirm:
- A bell keeps the same name after you restart the game (so "known bell" survives restarts).
- Listing the level's actors finds the bells, and the nearest bell to the respawn point is the one you really respawn at.
- Resting fires exactly once per rest, and not also when you light a bell.
- Enemies in areas that are not loaded come back when those areas load.
- A permanent kill stays dead after you reload the save.
- Spawners that the game never marked dead come back after a death.
- The Dust pop-up shows the reduced amount and no negative pop-up follows.

If the log never mentions `EarnedProgression`, ScriptModLoader did not start the mod. Check the loader's own lines first.

## Files
- `Mods/EarnedProgression.js`: the plugin.
- `Mods/EarnedProgressionLib/`: `Settings`, `Progress`, `DustCut`, `BossNames` (rules, no game objects), `Game`, `Spawners`, `Kills` (the only code that touches game objects).

## Credits
- The approach is based on PVLW's Phantom Souls mod, whose author allows reuse with credit: how enemies are brought back around the death screen, the kill watch, the codex-based boss test, and the Dust pop-up cut. The code is re-implemented here.
- Phantom Blade Zero belongs to S-GAME. This is an unofficial fan-made tool with no affiliation. No game files are included.
- Built with AI assistance (Claude and DeepSeek models).
