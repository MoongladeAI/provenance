# CHANGES - Public Staging Candidate `@moonglade/provenance` 2.7.0

Release staging preparation date: `2026-11-14` in `Public/moonglade-provenance`. Private monorepo checkout (`moonglade-provenance`) remains untouched at frozen Rust source commit `1188ed841b5831bc743e4f23ccd505a08b108ee7` (matching the `2.6.1` practice where package housekeeping lives on a dedicated release branch without mutating `main`).

## Summary of `2.6.1 -> 2.7.0` Changes Staged

### 1. Package Namespace Retention & Manifest Maintenance (`@moonglade/provenance`)
- Maintained canonical company-level `@moonglade/provenance` `2.7.0` across `package.json`, `packages/provenance-ts/package.json`, `package-lock.json`, `CITATION.cff`, and `.github/workflows/ci.yml`.
- Updated `repository`, `homepage`, and `bugs` URLs in `packages/provenance-ts/package.json` to `github.com/MoongladeAI/provenance` while keeping all `exports` (`"."`, `"./self-test"`, `"./wasm"`, `"./package.json"`) and zero runtime dependency additions (`asn1js 3.0.10`, `pkijs 3.4.1`).

### 2. Hook Installer & Scoped `npx` MCP Binary Resolution (`packages/provenance-ts/src/hookInstaller.ts`)
- Generated pre-commit hook executes `npx --no-install @moonglade/provenance badge "$TARGET" --short`.
- Preserved the exact immutable `2.6.1` hook script literal as `LEGACY_261_PRE_COMMIT_SCRIPT` inside `KNOWN_GENERATED_HOOKS` so unmodified `2.6.1` pre-commit hooks upgrade cleanly in place (`action === 'updated'`, `backup === undefined`, no `.bak-` file), while customized hooks fail closed with `HookConflictError` (or back up under `--force`).
- Fixed `.provenance-hooks.json` and printed MCP setup snippets to emit `command: 'npx'` with `args: ['-y', '--package=@moonglade/provenance', 'provenance-gate']` instead of bare `@moonglade/provenance provenance-gate`, preventing `npx` from dispatching the default `provenance` binary (`dist/artifact-cli.js`).

### 3. TypeScript Engine, MCP Schema & Test Suites
- **`packages/provenance-ts/src/index.ts`**: Aligned draft references in comments to `draft -01-mg2.7.0`.
- **`packages/provenance-ts/src/mcp.ts`**: Updated `MCP_TOOLS[0]` (`verify_artifact_provenance`) description to distinguish hybrid bundles containing an unsupported attestation method alongside a declared Ed25519 attestation (`INDETERMINATE`, fail closed) from bundles containing only external methods (`verified: false`, fail closed as unverified).
- **Updated Existing Test Suites**:
  - `packages/provenance-ts/src/hookInstaller.test.js`: Verifies `@moonglade/provenance` in generated pre-commit hook and `['-y', '--package=@moonglade/provenance', 'provenance-gate']` in `.provenance-hooks.json`.
  - `packages/provenance-ts/src/hookInstaller-safety.test.js`: Imports `LEGACY_261_PRE_COMMIT_SCRIPT`, asserts unmodified `2.6.1 -> 2.7.0` in-place upgrade without `.bak-` files, and verifies modified `2.6.1` hooks throw `HookConflictError`.
  - `packages/provenance-ts/src/index.test.js`, `canonical-alignment.test.js`, `release-security.test.js`: Updated `@moonglade/provenance` / `draft -01-mg2.7.0` labels and headers.
  - `packages/provenance-ts/src/badge.test.js`: Replaced hardcoded local drive test fixture path on lines 80 and 83 with platform-neutral `/workspace/docs/README.md`.
- **New `2.7.0` WASM Parity Suite**:
  - Added `packages/provenance-ts/src/wasm-270.test.js` testing `parse_openpgp_armored_signature_hex` (RFC 4880/9580 V4 Algorithm `22`, `0x88` old-format and `0xc2` new-format CTBs with subpackets, CRC-24 error, non-22 error, malformed armor error) and `verify_rfc3161_timestamp` (`status === 'granted'`, `tst_info.gen_time === '2026-11-14T12:00:00Z'`, `ERR_TSR_DIGEST_MISMATCH`, `ERR_TSR_INVALID_DIGEST_LEN`, `ERR_TSR_STATUS_REJECTED`, and `ERR_TSR_DER_UNEXPECTED_TAG` for constructed `0x24` `hashedMessage` and `eContent` tags). *Pending local `wasm-bindgen` rebuild before execution.*

### 4. Protocol Draft (`docs/draft-ottley-agentic-epistemic-provenance-01-mg2.7.0.md`)
- Created `docs/draft-ottley-agentic-epistemic-provenance-01-mg2.7.0.md` (`date: 2026-11-14`, `Expires: May 18, 2027`) aligned `1:1` with `@moonglade/provenance` `2.7.0`, replacing internal generator path references in `-03` history (`Appendix B`) and in `docs/draft-ottley-agentic-epistemic-provenance-03.md:296` with `vectors/canonical.golden.json` prior to `git rm` of `-03.md`.
- Added **Section 1.3** (`-01-mg<semver>` pre-submission naming scheme), **Section 3.4** (`parse_openpgp_armored_signature_hex` structural V4 `EdDSALegacy` packet profile, CTB range `0x88`–`0x8B` and `0xc2`, 1024-byte limit, CRC-24 check, security boundaries, and exact `verifyDocument` / `mgc-core` `INDETERMINATE` behavior), and **Section 4.3** distinguishing **Profile A** (`verifyTimeStampToken` PKI/CMS/EKU/`ESSCertIDv2` full TSA verification) from **Profile B** (`verify_rfc3161_timestamp` / `mgc-core::verify_rfc3161_imprint` DER `TimeStampResp` imprint structural inspection, `ERR_TSR_*` error table, and frozen `1188ed8` `TSTInfo.accuracy` limitation).
- Corrected Section 4.1 Tier 1/Tier 2 wording to reflect actual `timestamp.ts` behavior (`INTEGRITY_ONLY` default unless caller-supplied `trustAnchors` + `ESSCertIDv2` validate `ANCHORED`), word-aligned the Section 6.2 `MemoData` 45-octet ASCII diagram and marked XRPL anchoring as an unimplemented optional extension, added Section 7 implementation mapping notes, and added `[RFC7231]`, `[RFC9580]`, `[RFC3339]`, `[RFC5280]`, `[RFC5652]`, `[RFC5816]`, `[RFC6962]`, and `[XRPL-TX]` citations.

### 5. Tracked & Untracked Documentation Hardening
- Updated tracked markdown docs: `README.md`, `packages/provenance-ts/README.md` (with `2.6.x -> 2.7.0` upgrade guide, `install-hooks` CLI listing, top-level `verifyTimeStampToken` distinction, pending `wasm/` rebuild disclosure, and keyless `HASH_ONLY` / `formatHtmlBadge` non-authorization warning), `CHANGELOG.md`, `TESTING.md` (replaced stale Jest/`230 tests` text with accurate `node:test` via `test-harness.cjs`, all 19 `.test.js` suites, and honest Rust-verified / Node-pending status), `SECURITY.md`, `packages/provenance-ts/SPEC.md` (`-01-mg2.7.0`, `"tier": "INTEGRITY_ONLY"`, `undefined` rejection in JCS, single-backslash LaTeX/escape formatting, exact error messages, and Section 7 Trust Boundaries), and `packages/provenance-ts/TIMESTAMP.md`.
- Updated both pre-existing untracked markdown docs in place without staging or deleting any of the 4 untracked files:
  - `docs/WHY_NOT_COMPARATIVE_ANALYSIS.md`: bumped to `2.7.0`, removed unverified `0.05 ms` / sub-millisecond timing claims and native citizen-PKI signature wrapping overclaims (clarifying external VCs/PKI certs are committed metadata in canonical v3 `claims` verified externally).
  - `packages/provenance-ts/PDF_MANAGEMENT.md`: bumped to `2.7.0` / `@moonglade/provenance`, removed `< 1 millisecond` claim, standardized quickstart keypair generation on Node.js `crypto.generateKeyPairSync('ed25519', ...)` (`ProvenanceEngine.generateEd25519KeyPair()` remains available as a PEM wrapper in `index.ts`), fixed `countersignDocument` call to pass `{ verificationKeys: { "marc@moongladeai.net": marcPub } }`, fixed `canonical_text` UTF-8/CRLF/leading-BOM formula, `"tier": "INTEGRITY_ONLY"`, single-backslash LaTeX formatting, and error message wording, removed trailing literal `\n`, and added keyless `HASH_ONLY` / `formatHtmlBadge` security warning.

## Rust & WASM Clean-Archive Status (`1188ed841b5831bc743e4f23ccd505a08b108ee7`)
- Source commit `1188ed841b5831bc743e4f23ccd505a08b108ee7` in the private `moonglade-provenance` monorepo passed `cargo clippy --locked --workspace --lib --bins` (exit 0) and `cargo test --locked --workspace` (`mgc-wasm` `6/6` passed).
- Clean tarball export of `1188ed8` built release `wasm32-unknown-unknown` (`cargo build --locked --release --target wasm32-unknown-unknown -p mgc-wasm`, `rustc 1.98.1 (48a229cea 2026-09-01)`, `cargo 1.98.1 (797e8a9bc 2026-08-05)`, `wasm-bindgen 0.2.129`) in `12.93s` (exit 0).
- `wasm-bindgen --target nodejs` generation into `packages/provenance-ts/wasm/` was not executed in this environment and remains a mandatory operator pre-publication step; `packages/provenance-ts/wasm/` currently retains the `2.6.1` artifacts (`README.md`, `TESTING.md`, `SPEC.md`, and `TIMESTAMP.md` disclose this explicitly, with zero fabricated `2.7.0` SHA-256 hashes).

## Suggested Private Monorepo Follow-up (`release/2.7.0-housekeeping`)
- Leave `moonglade-provenance` `main` clean at `1188ed841b5831bc743e4f23ccd505a08b108ee7`.
- When creating a private `release/2.7.0-housekeeping` branch (merging `release/2.6.1-housekeeping` onto `1188ed8`), cherry-pick or sync the Stage 1–4 TypeScript (`hookInstaller.ts`, `index.ts`, `mcp.ts`, tests), manifest, `spec/` / `docs/draft-ottley-agentic-epistemic-provenance-01-mg2.7.0.md`, and package docs after local `wasm-bindgen --target nodejs` + `npm test` verification passes.
