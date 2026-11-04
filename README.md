# PBZ-Pepper-Scripts

Script mods for Phantom Blade Zero, and the tools to build them.

The game's own logic is JavaScript running in its script engine (PuerTS). These mods are JavaScript too. They run on **Mods Menu** by SLEEP ([Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/149)), which starts script mods after the game's own start-up without replacing any game file. Nothing in the game's files is changed, and deleting the mod's files undoes it.

## What is in here

| Folder | What it is |
|---|---|
| `EarnedProgression/` | A Mods Menu mod. Enemies you kill only stay dead once you rest at a new bell. Die before that and they come back. Bosses are left alone. Rules and settings: [EarnedProgression/README.md](EarnedProgression/README.md). |
| `tools/` | Build helpers: `build-all.ps1` (builds everything), `get-tools.bat` (downloads repak, used to read the game's scripts). Details: [tools/instructions.md](tools/instructions.md). |
| `dist/` | Created by `build-all.ps1`: the built files, laid out as `ProjectPBZ/...` so the folder's contents can be copied into the game's root folder. Not in the repository, so build first. |

## Install

1. Back up your save.
2. Install Mods Menu 0.5.4 or newer from its [Nexus page](https://www.nexusmods.com/phantombladezero/mods/149), following its README. It is not included here: its licence does not allow redistribution.
3. Copy the contents of `dist\` (the `ProjectPBZ` folder inside it) into the game's root folder. This adds `ProjectPBZ\Content\JavaScript\PBZModsMenu\Mods\EarnedProgression\`. No settings file is included, so updating never overwrites yours.
4. Start the game. Look for `EarnedProgression.log` in `ProjectPBZ\Content\Paks\~mods\`. If it never appears, open `%LOCALAPPDATA%\ProjectPBZ\Saved\PBZModsMenuLoader-log.txt`: it says `loaded EarnedProgression`, or `failed EarnedProgression` and why.

**Updating from 0.9.x**, which used ScriptModLoader: the 4 November 2026 game update stops the game at the title screen while ScriptModLoader is installed. Delete `zzz_PBZ_ScriptModLoader_P` and `zzz_PBZ_SMLEarnedProgression_P` (`.pak`, `.utoc`, `.ucas` each), `ScriptModLoader.json` and `ScriptModLoader.log` from `~mods`.

## Known issues

- **Wave challenges.** Fights made of waves of enemies that the game releases in stages could come back all at once after a death. Since 0.9.2, trials behind a broken bell such as the "Human-Faced Banyan Trees" are recognised through the game's own trial state, so no ids are needed. Wave fights that are not such trials may still misbehave, as the whole game has not been played through with the mod yet. Details and the fix are in [EarnedProgression/README.md](EarnedProgression/README.md#known-issues).
- **Logs help.** If a fight misbehaves, the author appreciates the log from just after the death. Open `EarnedProgression.log` in the `~mods` folder right after you die and send the last lines. Earned Progression's detailed logging is on by default for this reason.

## Run the build scripts

You need Windows 10 or 11 and Node.js 18 or newer on the PATH (`node --version`). Nothing else is needed to build.

From the repository root:

```
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1
```

For each mod this checks the scripts for syntax errors, runs the offline tests, copies the scripts into the mod's own `dist\` folder and compares every copy with its source byte for byte. `build-all.ps1` then rebuilds `dist\ProjectPBZ\` at the repository root from the mods' `dist` folders. It stops at the first failure and prints `BUILD-ALL FAILED: <reason>`. It never writes into the game folder: copy `dist\ProjectPBZ` yourself. To build one mod alone, run its own script, for example `powershell -ExecutionPolicy Bypass -File EarnedProgression\build.ps1`.

## Edit the scripts

- The source of each mod is under `<Mod>\src\ProjectPBZ\Content\JavaScript\PBZModsMenu\Mods\<Mod>\`. That is also where the files go in the game, so a file's place in `src` is its place in the game's folder.
- Edit, run `tools\build-all.ps1`, copy `dist\ProjectPBZ` to the game, and restart the game. Mods Menu reads the scripts when the game starts.
- `EarnedProgression` keeps its rules in `lib/Settings.js`, `lib/Progress.js`, `lib/DustCut.js` and `lib/BossNames.js`, which never touch game objects. Everything that calls into the game is in `lib/Game.js`, `lib/Spawners.js` and `lib/Kills.js`. Start there when something game-related needs changing.
- Settings need no rebuild. Four of them are rows in Mods Menu (`lib/Menu.js`), saved to `EarnedProgression.txt` in `~mods`. All of them can also be set in `EarnedProgression.json` there, written by hand, and a key in the JSON wins. Both files are re-read about every 2 seconds, and the mod creates neither. The defaults are at the top of `lib/Settings.js`.
- Use `api.log("...")` to write to `EarnedProgression.log`. `EarnedProgression` also has a `debugLog` setting, on by default, that adds a line per kill.

## Add a new mod

1. Choose an id that starts with a letter and has only letters, digits, `_` and `-` (Mods Menu's rule). These steps use `MyMod`.
2. Create `MyMod\src\ProjectPBZ\Content\JavaScript\PBZModsMenu\Mods\MyMod\main.js`. Mods Menu loads it after the game's own start-up and reports it as failed unless it sets `exports.ready = true`:

   ```js
   "use strict";
   const UE = require("ue");
   // Game scripts are three folders up, for example:
   // const RenewalPlayer = require("../../../Gameplay/RenewalPlayer").RenewalPlayerinXinInterface;
   exports.ready = true;
   ```

   To log to a file and wrap game methods the way Earned Progression does, copy its `lib/Api.js` and `lib/Boot.js` and give `Api.js` its own `LOG_FILE`. The `wrap` rules are in the comment above `wrap` in `lib/Api.js`. For rows in Mods Menu, see `lib/Menu.js`: a mod hands the menu a description of its section (`globalThis.PBZModsMenu.push`), and the menu saves the values to a `key=value` `.txt` file in `~mods` that the mod reads.
3. Add a build script: copy `EarnedProgression\build.ps1` to `MyMod\build.ps1` and change `$modRel` to the new folder.
4. Add `'MyMod'` to the `$mods` list near the top of `tools\build-all.ps1`.
5. Build, copy `dist\ProjectPBZ` to the game, start it, and read `%LOCALAPPDATA%\ProjectPBZ\Saved\PBZModsMenuLoader-log.txt`. You should see `loaded MyMod`. A mod that throws is logged as `failed` and the others still load.

## When the game updates - DEVELOPER GUIDE

The mods rely on the game's script file names, class names and method names, and on Mods Menu. A game update can change any of them.

**Which build do I have, and which was the code checked against?**
- Your game's build: open `<Steam library folder>\steamapps\appmanifest_4115450.acf` in a text editor and read the `buildid` line.
- The build the code was last checked against: the number in [TESTED_BUILD.txt](TESTED_BUILD.txt).
- If the two numbers match, the game's scripts are the ones the mods were checked on. If they differ, the game has been updated. The mods may still work, because an update does not always touch these scripts, so start the game and read the logs as below.

After an update, start the game and check, in this order:

- **The game stops at the title screen:** some pak in `Content\Paks` replaces one of the game's scripts. Since build 26367565 the game checks its scripts byte for byte and stops when one differs. These mods ship no pak; see Mods Menu's README for finding the one that does.
- **No `EarnedProgression.log`, or Mods Menu's tab is missing:** Mods Menu did not start. Check `<game folder>\platform\steam\PBZModsMenu-loader.log` and look for a newer Mods Menu.
- **`failed EarnedProgression: <reason>` in `PBZModsMenuLoader-log.txt`, and `failed to start: <reason>` in `EarnedProgression.log`:** the mod threw while starting, often because a game script it requires moved.
- **`hook <Class>.<method> not found, skipping this hook`:** that game method was renamed or removed. `EarnedProgression` hooks `RenewalPlayer` (`SaveLoad`, `PushWidgetAndChangeData`, `stepRespawnGroup`, `BindBellDelegate`) from `Gameplay/RenewalPlayer.js`, and `DustTips.enqueueDustChange` from `UI/Widget/Foundation/DustTips.js`.
- **The mod loaded but does nothing:** a game object the mod reads has changed. The game calls are all in `lib/Game.js`, `lib/Spawners.js` and `lib/Kills.js`.

To see what changed you need the game's scripts. They are inside the encrypted `ProjectPBZ-Windows.pak`; [tools/instructions.md](tools/instructions.md#read-the-games-scripts) shows how to unpack them with repak and the game's AES key.

The scripts belong to S-GAME. Keep them outside this repository. Open the file named in the log, find the class or method's new name or shape, change the mod to match, rebuild, and try again.

When everything works again, write your build number in `TESTED_BUILD.txt`.

## Acknowledgements

- **Mods Menu by SLEEP** ([Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/149)) starts these mods. It is a separate download; none of its files are included in this project.
- **PBZ Phantom Souls by PVLW** ([Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/36)) was used as a reference to understand how the game can be modded. Parts of Earned Progression, particularly the respawn Dust percentage and the safe radius around bells, were heavily inspired by it. None of its files are included in this project. Thanks to PVLW.
- **repak by trumank** ([repak](https://github.com/trumank/repak)) unpacks the game's scripts for reading. It is downloaded by `tools\get-tools.bat`, is not part of this project, and keeps its own licence.
- **Phantom Blade Zero** belongs to S-GAME. These are unofficial fan-made mods with no affiliation to S-GAME.

## Licence

See [LICENSE.txt](LICENSE.txt).
