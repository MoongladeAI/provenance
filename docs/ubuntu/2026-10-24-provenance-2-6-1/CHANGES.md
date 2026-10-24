# CHANGES - public repo @moonglade/provenance 2.6.1

Branch `release/2.6.1`, worktree `D:\Development 2.0\Repos\Public\moonglade-provenance-wt-2.6.1`, based on Agy's `0778caf` (public main, unpushed). Signed with the Claude agent key `148A31AA...D7A5` (worktree-local config). No push, tag, merge or publish. Main checkout untouched. Private-side record: `release/2.6.1-housekeeping` (`80965ad`) in `moonglade-provenance`.

## Commits on top of 0778caf
1. `532ae57` feat: `./self-test` export in `packages/provenance-ts/package.json` (`./wasm` kept), new `binary-regression.test.js` and `self-test-export.test.js` (byte-identical to the private branch: sha256 11df53da..., 2350569d...), version 2.6.1 in root `package.json`, `package-lock.json` (root, root workspace entry, and the `packages/provenance-ts` entry which was stale at 2.5.0) and `CITATION.cff`.
2. `b8e3255` docs: root `CHANGELOG.md` 2.6.1 entry (self-test export and CLI, B1 test, WASM export, hook installer, README); root `README.md` title and version line to 2.6.1; package `README.md` title, plus a paragraph on self-test, `/wasm`, `install-hooks`.
3. `93e1e85` chore: refresh `PUBLIC_SOURCE_IMPORT.json`.
4. This docs commit (this file, AGY-WORKTREE-SNAPSHOT.md).

## Deliberate edits to Agy's files (README.md and package.json only)
- Package README: Agy's edit left "Run these commands from the repository root:" with no commands (`npm ci`, `npm test` were removed). I restored the code block.
- Everything else of Agy's is untouched; `artifact-cli.ts`, `hookInstaller.ts`, `wasm/*` are byte-identical to `0778caf`.

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
- `hookInstaller.ts`: `installGitHook` overwrites any existing `.git/hooks/pre-commit` without asking or backing up. The installer sets `mcpAutoSeal: true` in `.provenance-hooks.json` although the prompt offers only pre-commit and MCP gates. `PRE_PUSH_SCRIPT` audits nothing (loop body is a comment; always exits 0) but is exposed as a manifest option. `findGitRoot` ignores worktrees and submodules (`.git` file).
- `packages/provenance-ts/README.md` line 87 ("Default hooks, platform keystores, the hook CLI and sibling packages are excluded") and `TESTING.md` line 47 now sit awkwardly with the shipped hook installer and WASM export, and the hook installer has no tests. Not edited.
- WASM `mgc_wasm*` is a build product of `mg-crypto-core` with no source or build step in this repo; provenance of the binary is unverified here.
- `SECURITY.md` still says "Version 2.6.0 is a release candidate"; `TESTING.md` is titled for the 2.6.0 candidate. Not edited.
- Self-test condition 4 writes a temp dir under the package root, so a read-only install would fail it.
