# CHANGES - public repo @moonglade/provenance 2.6.1

Branch `release/2.6.1`, worktree `D:\Development 2.0\Repos\Public\moonglade-provenance-wt-2.6.1`, based on Agy's `0778caf` (public main, unpushed). Signed with the Claude agent key `148A31AA...D7A5` (worktree-local config). No push, tag, merge or publish. Main checkout untouched. Private-side record: `release/2.6.1-housekeeping` (`80965ad`) in `moonglade-provenance`.

## Commits on top of 0778caf
1. `532ae57` feat: `./self-test` export in `packages/provenance-ts/package.json` (`./wasm` kept), new `binary-regression.test.js` and `self-test-export.test.js` (byte-identical to the private branch: sha256 11df53da..., 2350569d...), version 2.6.1 in root `package.json`, `package-lock.json` (root, root workspace entry, and the `packages/provenance-ts` entry which was stale at 2.5.0) and `CITATION.cff`.
2. `b8e3255` docs: root `CHANGELOG.md` 2.6.1 entry (self-test export and CLI, B1 test, WASM export, hook installer, README); root `README.md` title and version line to 2.6.1; package `README.md` title, plus a paragraph on self-test, `/wasm`, `install-hooks`.
3. `93e1e85` chore: refresh `PUBLIC_SOURCE_IMPORT.json`.
4. This docs commit (this file, AGY-WORKTREE-SNAPSHOT.md).

## Deliberate edits to Agy's files (README.md and package.json only)
- Package README: Agy's edit left "Run these commands from the repository root:" with no commands (`npm ci`, `npm test` were removed). I restored the code block.
- `wasm/*` is byte-identical to `0778caf`. `hookInstaller.ts` and `artifact-cli.ts` were changed afterwards, with Marc's approval, by the hardening in the "Round 2" section below.

## Manifest (`PUBLIC_SOURCE_IMPORT.json`)
- version 2.6.1, status `remediated-release-candidate`; two new `publication_adjustments` lines (self-test/B1; WASM + hook installer, with the honest account that wasm shipped in 2.6.0 uncommitted and the hook installer did not ship).
- `copied_files` fully recomputed on committed LF bytes and 7 entries added (2 tests, hookInstaller.ts, 4 wasm files). New `hash_basis` field: the 2.6.0 manifest mixed LF and CRLF hashes (31 entries matched only CRLF bytes) and six entries not touched by Agy or 2.6.1 (CITATION.cff, package-lock.json, SPEC.md, TIMESTAMP.md, SECURITY.md, TESTING.md) were already stale against `bb86146`.
- `source_commit` left at `98e1b39...` (private-derived files only). New `source_commit_scope` text and `public_origin_files` field state that the private monorepo main contains no hookInstaller or wasm, and that the housekeeping files come from private branch `80965ad`, unmerged. The previous `source_commit_scope` text was replaced.

## 2.6.0 reproducibility (build of 0778caf vs published 2.6.0 tarball, sha256 138418ac...0918)
Compared dist/*.js, dist/*.d.ts, wasm/*, package.json, README (line endings ignored).
- Identical: all `dist` files except below, all four `wasm/` files, `package.json`.
- Different: `dist/artifact-cli.js` (published lacks `install-hooks`), package `README.md` (published is the pre-Agy README from `bb86146`).
- Not in the tarball: `dist/hookInstaller.js`, `dist/hookInstaller.d.ts`.
- Conclusion: the published 2.6.0 is not reproducible from `0778caf`; Agy's package.json and wasm were published, but the hook installer and CLI change were made after the publish (hookInstaller.ts mtime 2026-10-24 05:27). The published tarball is reproducible from `bb86146` + `wasm/` + Agy's package.json + the pre-edit README. LICENSE, SPEC.md and trust/root-public.asc differ from the tarball only by line endings (tarball CRLF).

## Tests
- Before (0778caf, clean `npm ci`): 375 tests, 375 pass.
- After: 383 tests, 383 pass, 0 fail.
- `npm pack --dry-run`: 33 files, 341.1 kB, includes `wasm/` (4 files) and `dist/hookInstaller.*`; 2.6.0 had 31 (the extra two are the hook installer).
- Scratch install of the packed tarball: `@moonglade/provenance/self-test` resolves and passes 6/6 (version 2.6.1); `@moonglade/provenance/wasm` resolves (exports `canonicalize_json`, `sha256_digest`, `verify_attestation`, ...); `provenance test` exits 0; `--help` lists `install-hooks`.

## Concerns (reported, not fixed)
- (Resolved in round 2: overwrite, hidden mcpAutoSeal, empty pre-push, worktree handling; see below.)
- `packages/provenance-ts/README.md` line 87 ("Default hooks, platform keystores, the hook CLI and sibling packages are excluded") and `TESTING.md` line 47 now sit awkwardly with the shipped hook installer and WASM export, and the hook installer has no tests. Not edited.
- WASM `mgc_wasm*` is a build product of `mg-crypto-core` with no source or build step in this repo; provenance of the binary is unverified here.
- `SECURITY.md` still says "Version 2.6.0 is a release candidate"; `TESTING.md` is titled for the 2.6.0 candidate. Not edited.
- Self-test condition 4 writes a temp dir under the package root, so a read-only install would fail it.

## Round 2 (Marc, 2026-10-24): hook installer hardening and WASM origin

Commits: `8f6ab27` fix (installer, CLI wiring, 13 new tests), `c057a15` docs, and the commit carrying this section (README WASM section, CHANGELOG, manifest `wasm_provenance`, this file).

### Hook installer (`hookInstaller.ts`, `artifact-cli.ts`, Agy's files; change approved)
- Foreign hooks are refused (exit 1, message names `--force`) and left untouched, and no manifest is written on refusal. With `--force` the old hook is copied to `<hook>.bak-<UTC timestamp>` (`pre-commit.bak-20261024T133047Z`, exclusive-create, counter suffix on collision) before replacement. A hook containing `# moonglade-provenance-hook v1` is ours and is updated in place.
- Only chosen options are enabled: `--pre-commit`, `--mcp-verify-read`, `--mcp-auto-seal`, `--force`. In a terminal with no choice flag it asks per option (pre-commit defaults yes, the MCP options default no); with no flag and no terminal it exits 2 and changes nothing. Unknown flags (including the removed `--pre-push`) exit 2. `mcpAutoSeal` is no longer hard-wired to true. `mcpServer` appears in the manifest only if an MCP option is chosen.
- Removed the empty pre-push option and the unused `tombstoneDelete` field. Hook script emoji and the "[3]/[4]" menu removed.
- Hooks directory: `git rev-parse --git-path hooks` (run in the working directory), resolved against it. It honours `core.hooksPath` and linked worktrees (shared hooks dir of the main repository), and is a strict improvement on `--git-dir` plus `/hooks`, which a worktree resolves to its private git dir where git does not run hooks from. Fallback to a `.git` directory only if the `git` executable is missing. The manifest goes to `git rev-parse --show-toplevel`. Submodules are not tested directly; they follow the same git resolution.
- Tests (`hookInstaller.test.js`, temp git repos): fresh install, nothing selected, mcpAutoSeal only when chosen, foreign hook refused, `--force` backup, own hook updated, linked worktree, `core.hooksPath`, not-a-repo error, plus four CLI tests. Red first (13 failing against the old module), green after.
- Docs: package README (hooks section and flags), TESTING.md (title and limits), SECURITY.md (no longer calls 2.6.0 a release candidate; the sentence "No production version is declared supported until its release audit passes" was removed on instruction, so confirm that matches what Marc intends), CHANGELOG.

### WASM origin
Verdict: reproduced. Details in `PUBLIC_SOURCE_IMPORT.json` `wasm_provenance` and the package README.
- Source commit `84ff58c679c64c723f91b101012e7ba884e93020` in the private monorepo. Private main `fca58c8` has identical `crates/`, `Cargo.lock` and `rust-toolchain.toml` trees. No uncommitted changes under `crates/` now; at build time this is inferred from mtimes (sources 2026-10-22 15:23, pkg output 2026-10-23 20:58) and the byte-identical result.
- Clean `git archive 84ff58c` in a scratch directory (private checkout never built in), rustc 1.98.1 (48a229cea 2026-09-01) via `rust-toolchain.toml`, `cargo build --locked --release --target wasm32-unknown-unknown -p mgc-wasm`, then `wasm-bindgen --target nodejs` 0.2.129 (matches `Cargo.lock`). The cargo target dir was a short temp path because the linker failed on the long scratchpad path; the output does not depend on it.
- Byte-identical: `mgc_wasm_bg.wasm` c7f0f294a3de9913c9e71e2a35926d60eb79fa6c45856aa08cf7f2f552f3d1d0, `mgc_wasm.d.ts` 3495bf174b623b4e0257aaf290b0190cac238a9b16951e85a5d42626a76bfdca, `mgc_wasm_bg.wasm.d.ts` eb407ee7fd93dd27f5e543261ca65cdd184357b41f6adf59f5e4fbc8e287e6d8.
- `mgc_wasm.js`: shipped 3cfc4c527baa77c3964e43a66c9d7eda11a25c7278b57137c9bfdf66b6eec147; generated 63d38046e9e00418043a6291937b03b817df75b333c9b00ee3f2899b5a3c93e2 (equal to the private `pkg/mgc_wasm.js`). Only difference: the `.wasm` path line, `${__dirname}/mgc_wasm_bg.wasm` replaced by `require('path')` + `path.join(__dirname, 'mgc_wasm_bg.wasm')`. A manual post-build patch, recorded as such.
- wasm-opt: not applied (bytes reproduce without it). Agy reports `wasm-pack build --target nodejs --release`; wasm-pack was not installed or run, so whether wasm-pack would add a wasm-opt pass is untested. wasm-pack versions and wasm-opt are therefore recorded as not used, not as unknown-and-assumed.
- Tools installed: none. `wasm32-unknown-unknown` for 1.98.1 and `wasm-bindgen` 0.2.129 were already present.

### Tests and pack (final)
- 375 (at 0778caf) -> 383 (self-test and B1 tests) -> 396 (hook installer tests), 396 pass, 0 fail.
- `npm pack --dry-run`: 33 files, 343.4 kB, `wasm/` (4 files) and `dist/hookInstaller.*` included, no test files.
- Scratch install of the packed tarball: `@moonglade/provenance/self-test` 6/6 at 2.6.1, `@moonglade/provenance/wasm` resolves, `provenance test` exits 0, `provenance install-hooks --pre-commit` creates then updates the hook in a fresh repo.
