# QA - @moonglade/provenance 2.6.1

Independent QA (role oya), 2026-10-24, on branch `release/2.6.1`. Round 1 ran on `224b9d0`; round 2 on `44bf957`. No source files were edited and nothing was committed, pushed or published by QA. Hook-installer attacks used temporary git repositories only. Linux checks ran in Docker (`node:22-slim`, and `node:22-alpine` for the no-bash case) using the real `npm pack` tarball.

## Final verdict: FAIL, on one documentation item only

Everything functional passes in round 2. One tracked file still contains local filesystem paths, which the release criteria forbid:

- `docs/ubuntu/2026-10-24-provenance-2-6-1/CHANGES.md`, lines 87 and 88 (the "For the coordinator" bullets) quote a Windows drive path and a drive path from the fixture generator, in text that describes the earlier state. The fixture generator itself is clean; only the quotation remains.
- Fix: delete or reword those two bullets (both items are resolved), then grep the tracked tree for Windows drive-letter paths and the user-profile directory name to confirm zero matches. Nothing else needs a re-test; this is a docs-only change. The packed tarball is already clean.

When that is done, the verdict is PASS for publication of 2.6.1.

## Round 2 results (HEAD 44bf957)

| Check | Result |
|---|---|
| `npm ci`, build (tsc) | clean, 0 vulnerabilities |
| `npm test` | 415 tests, 415 pass, 0 fail (matches implementer). No lint script exists; tsc is the typecheck |
| `npm pack` | 33 files, includes `wasm/` (4) and `dist/hookInstaller.*`, no tests; file list identical to round 1 and equal to published 2.6.0 plus the two `hookInstaller` files |

### F1 (data loss in the hook installer): FIXED
Re-run of the round 1 reproductions plus new attacks, all on Windows with the built CLI:

| Case | Result |
|---|---|
| Fresh install, then identical re-run | `created`, then `unchanged` (no write) |
| User-appended line on our hook | refused, exit 1, hook untouched; with `--force` the edited hook is copied to `.bak-<UTC>` first and the line is recoverable |
| Foreign hook that only mentions the marker in a comment | refused, exit 1, untouched |
| CRLF-converted copy of our hook | refused as not ours (conservative; needs `--force`, which backs up). Hooks live outside the work tree, so autocrlf does not rewrite them in normal use |
| Our hook minus its trailing newline | refused as not ours |
| Existing manifest with user content | backed up to `.provenance-hooks.json.bak-<UTC>` before rewrite |
| Unparseable manifest | backed up before rewrite |
| MCP-only run after a pre-commit install | manifest keeps `preCommit:true`, adds the MCP choice |
| Pre-commit re-run after an MCP choice | MCP choice kept, not switched off |
| Foreign hook on disk, MCP-only run | `preCommit:false` recorded, foreign hook untouched |

Note: the only "known" generated version is the current script. An older generated hook (for example one written by an unreleased build) would be treated as foreign and refused; this is safe, and no earlier version was ever published.

### F2 (pre-commit gate bypass): FIXED
Linux, tarball installed, real `provenance seal-provisional` sidecars, real `git commit`:

| Staged mutated sealed file | Result |
|---|---|
| `plain.md` | blocked, exit 1 |
| `b c.md` (space) | blocked |
| `café.md` | blocked |
| `dq"uote.md` (double quote) | blocked |
| `-dash.md` (leading dash) | blocked |
| Tab and newline in the name | the engine refuses to seal such names ("scope must not contain control characters"), so no genuine sidecar can exist; with a placeholder sidecar added by hand the commit is blocked and both files are reported as drift |
| File with no sidecar | commit allowed (by design) |
| One bad file among several (`b c.md` mutated, a good sealed file and an unsealed file staged) | blocked, exit 1, the bad file named |
| Clean sealed files | commit allowed, exit 0 |
| Rename plus mutation of a sealed file | the renamed path has no sidecar (the sidecar was not renamed), so it is skipped by design; same limitation as any unsealed file |
| No bash installed (`node:22-alpine`) | the hook fails closed: `env: can't execute 'bash'`, commit exits 1 (all commits are blocked until bash is installed or `--no-verify` is used). The installer does not warn about the missing bash at install time; the README states that the hook needs bash |

### N4 (Ctrl-D at a prompt): FIXED
- Linux, real pty: Ctrl-D at the first prompt, and after one answer, both exit 1 with "install-hooks cancelled, nothing changed."; no manifest and no hook were written.
- Windows: the suite runs the same code path with injected streams (3 tests, passing). A real Windows console could not be driven from this environment (`winpty` reports stdin is not a tty), so the console case itself is not independently observed.

### WASM: byte-identical
All four files in `packages/provenance-ts/wasm/` equal the QA rebuild from `git archive 84ff58c679c64c723f91b101012e7ba884e93020` (rustc 1.98.1, `cargo build --locked --release --target wasm32-unknown-unknown -p mgc-wasm`, wasm-bindgen 0.2.129 `--target nodejs`) and HEAD:

- `mgc_wasm_bg.wasm` c7f0f294a3de9913...
- `mgc_wasm.d.ts` 3495bf174b623b4e...
- `mgc_wasm_bg.wasm.d.ts` eb407ee7fd93dd27...
- `mgc_wasm.js` 63d38046e9e00418... (now the pristine generated file; the earlier manual patch is gone)

The wasm-pack route and the private working-tree state at the original build time were not independently verified, as `PUBLIC_SOURCE_IMPORT.json` says.

### Manifest
All 72 `copied_files` sha256 values match `git show HEAD:<path>` bytes (LF basis). Tracked files not listed are exactly `PUBLIC_SOURCE_IMPORT.json` and the two files under `docs/ubuntu/` (covered by `manifest_exclusions`).

### Local paths, secrets
- Packed tarball: no drive paths, or user-profile paths in any text file; the file list is unchanged.
- Tracked tree at HEAD: the only matches are the two CHANGES.md lines named above.
- Not re-checked in round 2: wasm binary strings (the tool was unavailable); round 1 found none.

### Docs
- SECURITY.md: now states the 2.6.0 audit is recorded in TESTING.md, that 2.6.1 changes are covered by this file, and that no version is declared supported beyond what its audit covers. Accurate. Because it points here, this file must be committed with the release.
- TESTING.md: the production-audit paragraph is now limited to 2.6.0 and says 2.6.1 additions were not part of it. Accurate. Still stale but labelled as a 2.6.0 snapshot: line 15 ("230 tests"). The statement that the hook script is "not exercised end to end against `npx`" remains true (the suite uses a stub `npx`); QA's Linux run used the real package.
- Package README: the hook paragraph matches observed behaviour for exact-content ownership, backups, MCP options being record-only, worktree and `core.hooksPath` sharing, the bash requirement, NUL-delimited names, and Ctrl-D.
- Remaining non-blocking: example addresses in `SPEC.md` and a test address in `self-test.js` predate 2.6.1 and shipped in 2.6.0.

## Round 1 summary (HEAD 224b9d0): FAIL, two defects, both now fixed

- Suite 396/396 on a clean install; pack contained 33 files; self-test and `./wasm` exports worked from a scratch install via `require` and `import`; `provenance test` exited 0.
- F1: a hook containing the marker text anywhere was overwritten with no backup (user-edited own hook, and a foreign hook mentioning the marker). An existing manifest was also overwritten without backup, and an MCP-only run recorded `preCommit:false` while the hook was installed. Fixed in `cf44657`.
- F2: the generated hook used `for FILE in $STAGED_FILES`, so staged files with spaces or non-ASCII names were skipped and a mutated sealed file committed with "All staged artifacts verified." Fixed in `cf44657` (bash, NUL-delimited list).
- WASM rebuilt from the private source commit: `.wasm` and both `.d.ts` byte-identical; `mgc_wasm.js` differed only by a one-line `path.join` patch that was not needed on Windows (the unpatched file loads there, including from a directory with spaces). Resolved by shipping the pristine file.
- Non-blocking items raised: manifest not read by anything (now disclosed), shared `core.hooksPath` and worktree hook sharing (now documented), Ctrl-D exited 0 (fixed in `3b9eb32`), SECURITY.md sentence removal changing the support claim (reworded).

## Criterion-to-test map

| Criterion | Evidence |
|---|---|
| Clean install, build, suite | `npm ci`, `npm test` 415/415 |
| Self-test export, `./wasm`, CLI | scratch install of the packed tarball (round 1); tarball repacked and file list re-compared (round 2) |
| Installer ownership, backups, manifest merge | `hookInstaller.test.js`, `hookInstaller-safety.test.js` (F1 group), plus the manual cases above |
| Gate behaviour on awkward names, fail-closed | `hookInstaller-safety.test.js` (F2 group, stub `npx`, Windows) plus the Linux real-package run above |
| Ctrl-D cancellation | `hookInstaller-safety.test.js` (N4 group) plus the Linux pty run |
| WASM provenance | independent rebuild, hash comparison |
| Manifest integrity | all 72 hashes recomputed against HEAD |
| No local paths | grep of tracked tree and packed tarball |

## Cleanup note
The QA WASM rebuild directory (a scratch folder at the root of the system drive) could not be removed by the QA agent: the recursive delete was refused by the sandbox safety check. It holds only build output and can be deleted by hand.
