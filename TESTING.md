# Testing 2.7.0

## Run the suite

Use Node 22 or 24 on Windows or Linux. From the repository root:

```sh
npm ci
npm test
npm run self-test
```

The test command removes `dist`, compiles TypeScript into `dist`, and runs Node's built-in test runner via `node -r ./test-harness.cjs --test src/*.test.js` against the compiled output (there is no runtime Jest dependency; `packages/provenance-ts/test-harness.cjs` provides a zero-dependency compatibility shim over `node:test` and `node:assert/strict`, and legacy `packages/provenance-ts/jest.config.js` is unused). The manifests and lockfile pin `TypeScript 5.9.3` and `@types/node 22.20.4`.

The `2.7.0` workspace contains **19 `.test.js` suites** under `packages/provenance-ts/src/`.

### Pre-release Verification State for 2.7.0 Staging

- **Rust workspace (`1188ed841b5831bc743e4f23ccd505a08b108ee7`)**: Passed `cargo clippy --locked --workspace --lib --bins` (exit 0), `cargo test --locked --workspace` (`mgc-wasm` `6/6` passed), and release `wasm32-unknown-unknown` build (`12.93s`).
- **Node / WASM integration**: `wasm-270.test.js` has been added to test `parse_openpgp_armored_signature_hex` and `verify_rfc3161_timestamp`, and `packages/provenance-ts/wasm/` requires local regeneration via `wasm-bindgen --target nodejs` before executing the full `npm test` + `npm run self-test` verification pass on `2.7.0` (tracked in `docs/ubuntu/2026-11-14-provenance-2-7-0/QA.md`). No `2.7.0` `npm test` run is claimed as passed until that local rebuild and test run complete.

## Suites

All 19 suites are under `packages/provenance-ts/src`:

| Suite | Coverage |
|---|---|
| `index.test.js` | Canonical bytes, signing, mutation, bundle versions, claims, scope and countersigning |
| `binding.test.js` | Signed payload fields, replay, incomplete bundles and unverifiable attestations |
| `canonical-alignment.test.js` | Cross-engine canonicalization and draft `-01-mg2.7.0` claims JCS alignment |
| `binary-regression.test.js` | Binary fidelity regression checks across binary extensions and NUL-byte streams |
| `merkle.test.js` | Golden roots, odd-node promotion, inclusion proofs and vault scans |
| `timestamp.test.js` | DER helpers, response structure, acquisition failures, endpoint scheduling and synthetic tokens |
| `timestamp-security.test.js` | CA trust, self-signed integrity-only tokens, ESS/EKU/KeyUsage, expiration, wrong anchors/imprints, time binding, response limits and deadlines |
| `dta-config-guards.test.js` | DTA configuration guards and boundary checks |
| `dta-l3-integration.test.js` | Tier 3 Byzantine median quorum integration checks |
| `mcp.test.js` | The three read-only tools, keyless output, blocked gates and scope policy |
| `artifactHook.test.js` | Observation, provisional sealing, exclusions and refusal of attested moves |
| `artifactEnvelope.test.js` | Envelope schema and artifact identity helpers |
| `badge.test.js` | Badge formatting (ANSI/HTML/Shields/Markdown), status labels, and filesystem status |
| `hookInstaller.test.js` | Hook installer CLI, `@moongladeai/provenance` pre-commit script, and `--package=@moongladeai/provenance provenance-gate` manifest |
| `hookInstaller-safety.test.js` | Unmodified 2.6.1 in-place hook upgrade and modified-hook `HookConflictError` safety checks |
| `self-test.test.js` | The six built-in self-test conditions |
| `self-test-export.test.js` | Subpath export `@moongladeai/provenance/self-test` verification |
| `release-security.test.js` | Malformed UTF-8/JSON, claims stripping, versions, signer policies, scope replay, key algorithms, countersigning refusal, `HASH_ONLY` & forged badges, CLI exits, move collisions/rollback, proof substitution, junction escape and stdio MCP |
| `wasm-270.test.js` | `parse_openpgp_armored_signature_hex` (RFC 4880/9580 V4 alg 22, CTB `0x88`/`0xc2`, CRC-24/error guards) and `verify_rfc3161_timestamp` (`status: 'granted'`, `tst_info.gen_time`, `ERR_TSR_*` boundaries) |

## Fixtures and prerequisites

Tests use ephemeral synthetic Ed25519/RSA keys, local HTTP servers, temporary files and filesystem links. They need no production key, keyring or private corpus. The default suite does not call live timestamp services.

Some Windows application sandboxes block loopback connections, junctions or hard links. Use a local account allowed to create those fixtures. Do not suppress a blocked test and report the suite as passing.

The built-in self-test checks any package-root sidecar hashes and states that it has not verified package signatures. This candidate intentionally ships no document sidecars.

## Limits

The default tests do not establish live public TSA availability, certificate revocation status, macOS behavior or safety against a concurrent hostile filesystem writer. OpenPGP/SSHSIG signature trust is unsupported by `verifyDocument`; `parse_openpgp_armored_signature_hex` provides structural packet extraction only, and `verify_rfc3161_timestamp` performs DER `messageImprint` structural inspection without CMS/X.509 certificate verification. The legacy library OpenPGP signing helper and real GPG/SSH signing are not covered by this suite. Platform keystores and sibling packages are excluded from this release. The optional git pre-commit hook installer (`provenance install-hooks`) is covered by tests that create temporary git repositories; the hook script itself is not exercised end to end against `npx`, and the MCP options are recorded in `.provenance-hooks.json` (`npx -y --package=@moongladeai/provenance provenance-gate`) but not enforced by the installer.

Historical release audits for 2.6.0 and 2.6.1 are preserved in `CHANGELOG.md` and `docs/ubuntu/2026-10-24-provenance-2-6-1/QA.md`. The `2.7.0` staging audit, audit findings, and pending local WASM/Node test verification checklist are recorded in `docs/ubuntu/2026-11-14-provenance-2-7-0/QA.md`. Any later package change needs its own verification.
