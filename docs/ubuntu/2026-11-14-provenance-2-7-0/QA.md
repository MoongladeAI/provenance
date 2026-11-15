# QA - `@moongladeai/provenance` 2.7.0 Staging Candidate

Audit date: `2026-11-14` (`Public/moonglade-provenance` against frozen Rust source commit `1188ed841b5831bc743e4f23ccd505a08b108ee7` in `moonglade-provenance`).

## Verdict: CONDITIONAL PASS (Documentation & Code Staging Complete; Local Binary Rebuild & Test Run Required Before Tag/Publish)

All documentation, manifest, hook-installer, protocol specification (`-01-mg2.7.0`), and TypeScript test authoring steps completed across four parallel **Claude & Codex** audit sweeps and remediations. **No `2.7.0` TypeScript test suite pass or release publication is claimed yet** because `packages/provenance-ts/wasm/` still holds `2.6.1` bindings pending local `wasm-bindgen --target nodejs` execution (which also unblocks `npm test`, `npm run self-test`, and `PUBLIC_SOURCE_IMPORT.json` hash recomputation).

---

## Pre-Release Verification Ledger

| Check | Status | Notes |
|---|---|---|
| Rust `cargo clippy --locked --workspace --lib --bins` (`1188ed8`) | **PASSED** (exit 0) | Run against clean private monorepo `1188ed8` before staging |
| Rust `cargo test --locked --workspace` (`1188ed8`) | **PASSED** (`mgc-wasm` `6/6`) | Run against `1188ed8` |
| Clean-archive release WASM `cargo build --locked --release --target wasm32-unknown-unknown -p mgc-wasm` | **PASSED** (`12.93s`, exit 0) | Clean tarball export of `1188ed8` (`rustc 1.98.1`, `wasm-bindgen 0.2.129`) |
| `wasm-bindgen --target nodejs` -> `packages/provenance-ts/wasm/` | **PENDING (Operator)** | Required before `npm test` and `npm pack`; `wasm/` still has `2.6.1` files |
| `npm test` (all 19 `.test.js` suites incl. `wasm-270.test.js`) | **PENDING (Operator)** | Blocked on `wasm/` regeneration; do not tag until green |
| `npm run self-test` & `git rm` (`-03.md`, `jest.config.js`) | **PENDING (Operator)** | Execute after `wasm/` regeneration |
| `npm audit --json` & `PUBLIC_SOURCE_IMPORT.json` refresh | **PENDING (Operator)** | Recompute after `wasm/` rebuild and `git rm` |

---

## Multi-Stage Claude & Codex Audit Summary

### Stage 1 Audit (Manifests, Hook Installer & Unit Tests)
- **Verified**: Package rename `@moonglade/provenance` -> `@moongladeai/provenance` (`2.7.0`), `CITATION.cff`, CI workflows, `hookInstaller.ts` in-place upgrade preservation via `LEGACY_261_PRE_COMMIT_SCRIPT`, and scoped MCP invocation (`npx -y --package=@moongladeai/provenance provenance-gate`).
- **Rust Parser Audit on Frozen `1188ed8`**: Identified edge boundaries in `crates/mgc-core/src/rfc3161.rs` and `crates/mgc-wasm/src/openpgp.rs`. Per staging policy, `1188ed8` source code remained frozen for `2.7.0`, parser boundaries were documented in `-01-mg2.7.0.md` and `TIMESTAMP.md`/`README.md`, and parser hardening items were logged in the `2.7.1` Backlog below.

### Stage 2 Audit (Specification Alignment: `draft-ottley-agentic-epistemic-provenance-01-mg2.7.0.md`)
Cross-checked line by line against `rfc3161.rs`, `openpgp.rs`, `crates/mgc-wasm/src/lib.rs`, `packages/provenance-ts/src/index.ts`, `timestamp.ts`, and `badge.ts`. All surfaced findings were remediated in `draft-ottley-agentic-epistemic-provenance-01-mg2.7.0.md`:
1. Separated indefinite/non-minimal DER length error (`ERR_TSR_DER_INVALID_LENGTH`) from constructed tag mismatch (`ERR_TSR_DER_UNEXPECTED_TAG`), corrected `PKIStatus` JSON casing (`"granted"` / `"granted_with_mods"`), documented `ERR_TSR_UNSUPPORTED_STATUS` (`>= 6`) vs `ERR_TSR_STATUS_REJECTED` (`2..5`), scoped `ERR_TSR_INVALID_DIGEST_LEN` to caller `expected_digest`, and detailed `TimeStampResp`-only input and inner trailing-byte behavior.
2. Expanded Section 3.4 CTB coverage to `0x88`–`0x8B` and `0xc2`, documented `1 <= bit_len <= 256` MPI limits (`div_ceil(8) <= 32`) and non-minimal padding tolerance, and corrected `verifyDocument` behavior (`INDETERMINATE` only when `unknownMethods` accompanies a declared Moonglade Ed25519 entry, evaluated pre-verification; `status` omitted on unsupported-only bundles).
3. Aligned Section 4.1 Tier 1/Tier 2 definitions with `timestamp.ts` (`INTEGRITY_ONLY` by default unless `trustAnchors` + `ESSCertIDv2` validate `ANCHORED`), noted BER/trailing-byte checks and `ESSCertIDv2` mandatory policy in Profile A, marked Section 6 XRPL anchoring unimplemented in `2.7.0`, aligned the 45-octet `MemoData` ASCII diagram on 32-bit boundaries, documented Section 7 TS vs Rust outcome mapping, and added missing `[RFC7231]`, `[RFC9580]`, `[RFC3339]`, `[RFC5280]`, `[RFC5652]`, `[RFC5816]`, `[RFC6962]`, and `[XRPL-TX]` references.

### Stage 3 Audit (Tracked & Untracked Documentation & Trust Boundaries)
Cross-checked all 9 edited docs and 5 untouched sibling docs against TypeScript sources and manifests. Remediations applied:
1. Corrected all references to `ProvenanceEngine.verifyTimeStampToken` -> top-level `verifyTimeStampToken` (or `ProvenanceEngine.verifyDocument` with `timestampTrustAnchors`) across `packages/provenance-ts/README.md`, `SECURITY.md`, `SPEC.md`, and `docs/WHY_NOT_COMPARATIVE_ANALYSIS.md`.
2. Removed non-functional `provenance-gate --help` (which blocks reading JSON-RPC 2.0 on `stdin`) from `README.md` and added `provenance install-hooks` to the CLI block in `packages/provenance-ts/README.md`.
3. Fixed `CHANGELOG.md` hook description to `npx --no-install @moongladeai/provenance badge "$TARGET" --short`, fixed `"tier": "INTEGRITY_ONLY"` and exact error messages in `SPEC.md` and `PDF_MANAGEMENT.md`, fixed `HASH_ONLY` test attribution in `TESTING.md` (`release-security.test.js` vs `badge.test.js`), and removed trailing literal `\n` from `PDF_MANAGEMENT.md`.
4. Added explicit keyless `HASH_ONLY` / `formatHtmlBadge` non-authorization warnings in `README.md`, `packages/provenance-ts/README.md`, `SECURITY.md`, `SPEC.md`, and `PDF_MANAGEMENT.md`; replaced `ProvenanceEngine.generateEd25519KeyPair()` and fixed missing `verificationKeys` in `PDF_MANAGEMENT.md` (`countersignDocument` example); refined CARICOM citizen-PKI wording in `WHY_NOT_COMPARATIVE_ANALYSIS.md`; updated `mcp.ts:16` tool description; replaced local test fixture path in `badge.test.js:80,83` with `/workspace/docs/README.md`; sanitized line 296 of `-03.md` prior to `git rm`.

### Stage 4 Audit (Final Sweep & Remediation)
- Final parallel Claude & Codex audit pass over `CHANGES.md`, `QA.md`, `mcp.ts`, `badge.test.js`, `-01-mg2.7.0.md`, and Stage 1–3 files verified zero Windows/local drive paths (`C:\`, `D:\`, `d:/`, `c:/`) across all readable files, zero `packages/provnat-core` leaks across all Stage 1–4 modified or newly created files, and accurate Rust-passed vs Node-pending status in `QA.md` and `CHANGES.md`.
- Remediated all actionable Stage 4 findings: corrected `SPEC.md` JCS `undefined` rejection behavior and LaTeX/escape backslashes, corrected `PDF_MANAGEMENT.md` `canonical_text` UTF-8/leading-BOM/CRLF formula and LaTeX backslashes, aligned `-01-mg2.7.0.md` §7 TypeScript `INDETERMINATE` notes with `index.ts` (missing signer keys omit `status`; non-Ed25519 supplied keys and hybrid unsupported+Ed25519 bundles return `INDETERMINATE`), removed inaccurate wording in `CHANGES.md` regarding `ProvenanceEngine.generateEd25519KeyPair()`, and clarified below that pre-existing upstream `2.6.1` vector provenance files (`vectors/canonical.golden.json`, `packages/provenance-ts/src/canonical.golden.json`, `vectors/canon-legacy/legacy-text-profiles.json`, `vectors/canon-legacy/generate_fixtures.py`) remain intentionally frozen in `2.7.0`.

---

## `2.7.1` Hardening Backlog (Deferred Outside `2.7.0` Freeze)

1. **`crates/mgc-core/src/rfc3161.rs` (Frozen at `1188ed8` for `2.7.0`)**:
   - Fix `parse_tst_info` -> `parse_accuracy` double `TAG_SEQUENCE` unwrap so tokens containing optional `TSTInfo.accuracy` succeed instead of failing with `ERR_TSR_DER_UNEXPECTED_TAG` (non-empty) or `ERR_TSR_DER_TRUNCATED` (empty `SEQUENCE {}`).
   - Bind `MessageImprint.hashAlgorithm` OID directly to `expected_digest.len()` and reject unrecognized or weak hash OIDs (do not validate digest length independently of OID).
   - Reject trailing DER bytes after inner structures inside `TimeStampResp`, `ContentInfo`, `SignedData`, `EncapsulatedContentInfo`, `AlgorithmIdentifier`, and `MessageImprint`, plus unexpected/duplicate optional tags in `TSTInfo`.
   - Enforce calendar range bounds (month/day/hour/minute/second) in `decode_generalized_time` beyond ASCII digit/`Z` syntax checks.
   - Wire or remove the unused `ERR_TSR_MISSING_TST_INFO` constant (missing `eContent` currently yields `ERR_TSR_DER_TRUNCATED`).
2. **`crates/mgc-wasm/src/openpgp.rs` (Frozen at `1188ed8` for `2.7.0`)**:
   - Validate signature type and hash algorithm octets rather than skipping them blindly.
   - Store and enforce declared OpenPGP packet length against remaining slice length and reject trailing octets past MPI `S`.
   - Enforce RFC 4880/9580 §3.2 canonical MPI leading-bit rules instead of accepting leading zero octets within 32 bytes.
   - Reject trailing non-whitespace characters past the 4 Base64 characters on the `=XXXX` CRC-24 checksum line.
3. **Cross-Engine Protocol, CLI & Metadata Alignment**:
   - Align TypeScript `ProvenanceEngine.verifyDocument` and `badge.ts` with Section 7's four-valued `status` vocabulary (`VERIFIED`, `TAMPERED`, `INVALID`, `INDETERMINATE`) across hash mismatch, invalid signature, missing key, and unsupported-only paths, and validate declared Ed25519 signatures before returning `INDETERMINATE` on hybrid bundles.
   - Complete fallback CLI usage strings in `packages/provenance-ts/src/artifact-cli.ts:39,75` (`verify` in general usage; `--format=html` and `--color` in `badge` usage).
   - Update `crates/mgc-core/src/jcs.rs` and `verdict.rs` comments from `Draft -03` to `-01-mg2.7.0`.
   - Regenerate frozen `2.6.1` upstream-provenance vector fixtures and generator metadata (`vectors/canonical.golden.json`, `packages/provenance-ts/src/canonical.golden.json`, `vectors/canon-legacy/legacy-text-profiles.json`, and `vectors/canon-legacy/generate_fixtures.py`) with neutral generator metadata notes (and optionally clean historical internal script comments in `packages/provenance-ts/src/index.test.js:237` and `packages/provenance-ts/src/merkle.ts:29`).
   - Optionally explore moving Section 6 XRPL `AccountSet` anchoring from planned spec status into an optional module.

---

## Pre-Existing Untracked Files (Unstaged Per Policy)

Four pre-existing untracked files remain in the working tree outside staged `git add`:
- `docs/WHY_NOT_COMPARATIVE_ANALYSIS.md` (updated in place for `2.7.0` claims accuracy)
- `packages/provenance-ts/PDF_MANAGEMENT.md` (updated in place for `2.7.0` API/claims accuracy)
- The two pre-existing `2.6.1` release PDFs (untouched)

Decide explicitly at release time whether to keep these untracked/excluded or include the updated markdown docs in a separate commit.

---

## Operator Pre-Publication Terminal Checklist

Run from `Public/moonglade-provenance` after generating the release WASM binary from clean private commit `1188ed841b5831bc743e4f23ccd505a08b108ee7`:

```sh
# 1. Regenerate 2.7.0 WASM JS/TS bindings from clean 1188ed8 release build:
wasm-bindgen --target nodejs --out-dir packages/provenance-ts/wasm <path-to-1188ed8-release>/mgc_wasm.wasm

# 2. Clean install, full TypeScript build + all 19 .test.js suites, and self-test:
npm ci
npm test
npm run self-test

# 3. Remove superseded -03 draft and unused Jest config:
git rm docs/draft-ottley-agentic-epistemic-provenance-03.md packages/provenance-ts/jest.config.js

# 4. Refresh security audit & public provenance manifest:
npm audit --json > dependency-audit.json
# Update PUBLIC_SOURCE_IMPORT.json (version "2.7.0", wasm_provenance commit 1188ed8..., new wasm/* & copied_files LF SHA-256 digests)
```
