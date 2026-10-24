# Changelog

## 2.6.1, 2026-10-24

Housekeeping release. No behaviour changes to verification, canonicalization, signing or timestamps.

- **Self-test export**: `@moonglade/provenance/self-test` is now a declared package export (types, require, default), so `runSelfTests` and `printSelfTestReport` resolve by package name instead of failing with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Self-test CLI**: `provenance test` with no file argument runs the self-test suite and exits non-zero on any failure (`--json` for a machine-readable report). `test <file>` behaviour is unchanged. This path already worked in 2.6.0; it is now covered by tests.
- **B1 regression test**: sealed binary artifacts (PNG-like, ONNX-like, unknown extension with NUL bytes) fail verification after a one-byte mutation or a CRLF-to-LF rewrite. It passed against unchanged 2.6.0 behaviour.
- **WASM core export**: `@moonglade/provenance/wasm` (the `wasm/` directory, included in the package `files`). The files shipped in the 2.6.0 npm tarball but were never committed to this repository; they are committed now. Their origin is documented: all four files were rebuilt byte for byte from the private monorepo at `84ff58c` (rustc 1.98.1, wasm-bindgen 0.2.129, `--target nodejs`). `mgc_wasm.js` is the pristine generated file: the copy that shipped in 2.6.0 had one line hand-patched (`path.join` for the `.wasm` path), and 2.6.1 ships the unpatched output, which also loads on Windows (see `wasm_provenance` in `PUBLIC_SOURCE_IMPORT.json`).
- **Hook installer**: `provenance install-hooks` (alias `hooks`) installs a git pre-commit verification gate and writes `.provenance-hooks.json` (plus an MCP configuration snippet if an MCP option is chosen). First published in 2.6.1; it was not in the 2.6.0 tarball. Behaviour:
  - It never overwrites silently. A hook counts as ours only if its whole content equals a hook this tool generated. An existing hook that is anything else (foreign, an edited copy of ours, or one that merely mentions the marker) is refused unless `--force`, which first backs it up to `<hook>.bak-<UTC timestamp>`. An existing `.provenance-hooks.json` that is not in the tool's own shape is backed up before it is rewritten; recorded MCP choices are kept and the manifest says `preCommit: true` while our hook is installed.
  - It enables only what is chosen, by flags (`--pre-commit`, `--mcp-verify-read`, `--mcp-auto-seal`, `--force`) or per-option prompts in a terminal. With no flags and no terminal it changes nothing and exits 2. There is no hidden `mcpAutoSeal`.
  - The generated hook needs bash and reads `git diff --cached -z`, so staged names with spaces, non-ASCII characters or a leading dash are verified; it blocks the commit if the staged list cannot be read.
  - `--mcp-verify-read` and `--mcp-auto-seal` only record a choice in `.provenance-hooks.json` and print an MCP configuration snippet. Nothing in this package reads that file yet.
  - Ending input (Ctrl-D) at an interactive prompt exits 1 with "cancelled, nothing changed" and writes nothing. A hook installed from a linked worktree applies to all worktrees of the repository, and a shared `core.hooksPath` affects every repository using it (documented in the README).
  - The empty pre-push option and the unused `tombstoneDelete` setting are removed (the pre-push script audited nothing).
  - The hooks directory comes from `git rev-parse --git-path hooks`, so linked worktrees and `core.hooksPath` work.
- **Docs**: README installation instructions for the published package. README and TESTING.md no longer say hooks are excluded; SECURITY.md and the TESTING.md title no longer describe 2.6.0 as a release candidate.

## 2.6.0 candidate, 2026-10-22

- **Draft -03 Alignment**: Enforce strict IEEE 754 safe integer value normalization on claims JSON (`draft-ottley-agentic-epistemic-provenance-03` §3.3). Preserve exact raw byte fidelity for known binary formats including `.onnx`.
- **L3 DTA Byzantine Consensus Hardening**: Upgraded Degrading Timestamp Architecture (DTA) L3 network probing with simultaneous multi-tier fanout, mandatory quorum threshold ($\ge 3$ probes), and 3,000 ms max-drift window with median time selection. Added fair queue rotation and exponential backoff circuit breaking.
- **Zero-Dependency Native Test Harness**: Replaced Jest with Node.js 22/24 native `node:test` and `node:assert/strict` test harness (`test-harness.cjs`).
- **Dev-Dependency Reduction**: Purged 314 Jest, Babel, Istanbul, and transitive CLI packages from the public repository lockfile, leaving an audited 13-package footprint with zero vulnerabilities.
- **Test Matrix Parity**: 375/375 unit tests and 6/6 condition self-test suites passing under the native Node runner.

## 2.5.0 candidate, 2026-10-18

- Reject malformed UTF-8 and unsupported JSON values during canonicalization.
- Require exact bundle versions, complete v3 claims and actual Ed25519 keys. Verify the original bundle before countersigning, and enforce caller-supplied scope and signer policies.
- Separate timestamp integrity from certificate-chain trust. Check ESS binding, EKU, KeyUsage and token time. Bound file, sidecar, timestamp, HTTP and MCP inputs.
- Label keyless checks as hash-only. Add a verify command with failure exit codes. Refuse destructive moves and attested moves that require explicit resealing.
- Validate Merkle proof identity and tree geometry, and reject vault symlink traversal.
- Exclude public MCP signing tools, hooks, stale document seals and private integration packages. Add CI, release declarations and audit documentation. Remove unsupported public claims.

Version 2.0 introduced structured signatures that bind scope, signer and artifact hash. Earlier versions are not claimed to satisfy the current verification profile.
