# Tools

What each tool in this folder does and how to use it. Add a section for every new tool.

## What the build needs

`tools\build-all.ps1` (and each mod's `build.ps1`) needs four things. Two come from the internet and two are installed programs:

| Tool | Where it must be | Where to get it |
|---|---|---|
| repak | `tools\bin\repak\repak.exe` | https://github.com/trumank/repak/releases (asset `repak_cli-x86_64-pc-windows-msvc.zip`) |
| retoc | `tools\bin\retoc\retoc.exe` | https://github.com/trumank/retoc/releases (asset `retoc_cli-x86_64-pc-windows-msvc.zip`) |
| Node.js 18 or newer | on the PATH (`node`) | https://nodejs.org/ (checked with v24.16.0) |
| Python 3 | on the PATH (`python`) | https://www.python.org/downloads/ (checked with 3.13.1) |

The quickest way to get repak and retoc is `tools\get-tools.bat` (below). To get them by hand instead, download each zip from the release page, check it against the `.sha256` file next to it, and unpack it so the `.exe` lands at the path in the table. Both builds stop with `missing tool: <path>` if an `.exe` is not where they expect it.

`tools\bin\` holds downloaded programs, so it is not committed to git. Run `get-tools.bat` after a fresh checkout.

## tools/get-tools.bat

Downloads the latest Windows releases of repak and retoc into `tools\bin\repak` and `tools\bin\retoc`, then checks that `node` and `python` are on the PATH. Double-click it, or from a command prompt:

```
tools\get-tools.bat
tools\get-tools.bat /nopause
```

`/nopause` skips the "press any key" at the end, for when another script calls it.

For each tool it:
1. Downloads `https://github.com/trumank/<tool>/releases/latest/download/<tool>_cli-x86_64-pc-windows-msvc.zip`, and the `.sha256` file published next to it. GitHub's `releases/latest/download/` address always points at the newest release.
2. Computes the zip's SHA-256 with `certutil` and compares it with the published value. On a mismatch it prints both hashes and does not install that tool.
3. Unpacks the zip with `tar` into `tools\bin\<tool>\`, overwriting an older copy, and prints the installed version.

It uses only programs that ship with Windows 10 (1803 and newer) and 11: `curl`, `tar` and `certutil`. It does not install Node.js or Python; it only reports them as missing. Prints `GET-TOOLS OK` and exits 0, or `GET-TOOLS FAILED` and exits 1.

**Why a `.bat`:** Windows runs batch files without the PowerShell execution-policy prompt, so a double-click just works.

**What the checksum does and does not prove:** it proves the zip was not damaged or swapped on the way, compared with what the release page lists. It does not prove the release itself is trustworthy; that rests on trusting the repak and retoc authors, the same as downloading by hand.

**Updates:** it always takes the newest release. A newer repak or retoc could change behaviour; the builds' byte-for-byte pak check would catch a pak whose contents differ, but not every possible change. If a build starts failing after an update, the versions known to work are repak 0.2.3 and retoc 0.1.5 (below).

Checked in temporary copies of the project: a fresh run downloaded both tools, and the `.exe` files were byte-identical to the ones in `tools\bin`; a changed hash was refused for both tools with exit code 1; and a full `build-all.ps1` passed using only the downloaded tools.

## unpak.py

Extracts the files from an Unreal Engine `.pak` archive (format version 11, as used by Phantom Blade Zero mods).

**Needs:** Python 3 (standard library only).

**Usage:**

```
python tools/unpak.py <pak file> <output folder>
```

**Example** (from the project root):

```
python tools/unpak.py "ProjectPBZ/Content/Paks/~mods/zzz_PBZ_PhantomSouls_P.pak" extracted
```

**What it does:**
1. Finds the footer at the end of the pak (magic number `0x5A6F12E1`) to get the index location.
2. Reads the index: mount point, file count, and the directory listing.
3. Writes each file under the output folder, using the paths stored in the pak (for example `ProjectPBZ/Content/JavaScript/...`).
4. Prints each file's path, size and compression flag (`0` means stored uncompressed).

**Limits:**
- Only tested on `zzz_PBZ_PhantomSouls_P.pak`, where every file is uncompressed and unencrypted.
- The zlib branch for compressed files has never been run. Don't rely on it.
- No encryption support. Encrypted paks need the AES key.
- Doesn't check the per-file SHA-1 hashes.
- Doesn't read the `.utoc` / `.ucas` files. Here they look like empty stubs.
- Only extracts. It cannot build a pak.

**Alternatives:** [repak](https://github.com/trumank/repak) and FModel, both widely used and not tried in this project.

## listpak.py

Lists the entries of an Unreal `.pak` and can extract only the entries whose path matches a filter. It reads the footer and index with seeks, so it never loads the whole pak into memory. That makes it safe to run on multi-GB game paks.

**Needs:** Python 3 (standard library only).

**Usage:**

```
python tools/listpak.py <pak> [path-filter] [--extract <outdir>]
```

- `path-filter`: case-insensitive substring of the entry path, for example `.js` or `RenewalPlayer`.
- `--extract <outdir>`: also write the matching entries under `<outdir>`.

**Example:**

```
python tools/listpak.py "ProjectPBZ/Content/Paks/~mods/zzz_PBZ_PhantomSouls_P.pak" Hooks
```

**Limits:**
- Reads pak format version 11 with an unencrypted index only. Tested on the Phantom Souls mod pak (9 entries).
- Fails on the game's `ProjectPBZ-Windows.pak`: that pak is format version 12 and its index is AES-encrypted. Reading it needs the AES key, which we do not have.
- Does not read IoStore containers (`.utoc` / `.ucas`). The game's `ProjectPBZ-Windows_s*.ucas` files are IoStore.
- The compressed-entry branch is untested.

## Node test runner (ScriptModLoader tests)

Runs the offline tests for the ScriptModLoader mod. Needs Node.js v24 (checked with v24.16.0). No packages to install.

**Usage** (from the project root):

```
cd ScriptModLoader
node --test "tests/*.test.js"
```

Keep the quotes: Node expands the pattern itself, so it works the same in PowerShell.

**What it does:** runs every `tests/*.test.js` file with Node's built-in `node:test`. Each test replaces the game's file and timer functions with a small fake (`tests/helpers.js`), so no game is needed.

**Syntax check only:**

```
node --check <file.js>
```

**Limits:** these tests prove the loader's logic. They cannot prove that the game's script engine accepts the code. The game's `ue` and `puerts` modules do not exist under Node.

## repak (tools/bin/repak/repak.exe)

Packs a folder into an Unreal `.pak`, and lists or unpacks paks. Open source: https://github.com/trumank/repak (MIT or Apache-2.0, licences are in the folder).

**Version:** v0.2.3, Windows x64 zip, SHA-256 `6720d602144d75df477a99d5bedb6ea780997546afc335901d4937cafeaa73fa` (checked against the value GitHub publishes for the release).

**Usage we rely on:**

```
tools/bin/repak/repak.exe pack --version V11 --mount-point "../../../" <folder> <out.pak>
tools/bin/repak/repak.exe list <pak>
```

The folder's contents become the pak's paths, so pack the folder that contains `ProjectPBZ/`. Pak version V11 and mount point `../../../` match the mod paks we examined. It cannot write compressed or encrypted paks, and we never need to.

## retoc (tools/bin/retoc/retoc.exe)

Converts between Unreal IoStore containers (`.utoc`/`.ucas`) and paks. We use it only to create the empty `.utoc` and `.ucas` stub files that sit next to a mod pak. Open source: https://github.com/trumank/retoc (MIT, licence in the folder).

**Version:** v0.1.5, Windows x64 zip, SHA-256 `cc036b06ad3bdcf7003690b00d82719980c374e48a95bf0654f9959148d263aa` (checked against the published value).

**Usage we rely on:**

```
tools/bin/retoc/retoc.exe to-zen --version UE5_7 <in.pak> <out.utoc>
```

Because our pak holds only scripts and no assets, this writes a 202-byte `.utoc` and a 64-byte `.ucas`, the same sizes as Phantom Souls' stubs. Their headers are identical except for a container ID (8 bytes) that retoc generates from the input, so our stubs do not collide with other mods' stubs. `UE5_7` is a guess from the engine version quoted in KintaroModding's README; the stubs contain no assets, so the version should not matter, but this is untested in the game.

## ScriptModLoader/build.ps1

Builds the loader mod. From the project root:

```
powershell -ExecutionPolicy Bypass -File ScriptModLoader\build.ps1
```

Steps, in order, stopping at the first failure:
1. `node --check` on every `.js` file.
2. The offline tests (`node --test "tests/*.test.js"`).
3. `repak pack` into `ScriptModLoader\dist\zzz_PBZ_ScriptModLoader_P.pak`.
4. `retoc to-zen` for the `.utoc` and `.ucas` stubs.
5. Extracts the pak with `tools/listpak.py` and compares every file byte for byte with `ScriptModLoader\src`.

Prints `BUILD OK` and exits 0 on success; prints `BUILD FAILED: <reason>` and exits 1 otherwise. Checked by breaking a test and by adding a syntax error: both stopped the build. It does not install anything into the game folder.

## EarnedProgression/build.ps1

Builds the Earned Progression plugin pack. From the project root:

```
powershell -ExecutionPolicy Bypass -File EarnedProgression\build.ps1
```

Steps, in order, stopping at the first failure:
1. Reads `VERSION` from `ScriptModLoader\...\Loader.js` and refuses anything older than 1.1.0 (the plugin uses `api.SKIP`).
2. `node --check` on every `.js` file.
3. The offline tests (`node --test "tests/*.test.js"`). They run the loader's own `createLoader` against a hand-written fake of the game.
4. `repak pack` into `EarnedProgression\dist\zzz_PBZ_SMLEarnedProgression_P.pak`.
5. `retoc to-zen` for the `.utoc` and `.ucas` stubs.
6. Extracts the pak with `tools/listpak.py` and compares every file byte for byte with `EarnedProgression\src`.

Prints `BUILD OK` and exits 0, or `BUILD FAILED: <reason>` and exits 1. Checked by lowering the loader version and by breaking a test: both stopped the build. It does not install anything into the game folder.

The plugin pak holds only new files (`Mods/EarnedProgression.js` and `Mods/EarnedProgressionLib/*`), never a game file, so it cannot collide with another mod's pak. The loader pak is the one that replaces `WeaponNormalTextEntry.js`.

## tools/build-all.ps1

Builds both mods and refreshes the install folder in one command. Needs the tools listed in "What the build needs" at the top. From anywhere:

```
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1
```

Steps, in order, stopping at the first failure:
1. Runs `ScriptModLoader\build.ps1` (syntax check, tests, pak, byte-for-byte check) and updates `ScriptModLoader\dist`.
2. Runs `EarnedProgression\build.ps1` the same way and updates `EarnedProgression\dist`. The loader goes first because the plugin's build checks the loader's version and its tests run the loader's code.
3. Copies every file of both `dist` folders into `install\~mods` and compares each copy with its source by hash.

`install\~mods\ScriptModLoader.json` (the registry) is created with the `EarnedProgression` entry if it is missing, and is never overwritten, so a registry you edited stays as it is. If a build or test fails, `install\~mods` is not touched. Prints `BUILD-ALL OK` and exits 0, or `BUILD-ALL FAILED: <reason>` and exits 1. It never writes to the game folder: copy `install\~mods\*` there yourself.

Checked by breaking a plugin test, by breaking a loader test (the plugin build did not start), by deleting the registry (recreated) and by editing it (kept).
