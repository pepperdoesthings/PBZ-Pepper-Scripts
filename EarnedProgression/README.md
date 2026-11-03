# Earned Progression

A script mod for Phantom Blade Zero (plugin for ScriptModLoader). Enemies you kill only stay dead once you have reached a new rest spot. Die before that and they come back.

Offline single-player only. The game build it was last checked against is in `TESTED_BUILD.txt` in the repository root.

## Status
Version 0.9.1, a pre-release. It runs in the game and works in play-testing. It is not 1.0 yet because the whole game has not been played through with it (see "Known issues"). The version is the `VERSION` constant in `Mods/EarnedProgression.js` and is written to the log when the mod starts. "What to check on the first run" lists what to look for.

Back up your save before the first run. The mod stores its progress in the save under the section name `EarnedProgression`. What the game does with that section if you later remove the mod is untested.

## The rules
- A normal enemy you kill is **pending**.
- If you die, pending enemies come back, except those within `bellSafeRadius` of the bell you respawn at. Those stay dead and stay pending.
- If you rest at a bell you have never rested at before, every pending kill becomes **permanent**.
- Resting at a bell you already know changes nothing. Pending kills stay pending.
- An enemy that came back and is killed again gives only `respawnDust` percent of its Dust, until it is made permanent.
- If you die inside a trial behind a broken bell (wave challenges such as the "Human-Faced Banyan Trees"), nothing comes back and every pending kill becomes permanent, as in the base game. The mod asks the game's bell manager whether that trial state is on (`IsInBrokenBellState`), so no ids are needed.
- If you die and the game puts you at a bell on `bellExceptions`, nothing comes back and every pending kill becomes permanent, as in the base game. This is for fights whose enemies would break if they came back all at once.
- An enemy on `enemyExceptions` is never recorded, so it never comes back and always gives full Dust.
- An enemy whose mob domain matches `domainExceptions` is never recorded either. A pending kill whose domain was added to the list later is dropped at the next death.
- Bosses, minibosses and the enemies in a boss's arena are never touched. The base game handles them.
- Quitting and reloading does not bring pending enemies back. Only a death does.

## Known issues

**Wave challenges.** Some fights are made of groups of enemies that the game releases in stages, one wave after the next. If the mod recorded those kills, a death partway through would bring every earlier wave back at once instead of in stages.

The respawn bells of the first two "Human-Faced Banyan Trees" are on the default `bellExceptions` list, so a death there brings nothing back. Matching their mob domain class (`PBZ_MobDomain_C`) turned out to be the wrong signal: the third tree uses an ordinary `BP_MobDomain_C`, and one level has 17 `PBZ_MobDomain_C` domains. The default `domainExceptions` list is empty for now.

Other wave fights may not use that kind of domain, and the whole game has not been played through yet. Three lists can fix a fight that misbehaves:
- `domainExceptions`: enemies in a matching mob domain are never recorded.
- `bellExceptions`: if the bell you respawn at is on this list, nothing comes back on that death.
- `enemyExceptions`: spawners on this list are never recorded, so they never come back.

**Helping fix it.** The log is on by default. If a fight misbehaves after a death, open `ScriptModLoader.log` right after the death and send the lines from just before and after it: the `kill:` lines for that fight and the `death: respawn bell ...` line. Those hold the ids that need adding. Setting `debugWaveProbe` to `true` also logs each kill's mob domain and group. You can put the ids in your own `EarnedProgression.json` (see "Settings") to fix it on your machine.

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

5. Start the game. `EarnedProgression.json` (the default settings) is built into `dist\` next to the paks, and the mod also writes the same file itself if it is missing. Copying it over an existing one replaces your own settings.

## Settings
`ProjectPBZ/Content/Paks/~mods/EarnedProgression.json`, re-read about every 2 seconds:

| Key | Default | Meaning |
|---|---|---|
| `bellSafeRadius` | `1000` | Centimetres (1000 = 10 m). Pending kills this close to the respawn bell are not brought back. `0` turns the safe zone off. |
| `respawnDust` | `25` | Percent of its Dust that an enemy gives when it is killed again after coming back. 0 to 100. `100` means full Dust. |
| `debugLog` | `true` | `true` adds a log line for each kill and Dust cut. On by default so that the ids needed for the exception lists are always in the log. Set `false` for a quieter log. |
| `debugWaveProbe` | `false` | `true` adds diagnostic `probe:` lines: the level's mob domains, the domain and group of each kill, wave state at each death and respawn, and every item gained with the last kill before it. Read at each level load. Makes the log much longer. |
| `bellProximityFallback` | `false` | `true` uses the bell actor nearest to the respawn point when the game has no respawn bell set. Off by default because it can pick the wrong actor. |
| `useBellExceptionPartialId` | `false` | `true` lets a `bellExceptions` entry match any part of a bell id, so `Brokenbell_` covers every bell whose id contains it. `false` needs the whole id. |
| `bellExceptions` | the list `bellExceptionIds` in `Settings.js` | Bell ids. A death that respawns you at one of these brings nothing back and makes pending kills permanent. An id is the game's BellID (logged as `respawn bell <id>`), the bell's actor name, or `<level>\|<actor name>`. Case does not matter. The whole id must match unless `useBellExceptionPartialId` is on. Writing your own list replaces the default one. |
| `enemyExceptions` | empty (the list `enemyExceptionIds` in `Settings.js`) | Spawner ids (the name printed after `kill:` in the log). These enemies are never recorded as kills. Writing your own list replaces the default one. |
| `domainExceptions` | empty | Parts of mob domain names. A mob domain is the game's area that groups enemies into one fight; a spawner names the domain it belongs to. An entry matches anywhere in the domain's actor name, ignoring case, so a class name covers every domain of that kind. Enemies in a matching domain are never recorded as kills. Not written to the default file, so the built-in list (`domainExceptionIds` in `Settings.js`) is used unless you add the key yourself. Writing your own list replaces the default one. |

A value that cannot be used falls back to its default and is logged once. Entries in the three lists are trimmed, blanks are dropped and repeats are ignored.

**Finding ids.** Every death logs `death: respawn bell <BellID> (actor <actor name>)`, and every rest ends with `; bell id <BellID>`. Either id works in `bellExceptions`; the BellID is the one the game itself uses. With `debugLog` on (the default) every kill logs a `kill: <spawner>` line; that name is the id for `enemyExceptions`. The file is re-read about every 2 seconds, so you can add ids while the game runs.

**How the death bell is found.** The mod does not use the last bell you rested at, because the game can change your current bell without a rest. At each death it asks the game which bell it will respawn you at, with the same two calls the game's own death code makes (`PBZGameSystem.GetSaveActorID`, then `GetSaveActorByID` for the actor). If the game has no bell set (it reports `None`, for example after a map teleport or a story respawn point), the log says `could not tell which bell you respawn at (the game has no respawn bell set)` and the death revives as normal, unless `bellProximityFallback` is on.

## What to check on the first run
Look in `ScriptModLoader.log` (same folder). Every line from this mod starts with `[EarnedProgression]`.

| Check | What you should see |
|---|---|
| The mod loads | `EarnedProgression: loaded`, then `started 0.9.1: bellSafeRadius 1000, respawnDust 25` |
| A level is ready | `ready on <level>: N pending, M known bells` |
| A death | `death: respawn bell <BellID> (actor <name>)`, then `death: N kill(s) coming back, M kept dead near the bell` and `respawn: N spawned` |
| A rest | the usual `rest at ...` line, ending with `; bell id <BellID>` |
| A death in a broken bell trial | `death: in a broken bell trial (respawn bell <id>), N kill(s) made permanent` |
| A death at an excepted bell | `death: respawning at an excepted bell (<name>), N kill(s) made permanent` |
| A death where the bell is not found | `death: could not tell which bell you respawn at (<reason>), reviving as normal` |
| A rest | `rest at <level>\|<bell>: new bell, N kill(s) made permanent` or `known bell, nothing changes` |
| Kills (`debugLog` true, the default) | `kill: <spawner> in domain <name>, pending N` for each enemy you kill (`in no domain` when the spawner has none; `(came back before)` before the count for an enemy that came back) |
| A kill in an excepted domain (`debugLog` true) | `kill: <spawner> is in domain <name> on the domain exception list, not recorded` |
| The Dust cut (`debugLog` true, the default) | `dust: <spawner> gave N, M taken back` |

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
- `Mods/EarnedProgressionLib/`: `Settings`, `Progress`, `DustCut`, `BossNames` (rules, no game objects), `Game`, `Spawners`, `Kills` (the code that touches game objects), and `WaveProbe` (diagnostic logging, only while `debugWaveProbe` is on; it only reads).

## Credits
- The approach is based on PVLW's Phantom Souls mod, whose author allows reuse with credit: how enemies are brought back around the death screen, the kill watch, the codex-based boss test, and the Dust pop-up cut. The code is re-implemented here.
- Phantom Blade Zero belongs to S-GAME. This is an unofficial fan-made tool with no affiliation. No game files are included.
- Built with AI assistance (Claude and DeepSeek models).
