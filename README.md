# PBZ-Pepper-Scripts

Script mods for Phantom Blade Zero, and the tools to build them. Offline single-player only.

The game's own logic is JavaScript running in its script engine (PuerTS). These mods are JavaScript too: they are packed into small override `.pak` files that the game loads on top of its own files. Nothing in the game's files is changed, and deleting the mod's files undoes it.

## What is in here

| Folder | What it is |
|---|---|
| `ScriptModLoader/` | A loader that lets several script mods run side by side. It replaces one game script with a small stub that starts the loader, which then starts every mod listed in `ScriptModLoader.json`. Mods get a small API (`log`, `wrap`, settings files). Full API: [ScriptModLoader/README.md](ScriptModLoader/README.md). |
| `EarnedProgression/` | A mod (plugin for the loader). Enemies you kill only stay dead once you rest at a new bell. Die before that and they come back. Bosses are left alone. Rules and settings: [EarnedProgression/README.md](EarnedProgression/README.md). |
| `tools/` | Build helpers: `get-tools.bat` (downloads repak and retoc), `build-all.ps1` (builds everything). Details: [tools/instructions.md](tools/instructions.md). |
| `dist/~mods/` | Created by `build-all.ps1`: the built files, ready to copy into the game. Not in the repository, so build first. |

## Install

1. Back up your save.
2. Copy everything in `dist\~mods\` into `<game folder>\ProjectPBZ\Content\Paks\~mods\` (create `~mods` if it does not exist). The Steam default game folder is `C:\Program Files (x86)\Steam\steamapps\common\PBZ`. When updating, skip `EarnedProgression.json` and `ScriptModLoader.json` if you have changed them: copying over them replaces your settings and mod list.
3. Remove any other mod that replaces `UI/Widget/Foundation/WeaponNormalTextEntry.js`. Only one mod can replace a file, and the loader needs this one.
4. Start the game. Look for `ScriptModLoader.log` in the same `~mods` folder. It lists what loaded and what failed. If the file never appears, the loader did not start.

## Known issues

- **Wave challenges may be broken.** Fights made of waves of enemies that the game releases in stages can misbehave with Earned Progression, because the mod can bring the earlier waves back all at once when you die. The "Human-Faced Banyan Trees" are a known case. The reason and the workaround are in [EarnedProgression/README.md](EarnedProgression/README.md#known-issues).
- **Logs help.** If you hit this, the author appreciates the log from just after the death. Open `ScriptModLoader.log` in the `~mods` folder right after you die and send the last lines. Earned Progression's detailed logging is on by default for this reason.

## Run the build scripts

You need Windows 10 or 11, plus:
- Node.js 18 or newer, on the PATH (`node --version`).
- Python 3, on the PATH (`python --version`).
- repak and retoc in `tools\bin\`. Run `tools\get-tools.bat`: it downloads both, checks their SHA-256, and reports whether node and python are found. To get them by hand instead, see the table at the top of [tools/instructions.md](tools/instructions.md).

Then, from the repository root:

```
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1
```

This builds `ScriptModLoader` first and then `EarnedProgression`. For each it checks the scripts for syntax errors, packs them (pak format version 11, as the game's mod folder expects), writes the two small container stubs the game wants next to every pak (`.utoc` and `.ucas`), and then unpacks its own pak to confirm every file matches the source byte for byte. The results land in each mod's own `dist\` folder, and `build-all.ps1` gathers them in `dist\~mods\` at the repository root. It stops at the first failure and prints `BUILD-ALL FAILED: <reason>`. It never writes into the game folder: copy `dist\~mods\*` yourself.

`dist\~mods\ScriptModLoader.json` (the list of mods to start) is created if missing and never overwritten. To build one mod alone, run its own script, for example `powershell -ExecutionPolicy Bypass -File EarnedProgression\build.ps1`.

## Edit the scripts

- The source of each mod is under `<Mod>\src\ProjectPBZ\Content\JavaScript\...`. The pak copies that path exactly, so a file's place in the pak is its place in the game's content folder.
- Edit, run `tools\build-all.ps1`, copy `dist\~mods\*` to the game, and restart the game. Scripts are read when the game starts.
- `EarnedProgression` keeps its rules in `Settings.js`, `Progress.js`, `DustCut.js` and `BossNames.js`, which never touch game objects. Everything that calls into the game is in `Game.js`, `Spawners.js` and `Kills.js`. Start there when something game-related needs changing.
- Settings need no rebuild. `EarnedProgression.json` in `~mods` is re-read about every 2 seconds. The mod writes it with the default values on first start, and only when it is missing, so delete it to pick up new defaults. The defaults are at the top of `Settings.js`.
- Use `api.log("...")` to write to `ScriptModLoader.log`. `EarnedProgression` also has a `debugLog` setting, on by default, that adds a line per kill.

## Hook a new mod into the loader

1. Choose an id with letters, digits, `_` and `-` only. These steps use `MyMod`.
2. Create `MyMod\src\ProjectPBZ\Content\JavaScript\ScriptModLoader\Mods\MyMod.js`:

   ```js
   exports.start = function (api) {
       api.log("hello");
       // Run code around a game method:
       // api.wrap(cls, "ClassName", "methodName", (self, args) => { /* before */ }, (self, args, state) => { /* after */ });
   };
   ```

   To get a game class, require it from the game's script folder. `EarnedProgression.js` does `require("../../Gameplay/RenewalPlayer")`, and also uses `require("ue")` and `require("puerts")` for the engine's own modules. The full `api` list and the exact `wrap` rules are in [ScriptModLoader/README.md](ScriptModLoader/README.md).
3. Add a build script: copy `EarnedProgression\build.ps1` to `MyMod\build.ps1` and change `$name` to `zzz_PBZ_SMLMyMod_P`. Keep the same naming pattern as the other packs.
4. Add `'MyMod'` to the `$mods` list near the top of `tools\build-all.ps1`, after `'ScriptModLoader'`.
5. Register it in `ScriptModLoader.json` in the game's `~mods` folder (and in `dist\~mods\ScriptModLoader.json` if you share that file):

   ```json
   { "mods": [
       { "id": "EarnedProgression", "enabled": true },
       { "id": "MyMod", "enabled": true }
   ] }
   ```
6. Build, copy `dist\~mods\*` to the game, start it, and read `ScriptModLoader.log`. You should see `MyMod: loaded`. A mod that throws is logged as `failed` and the others still load.

## When the game updates - DEVELOPER GUIDE

The mods rely on the game's script file names, class names and method names. A game update can change any of them.

**Which build do I have, and which was the code checked against?**
- Your game's build: open `<Steam library folder>\steamapps\appmanifest_4115450.acf` in a text editor and read the `buildid` line. 
- The build the code was last checked against: the number in [TESTED_BUILD.txt](TESTED_BUILD.txt).
- If the two numbers match, the game's scripts are the ones the mods were checked on. If they differ, the game has been updated. The mods may still work, because an update does not always touch these scripts, so start the game and read the log as below.

After an update, start the game and open `ScriptModLoader.log`:

- **No log file at all:** the loader did not start. The game's `UI/Widget/Foundation/WeaponNormalTextEntry.js` has probably changed. The loader's replacement must keep the empty `WeaponNormalTextEntryInterface` class that the game's version has, and add the call that starts the loader.
- **`hook <Class>.<method> not found, skipping this hook`:** that game method was renamed or removed. `EarnedProgression` hooks `RenewalPlayer` (`SaveLoad`, `PushWidgetAndChangeData`, `stepRespawnGroup`, `BindBellDelegate`) from `Gameplay/RenewalPlayer.js`, and `DustTips.enqueueDustChange` from `UI/Widget/Foundation/DustTips.js`.
- **`failed` lines, or a mod loaded but doing nothing:** a game object the mod reads has changed. The game calls are all in `Game.js`, `Spawners.js` and `Kills.js`.

To see what changed you need the game's scripts. They are inside `ProjectPBZ-Windows.pak`.

The scripts belong to S-GAME. Keep them outside this repository. Open the file named in the log, find the class or method's new name or shape, change the mod to match, rebuild, and try again.

The build scripts pass `--version UE5_7` to retoc when writing the container stubs. The stubs hold no assets, so a new engine version probably does not matter, but if a future update moves to a newer Unreal Engine and the paks stop loading, try changing it in each `build.ps1`.

When everything works again, write your build number in `TESTED_BUILD.txt`.

## Acknowledgements

- **PBZ Phantom Souls by PVLW** ([Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/36)) was used as a reference to understand how the game can be modded. Parts of Earned Progression, particularly the respawn Dust percentage and the safe radius around bells, were heavily inspired by it. None of its files are included in this project. Thanks to PVLW.
- **repak and retoc by trumank** ([repak](https://github.com/trumank/repak), [retoc](https://github.com/trumank/retoc)) are the tools that pack the mods. They are downloaded by `tools\get-tools.bat`, are not part of this project, and keep their own licences.
- **Phantom Blade Zero** belongs to S-GAME. These are unofficial fan-made mods with no affiliation to S-GAME.

## Licence

See [LICENSE.txt](LICENSE.txt).
