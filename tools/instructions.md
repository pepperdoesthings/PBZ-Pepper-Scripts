# Tools

What each tool in this folder does and how to use it. Add a section for every new tool.

## What the build needs

`tools\build-all.ps1` (and each mod's `build.ps1`) needs only **Node.js 18 or newer** on the PATH (`node`; https://nodejs.org/, checked with v24.16.0). The mods are loose script files for Mods Menu, so no pak tools are needed to build them.

Reading the game's own scripts (see "Read the game's scripts") needs **repak** at `tools\bin\repak\repak.exe`. `tools\get-tools.bat` downloads it. `tools\*.py` need **Python 3** (checked with 3.13.1).

`tools\bin\` holds downloaded programs, so it is not committed to git.

## tools/get-tools.bat

Downloads the latest Windows release of repak into `tools\bin\repak`, then checks that `node` and `python` are on the PATH. Double-click it, or from a command prompt:

```
tools\get-tools.bat
tools\get-tools.bat /nopause
```

`/nopause` skips the "press any key" at the end, for when another script calls it.

It:
1. Downloads `https://github.com/trumank/<tool>/releases/latest/download/<tool>_cli-x86_64-pc-windows-msvc.zip`, and the `.sha256` file published next to it. GitHub's `releases/latest/download/` address always points at the newest release.
2. Computes the zip's SHA-256 with `certutil` and compares it with the published value. On a mismatch it prints both hashes and does not install that tool.
3. Unpacks the zip with `tar` into `tools\bin\<tool>\`, overwriting an older copy, and prints the installed version.

It uses only programs that ship with Windows 10 (1803 and newer) and 11: `curl`, `tar` and `certutil`. It does not install Node.js or Python; it only reports them as missing. Prints `GET-TOOLS OK` and exits 0, or `GET-TOOLS FAILED` and exits 1.

**Why a `.bat`:** Windows runs batch files without the PowerShell execution-policy prompt, so a double-click just works.

**What the checksum does and does not prove:** it proves the zip was not damaged or swapped on the way, compared with what the release page lists. It does not prove the release itself is trustworthy; that rests on trusting repak's author, the same as downloading by hand.

**Updates:** it always takes the newest release. If reading the game's paks starts failing after an update, the version known to work is repak 0.2.3.

Checked in a temporary copy of the project: a run downloaded repak 0.2.3, its SHA-256 matched, and node and python were found (`GET-TOOLS OK`).

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

**Alternatives:** [repak](https://github.com/trumank/repak) (see below) and FModel.

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
- Fails on the game's `ProjectPBZ-Windows.pak`: that pak is format version 12 and its index is AES-encrypted. Use repak with the AES key instead (see "Read the game's scripts").
- Does not read IoStore containers (`.utoc` / `.ucas`). The game's `ProjectPBZ-Windows_s*.ucas` files are IoStore.
- The compressed-entry branch is untested.

## Node test runner (Earned Progression tests)

Runs the offline tests. Needs Node.js v24 (checked with v24.16.0). No packages to install.

**Usage** (from the project root):

```
cd EarnedProgression
node --test "tests/*.test.js"
```

Keep the quotes: Node expands the pattern itself, so it works the same in PowerShell.

**What it does:** runs every `tests/*.test.js` file with Node's built-in `node:test`. The tests replace the game's modules with small fakes (`tests/fakegame.js`, and the fakes inside `api.test.js` and `main.test.js`), so no game is needed.

**Syntax check only:**

```
node --check <file.js>
```

**Limits:** these tests prove the mod's logic. They cannot prove that the game's script engine accepts the code, or that Mods Menu loads it. The game's `ue` and `puerts` modules do not exist under Node.

## repak (tools/bin/repak/repak.exe)

Lists and unpacks Unreal `.pak` files, including encrypted ones when given the key. Open source: https://github.com/trumank/repak (MIT or Apache-2.0, licences are in the folder).

**Version:** v0.2.3, Windows x64 zip, SHA-256 `6720d602144d75df477a99d5bedb6ea780997546afc335901d4937cafeaa73fa` (checked against the value GitHub publishes for the release).

## Read the game's scripts

The game's JavaScript is inside `<game folder>\ProjectPBZ\Content\Paks\ProjectPBZ-Windows.pak`. Its index (the table of contents) is encrypted with AES, so tools need the game's 256-bit AES key. The community key is published at https://www.unknowncheats.me/forum/forum-general/779035-phantom-blade-zero-aes-key.html (found with AESDumpster). Keep it in `.secrets\pbz-aes-key.txt`: `.secrets/` is git-ignored, so the key is never committed.

Unpack only the scripts, outside the tracked files (`temp/` is git-ignored):

```powershell
$key = Get-Content .secrets\pbz-aes-key.txt
$pak = "<game folder>\ProjectPBZ\Content\Paks\ProjectPBZ-Windows.pak"
tools\bin\repak\repak.exe --aes-key $key unpack -i ProjectPBZ/Content/JavaScript -o temp\gamejs-<build> $pak
```

`<build>` is the `buildid` from `steamapps\appmanifest_4115450.acf`. Build 26367565 gave 216 `.js`, 2 `.json` and 5 `.wasm` files. `repak.exe --aes-key $key info $pak` shows the pak's version (V11), the Oodle compression and the entry count (5181) without unpacking.

To see what an update changed, unpack the new build next to the old one and compare file hashes; ignore files whose only change is a missing `//# sourceMappingURL=...` last line.

The scripts belong to S-GAME. Never commit or share them.

**Since build 26367565 the game checks its scripts byte for byte.** A pak in `~mods` that replaces a game script with different bytes stops the game at the title screen; the identical bytes load fine (checked in game with a one-file test pak). That is why these mods run on Mods Menu instead of replacing a script.

## EarnedProgression/build.ps1

Builds Earned Progression. From the project root:

```
powershell -ExecutionPolicy Bypass -File EarnedProgression\build.ps1
```

Steps, in order, stopping at the first failure:
1. `node --check` on every `.js` file in `src` and `tests`.
2. The offline tests (`node --test "tests/*.test.js"`).
3. Copies `src\ProjectPBZ` to `dist\ProjectPBZ`.
4. Writes `dist\ProjectPBZ\Content\Paks\~mods\EarnedProgression.json` by calling the mod's own `defaultsText()` in `lib/Settings.js`, so it is the same text the mod writes when the file is missing, and checks that it is valid JSON.
5. Compares every copied script with `src` byte for byte.

Prints `BUILD OK` and exits 0, or `BUILD FAILED: <reason>` and exits 1. Checked by breaking a test: the build stopped. It does not install anything into the game folder.

## tools/build-all.ps1

Builds every mod and gathers the results in `dist\ProjectPBZ` at the repository root. From anywhere:

```
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1
```

1. Runs each mod's `build.ps1` (the `$mods` list at the top; today only `EarnedProgression`).
2. Deletes `dist\ProjectPBZ` and rebuilds it from the mods' `dist\ProjectPBZ` folders, so a file a mod no longer has does not linger. Fails if two mods write the same file. Compares every copy with its source by hash.

Copying `dist\ProjectPBZ` over a game folder replaces the player's own `EarnedProgression.json`, so skip that file when updating. If a build or test fails, `dist` is not touched. Prints `BUILD-ALL OK` and exits 0, or `BUILD-ALL FAILED: <reason>` and exits 1. It never writes to the game folder.

Checked by running it twice with a leftover `zzz_PBZ_ScriptModLoader_P.pak` placed in `dist` between runs: the second run removed it.
