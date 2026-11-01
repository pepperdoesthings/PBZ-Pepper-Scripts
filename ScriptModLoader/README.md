# ScriptModLoader

A small open-source loader for script mods in Phantom Blade Zero. It lets several script mods run side by side without each one replacing a game script. The loader is plain JavaScript for the game's own script engine. It has no DLL and no executable code of its own.

Offline single-player only. The game build it was last checked against is in `TESTED_BUILD.txt` in the repository root.

## Status
Built and tested offline only. It has **not** been run inside the game yet, so treat it as untested until you see `ScriptModLoader.log` appear (see "The log").

## Install
1. Build the pack: `powershell -ExecutionPolicy Bypass -File ScriptModLoader\build.ps1`. The files appear in `ScriptModLoader\dist\`.
2. Copy `zzz_PBZ_ScriptModLoader_P.pak`, `.utoc` and `.ucas` into `<game folder>\ProjectPBZ\Content\Paks\~mods\`.
3. Create `ScriptModLoader.json` in the same folder (see "Registry"). Remove any other mod that replaces `WeaponNormalTextEntry.js`.
4. Start the game, then open `ScriptModLoader.log` in the same folder.

## How it works
- The loader pack, `zzz_PBZ_ScriptModLoader_P`, replaces one game file, `UI/Widget/Foundation/WeaponNormalTextEntry.js`, with a stub. The stub keeps the empty class the game expects and starts the loader.
- The loader reads `ProjectPBZ/Content/Paks/~mods/ScriptModLoader.json` and starts each listed mod.
- Each mod is its own pack, `zzz_PBZ_SML<Id>_P`, holding one module at `ScriptModLoader/Mods/<Id>.js`. Because that path is new, mod packs never collide.
- Results are written to `ProjectPBZ/Content/Paks/~mods/ScriptModLoader.log`. Look there first if a mod does nothing.

## Registry
`ProjectPBZ/Content/Paks/~mods/ScriptModLoader.json`, edited by hand:

```json
{
  "mods": [
    { "id": "EarnedProgression", "enabled": true }
  ]
}
```

- `id` may contain letters, digits, `_` and `-` only.
- `enabled` defaults to `true`. Set `false` to switch a mod off.
- Mods start in list order. A repeated `id` starts once.
- The loader never edits this file. Restart the game after changing it.

## Writing a mod
A mod is a CommonJS module in its own pack at `ProjectPBZ/Content/JavaScript/ScriptModLoader/Mods/<Id>.js`:

```js
exports.start = function (api) {
    api.log("hello");
};
exports.stop = function () {};   // optional; this version never calls it
```

| `api` member | Meaning |
|---|---|
| `api.loaderVersion` | the loader's version string |
| `api.log(message)` | adds a line, prefixed with the mod id, to `ScriptModLoader.log` |
| `api.wrap(cls, className, methodName, before, after)` | wraps `cls.prototype[methodName]`. `before(self, args)` runs first; its return value is passed to `after(self, args, state)`, which runs after the original. The original's result is returned unchanged. `args` is the same array the original is then called with, so `before` can change `args[i]` to change what the original receives. If `before` returns `api.SKIP`, neither the original nor `after` runs and the caller gets `undefined`. Returns `false` and logs if the method does not exist. |
| `api.SKIP` | the value a `before` hook returns to stop the call (see `api.wrap`). Added in 1.1.0. |
| `api.settingsPath(fileName)` | full path of a file in `~mods` for the mod's own settings |
| `api.readText(path)` | file contents, or `undefined` |
| `api.writeText(path, text)` | writes a file |

If two mods wrap the same method, the later one wraps the earlier one. A call runs the later mod's `before`, then the earlier mod's `before`, the original, the earlier mod's `after`, and the later mod's `after`. If a later mod's `before` returns `api.SKIP`, the earlier mod's hooks do not run for that call; if an earlier mod's returns it, the later mod's `before` and `after` still run.

A mod that throws while loading or starting is logged as failed and the others still load.

**Hook failures.** An exception in `before` or `after` is caught and logged once per hook, and the game's call continues. If `before` throws, `after` still runs with `state` undefined. An exception thrown by the original method itself is not caught, and `after` does not run. `api.settingsPath` throws for an invalid file name.

## The log
- Each line carries a time of day in UTC (`HH:MM:SS.mmm`).
- The log keeps the newest 1000 lines. Each start of the game adds a `---- new session` marker after the earlier lines.
- The log is ASCII only. Other characters are written as `?`.
- If `ScriptModLoader.log` does not exist after starting the game, the loader never started. The game strips console output, so the cause is not visible there. Check that every file of the loader pack is in `ProjectPBZ/Content/Paks/~mods`.

## Conflicts
Any other mod that replaces `UI/Widget/Foundation/WeaponNormalTextEntry.js` conflicts with this loader, because only one copy of that file can win. Known cases: Phantom Souls, and the Nexus mod "Movement Speed (PBZMoveSpeed)". Mods that replace other game scripts are not affected.

## Testing
Offline tests run on plain Node.js v24 and use stand-ins for the game's modules:

```
cd ScriptModLoader
node --test "tests/*.test.js"
```

They test the loader's logic. They do not prove the game accepts the stub or loads mods from computed paths. That needs a run in the game.

## Credits
- This loader's approach is based on PVLW's Phantom Souls mod, whose author allows reuse with credit: loading from `WeaponNormalTextEntry.js`, wrapping the game's script classes, a JSON settings file next to the paks, and a deferred log file that keeps earlier sessions. The wrap and log-merge logic follow the same pattern as that mod, re-implemented here. Credit to PVLW.
- Phantom Blade Zero belongs to S-GAME. This is an unofficial fan-made tool with no affiliation.
- Game files: the replaced entry file keeps the empty `WeaponNormalTextEntryInterface` class the game expects. That class shape belongs to S-GAME and is reproduced only as the stub the game needs. Otherwise no game files are shipped.
- Built with AI assistance (Claude and DeepSeek models).
