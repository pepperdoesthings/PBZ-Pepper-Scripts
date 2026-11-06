# Earned Progression

A script mod for Phantom Blade Zero (needs [Mods Menu](https://www.nexusmods.com/phantombladezero/mods/149) 0.5.4 or newer). Enemies you kill only stay dead once you have reached a new rest spot. Die before that and they come back.

Offline single-player only. The game build it was last checked against is in `TESTED_BUILD.txt` in the repository root.

## Status
Version 0.10.2, a pre-release. It runs in the game and works in play-testing. It is not 1.0 yet because the whole game has not been played through with it (see "Known issues"). The version is the `VERSION` constant in `EarnedProgression.js` and is written to the log when the mod starts. "What to check on the first run" lists what to look for.

Back up your save before the first run. The mod stores its progress in the save under the section name `EarnedProgression`. What the game does with that section if you later remove the mod is untested.

## The rules
- A normal enemy you kill is **pending**.
- If you die, pending enemies come back, except those within `bellSafeRadius` of the bell you respawn at. Those stay dead and stay pending.
- If you rest at a bell you have never rested at before, every pending kill becomes **permanent**. The game shows "New bell reached. N enemies will stay dead." (turn it off with `newBellMessage`).
- Resting at a bell you already know changes nothing. Pending kills stay pending.
- An enemy that came back and is killed again gives only `respawnDust` percent of its Dust, until it is made permanent.
- An enemy killed inside a trial behind a broken bell (wave challenges such as the "Human-Faced Banyan Trees") is never recorded and gives full Dust: the game resets the trial itself when you die. The mod asks the game's bell manager whether that trial state is on (`IsInBrokenBellState`) at each kill, so no ids are needed. Kills made before the trial stay pending and come back on a death as usual.
- If the trial state cannot be read at a kill, the kill is recorded with a mark. A death inside a trial makes the marked kills permanent.
- If you die and the game puts you at a bell on `bellExceptions`, nothing comes back and every pending kill becomes permanent, as in the base game. The list is empty by default. It is for fights the trial check does not cover, whose enemies would break if they came back all at once.
- An enemy on `enemyExceptions` is never recorded, so it never comes back and always gives full Dust.
- An enemy whose mob domain matches `domainExceptions` is never recorded either. A pending kill whose domain was added to the list later is dropped at the next death.
- Bosses, minibosses and the enemies in a boss's arena are never touched. The base game handles them.
- Quitting and reloading does not bring pending enemies back. Only a death does.
- New Game Plus: the mod's saved progress (pending kills, enemies that came back, known bells) belongs to the playthrough it was made in, which the game calls a cycle (0 is the first playthrough). On entering a level in a New Game Plus cycle with progress from another cycle, the mod starts empty, so every bell counts as new again. In the first playthrough nothing is ever dropped. Progress saved before 0.10.2 counts as cycle 0. If the game will not say which cycle it is, the progress is kept.

## Known issues

**Wave challenges.** Some fights are made of groups of enemies that the game releases in stages, one wave after the next. If the mod recorded those kills, a death partway through would bring every earlier wave back at once instead of in stages.

Since 0.9.2, trials behind a broken bell, such as the "Human-Faced Banyan Trees", are found through the game's own trial state (see "The rules"), so their kills are never recorded. This was checked in play at the third Banyan Tree. Earlier attempts matched the respawn bell ids or the mob domain class (`PBZ_MobDomain_C`); the class turned out to be the wrong signal, as the third tree uses an ordinary `BP_MobDomain_C`. The default `bellExceptions` list is now empty.

Since 0.10.2 the default `domainExceptions` list holds one fight: the six-wave domain near bell `Bell_XM_012` in `PBZ_Ximeng_WP`. There the mod brought every killed wave back at once while the game went on to its next wave, and the game's wave order cannot be reset from a script.

Wave fights that are not broken bell trials may still misbehave, and the whole game has not been played through yet. Three lists can fix a fight that misbehaves:
- `domainExceptions`: enemies in a listed mob domain are never recorded.
- `bellExceptions`: if the bell you respawn at is on this list, nothing comes back on that death.
- `enemyExceptions`: spawners on this list are never recorded, so they never come back.

**Helping fix it.** The log is on by default. If a fight misbehaves after a death, open `EarnedProgression.log` (in `~mods`) right after the death and send the lines from just before and after it: the `kill:` lines for that fight and the `death: respawn bell ...` line. Those hold the ids that need adding. Setting `debugWaveProbe` to `true` also logs each kill's mob domain and group. You can put the ids in an `EarnedProgression.json` of your own (see "Settings") to fix it on your machine.

## Install
1. Install **Mods Menu 0.5.4 or newer** from its [Nexus page](https://www.nexusmods.com/phantombladezero/mods/149), following its README. It does not work together with Phantom Souls, which has its own respawn rules.
2. Build: `powershell -ExecutionPolicy Bypass -File EarnedProgression\build.ps1`. The files appear in `EarnedProgression\dist\ProjectPBZ\`.
3. Copy that `ProjectPBZ` folder into the game's root folder. This adds `ProjectPBZ\Content\JavaScript\PBZModsMenu\Mods\EarnedProgression\`. It holds no settings file, so copying never replaces yours.
4. Start the game. `EarnedProgression.log` appears in `~mods`.

**Updating from 0.9.x:** delete `zzz_PBZ_ScriptModLoader_P` and `zzz_PBZ_SMLEarnedProgression_P` (`.pak`, `.utoc`, `.ucas` each), `ScriptModLoader.json` and `ScriptModLoader.log` from `~mods`. Since game build 26367565 the old loader stops the game at the title screen. Keep `EarnedProgression.json`: on the first start the mod moves its four menu settings into `EarnedProgression.txt` (see "Settings"). Your save carries over.

**Turning it off** without deleting it: add `EarnedProgression=0` under `[Mods]` in `~mods\PBZModsMenuLoader.txt` (Mods Menu's switch file).

## Settings

**In the game.** Settings > the Mods Menu tab (two gears; F9 during play) > Earned Progression has four rows. A change applies at once, no restart:

| Row | Key | Range |
|---|---|---|
| Respawned Enemy Dust Percentage | `respawnDust` | 0 to 100, in steps of 5 |
| Avoid Spawning near bell | `bellSafeRadius` | 0 to 2000 cm, in steps of 100 |
| Show Message When Reaching New Bell | `newBellMessage` | On / Off |
| Debug Log | `debugLog` | On / Off |

Mods Menu saves them to `ProjectPBZ/Content/Paks/~mods/EarnedProgression.txt` (`key=value` lines; you can edit it by hand too). The file appears the first time you change a row.

**By hand.** Every setting below can be set in `ProjectPBZ/Content/Paks/~mods/EarnedProgression.json`. The mod never creates this file; write it yourself, with only the keys you want, for example `{ "enemyExceptions": ["BP_AISpawner_C_5"] }`. **A key in the JSON wins over the menu**, and that menu row then shows a warning naming the file. Remove the key from the JSON to use the menu again.

Moving from an older version: on the first start without an `EarnedProgression.txt`, the mod moves the four menu settings out of an existing `EarnedProgression.json` into a new `EarnedProgression.txt`, once, and logs `settings: moved ...`. The rest of the JSON stays. A value the menu cannot show (a radius over 2000, say) stays in the JSON.

Both files are re-read about every 2 seconds. With neither file, the defaults below apply.

| Key | Default | Meaning |
|---|---|---|
| `bellSafeRadius` | `1000` | Centimetres (1000 = 10 m). Pending kills this close to the respawn bell are not brought back. `0` turns the safe zone off. |
| `respawnDust` | `25` | Percent of its Dust that an enemy gives when it is killed again after coming back. 0 to 100. `100` means full Dust. |
| `debugLog` | `true` | `true` adds a log line for each kill and Dust cut. On by default so that the ids needed for the exception lists are always in the log. Set `false` for a quieter log. |
| `debugWaveProbe` | `false` | `true` adds diagnostic `probe:` lines: the level's mob domains, the domain and group of each kill, wave state at each death and respawn, and every item gained with the last kill before it. Read at each level load. Makes the log much longer. |
| `bellProximityFallback` | `false` | `true` uses the bell actor nearest to the respawn point when the game has no respawn bell set. Off by default because it can pick the wrong actor. |
| `useBellExceptionPartialId` | `false` | `true` lets a `bellExceptions` entry match any part of a bell id, so `Brokenbell_` covers every bell whose id contains it. `false` needs the whole id. |
| `newBellMessage` | `true` | At a rest at a new bell, shows "New bell reached. N enemies will stay dead." in the game's one-line tip ("No pending kills to keep." when there were none). If the game cannot show it, the log says `on-screen message failed` once. |
| `bellExceptions` | the list `bellExceptionIds` in `Settings.js` | Bell ids. A death that respawns you at one of these brings nothing back and makes pending kills permanent. An id is the game's BellID (logged as `respawn bell <id>`), the bell's actor name, or `<level>\|<actor name>`. Case does not matter. The whole id must match unless `useBellExceptionPartialId` is on. Writing your own list replaces the default one. |
| `enemyExceptions` | empty (the list `enemyExceptionIds` in `Settings.js`) | Spawner ids (the name printed after `kill:` in the log). These enemies are never recorded as kills. Writing your own list replaces the default one. |
| `domainExceptions` | the list `domainExceptionIds` in `Settings.js` (one wave fight in `PBZ_Ximeng_WP`) | Mob domain ids. A mob domain is the game's area that groups enemies into one fight; a spawner names the domain it belongs to. An entry is the domain's whole actor name (printed after `kill: ... in domain` in the log), or `<level>\|<actor name>` to match on that level only. Case does not matter; part of a name matches nothing. Enemies in a matching domain are never recorded as kills. Writing your own list replaces the default one. |

A value that cannot be used falls back to the menu's value or the default and is logged once. A number in `EarnedProgression.txt` outside the row's range is clamped to it. Entries in the three lists are trimmed, blanks are dropped and repeats are ignored.

**Finding ids.** Every death logs `death: respawn bell <BellID> (actor <actor name>)`, and every rest ends with `; bell id <BellID>`. Either id works in `bellExceptions`; the BellID is the one the game itself uses. With `debugLog` on (the default) every kill logs a `kill: <spawner>` line; that name is the id for `enemyExceptions`. The JSON is re-read about every 2 seconds, so you can add ids while the game runs.

**How the death bell is found.** The mod does not use the last bell you rested at, because the game can change your current bell without a rest. At each death it asks the game which bell it will respawn you at, with the same two calls the game's own death code makes (`PBZGameSystem.GetSaveActorID`, then `GetSaveActorByID` for the actor). If the game has no bell set (it reports `None`, for example after a map teleport or a story respawn point), the log says `could not tell which bell you respawn at (the game has no respawn bell set)` and the death revives as normal, unless `bellProximityFallback` is on.

## What to check on the first run
Look in `EarnedProgression.log` in `~mods`. Mods Menu's own line for the mod is in `%LOCALAPPDATA%\ProjectPBZ\Saved\PBZModsMenuLoader-log.txt`.

| Check | What you should see |
|---|---|
| The mod loads | `loaded EarnedProgression` in Mods Menu's log, and `started 0.10.2: bellSafeRadius 1000, respawnDust 25` in `EarnedProgression.log` |
| The menu section | `menu: registered with Mods Menu`, and an Earned Progression section on the Mods Menu tab |
| An older JSON on the first start | `settings: moved respawnDust, bellSafeRadius, newBellMessage, debugLog from EarnedProgression.json to EarnedProgression.txt (Mods Menu now changes them)` (only the keys the JSON had) |
| A level is ready | `ready on <level>: N pending, M known bells, cycle C` (`cycle unknown` if the game would not say) |
| The first level of a New Game Plus cycle | `load: saved progress is from cycle 0, now cycle 1, starting empty`, then `ready on <level>: 0 pending, 0 known bells, cycle 1` |
| A death | `death: respawn bell <BellID> (actor <name>)`, then `death: N kill(s) coming back, M kept dead near the bell` and `respawn: N spawned` |
| A rest | the usual `rest at ...` line, ending with `; bell id <BellID>` |
| A kill in a broken bell trial (`debugLog` true) | `kill: <spawner> in domain <name> in a broken bell trial, not recorded` |
| A kill whose trial state is unknown (`debugLog` true) | `kill: <spawner> ..., pending N, marked: could not tell whether this is a broken bell trial (<reason>)` |
| A death in a broken bell trial | `death: in a broken bell trial (respawn bell <id>), N marked kill(s) made permanent, the rest as normal`, then the usual `death: N kill(s) coming back` line |
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

If `EarnedProgression.log` never appears, Mods Menu did not start the mod: `PBZModsMenuLoader-log.txt` says `failed EarnedProgression` and why, or has no line for it at all if Mods Menu itself did not start.

## Files
- `main.js`: the entry Mods Menu loads. It hands the game's modules to `lib/Boot.js`.
- `EarnedProgression.js`: the mod.
- `lib/`: `Api` and `Boot` (log file, method hooks, settings files, start-up), `Menu` (the section in Mods Menu), `Settings` (the two settings files), `Progress`, `DustCut`, `BossNames` (rules, no game objects), `Game`, `Spawners`, `Kills` (the code that touches game objects), and `WaveProbe` (diagnostic logging, only while `debugWaveProbe` is on; it only reads).

## Credits
- The approach is based on PVLW's Phantom Souls mod, whose author allows reuse with credit: how enemies are brought back around the death screen, the kill watch, the codex-based boss test, and the Dust pop-up cut. The code is re-implemented here.
- Phantom Blade Zero belongs to S-GAME. This is an unofficial fan-made tool with no affiliation. No game files are included.
- Built with AI assistance (Claude and DeepSeek models).
