# @moonglade/provenance 2.6.1

Ed25519 signatures, canonical file hashes, RFC 3161 timestamp checks and Merkle inclusion proofs for Node 22 and 24.

## Installation

Install directly from npm:
```sh
npm install @moonglade/provenance
```

Or install globally for the CLI and MCP tools:
```sh
npm install -g @moonglade/provenance
```

## Build from source

Run these commands from the repository root:

```sh
npm ci
npm test
```

Run the built-in self-test with `provenance test` (no file argument; add `--json` for a machine-readable report). It exits non-zero on any failure. Programmatic access: `require("@moonglade/provenance/self-test")` exposes `runSelfTests` and `printSelfTestReport`. The WASM core is available as `require("@moonglade/provenance/wasm")`. `provenance install-hooks [--pre-commit] [--mcp-verify-read] [--mcp-auto-seal] [--force]` installs only what you select (it asks per option in a terminal, and does nothing without flags otherwise). An existing pre-commit hook that this tool did not install is never overwritten: the command refuses, and with `--force` first copies it to `<hook>.bak-<UTC timestamp>`. A hook this tool installed is updated in place. The hooks directory is resolved by `git rev-parse --git-path hooks`, so linked worktrees and `core.hooksPath` work.

## WASM core provenance

`wasm/` is built from the Rust crate `mgc-wasm` (with `mgc-core`) in the private Moonglade monorepo, commit `84ff58c679c64c723f91b101012e7ba884e93020`, with rustc 1.98.1, wasm-bindgen 0.2.129 and `wasm-bindgen --target nodejs`; no wasm-opt pass. Rebuilt from a clean export of that commit, `mgc_wasm_bg.wasm` (sha256 `c7f0f294a3de9913c9e71e2a35926d60eb79fa6c45856aa08cf7f2f552f3d1d0`), `mgc_wasm.d.ts` and `mgc_wasm_bg.wasm.d.ts` are byte-identical to the shipped files. `mgc_wasm.js` matches the generated output except a two-line patch that builds the `.wasm` path with `path.join`. The private source is not published here; hashes and the build commands are in `PUBLIC_SOURCE_IMPORT.json` under `wasm_provenance`.

## Sign and verify

```js
const { ProvenanceEngine } = require('@moonglade/provenance');
// Supply your own Ed25519 keys. Never use the release root key for artifacts.
async function example(file, privateKey, publicKey, root) {
  await ProvenanceEngine.sealDocument(file, privateKey, 'example-signer', 'local', { vaultRoot: root });
  return ProvenanceEngine.verifyDocument(file, publicKey, {
    expectedScope: ProvenanceEngine.scopeFor(file, root),
    requiredSigners: ['example-signer']
  });
}
```

Get trusted public keys through a channel you trust. An editable sidecar cannot establish a signer's identity. A valid signature establishes possession of a key and integrity of the signed payload. It does not prove the content is correct, identify its actual author, or grant the signer authority.

Supply `expectedScope` to bind verification to an expected location or namespace. Use `requiredSigners` when particular signatures are required. The low-level verifier does not infer either policy.

## Canonicalization

For text, the engine removes one leading UTF-8 BOM, converts CRLF to LF and applies Unicode NFC. Bare CR is preserved. Invalid UTF-8 is rejected.

Known binary formats keep their exact bytes. For unknown extensions, a NUL in the first 1024 bytes selects binary handling; otherwise the engine requires valid UTF-8 text. Text integrity follows these normalization rules rather than raw byte identity.

## Verification results

`SEALED` requires a verified Ed25519 signature. With no key, a matching recorded hash is shown in amber as `HASH-ONLY`. The sidecar is editable, so that result provides no signature assurance. Malformed sidecars cannot produce a seal.

Timestamp results are separate: `ABSENT`, `INVALID`, `INTEGRITY_ONLY` or `ANCHORED`. Time comes from the verified token, never an unsigned sidecar field. `ANCHORED` requires caller-supplied CA certificates, chain validation at token time, ESSCertIDv2 and a critical timestamp-only EKU. Certificate revocation is not checked. Without anchors, a valid self-signed TSA token can provide integrity-only evidence. Network or host-clock observations without tokens do not become RFC 3161 attestations.

## CLI

The installed names are `provenance`, `provenance-artifact` and `provenance-gate`. The last starts the MCP server. CLI commands are:

```text
provenance --help
provenance --version
provenance verify <file>
provenance badge <file>
provenance observe <file>
provenance seal-provisional <file>
provenance move <source> <destination>
provenance test [--json]
```

Set `MOONGLADE_PUBLIC_KEY_PEM` for verification. Provisional sealing requires `MOONGLADE_PRIVATE_KEY_PEM` and `MOONGLADE_SIGNER`. The verification root is `MOONGLADE_ROOT`, or the current directory when unset. `MOONGLADE_REQUIRED_SIGNERS` is an optional comma-separated list.

Failed verification and refused sealing return a nonzero exit code. Move refuses destination collisions and any source sidecar. To relocate an attested artifact, copy it, explicitly reseal and verify the destination, then retire the original separately. Existing signatures keep their original scope.

## MCP and filesystem access

The read-only MCP server exposes `verify_artifact_provenance`, `audit_vault_merkle_root` and `assert_gate_status`. It has no signing or hook tools. Each supplied path authorizes a local read under the operator's filesystem permissions. The process is not a sandbox. Connect it only to principals allowed that access.

Gate assertions check the supplied signature and policy; they do not establish human approval or signer authority. Input frames are limited to 1 MiB. File reads reject symlinks and have a 64 MiB limit; sidecars are limited to 1 MiB, and timestamp tokens and responses to 512 KiB. Protect workspace permissions. Concurrent hostile filesystem writers are outside the supported trust model.

## API and limits

`dist/index.d.ts` declares the public exports: the engine, vault, verification policy, canonicalization and bounded reads; Merkle helpers; timestamp parsing, verification and acquisition; badge helpers; artifact and envelope utilities; read-only MCP tools and self-test.

The built-in verifier returns `INDETERMINATE` for OpenPGP and SSHSIG attestations. The legacy library OpenPGP signing helper is not covered by the default test suite; its keyring selection is caller-controlled. Platform keystores and sibling packages are excluded. The optional hook installer (`provenance install-hooks`) installs only a git pre-commit verification gate and writes a manifest of the options you chose; see below.

See [SPEC.md](SPEC.md), [TIMESTAMP.md](TIMESTAMP.md), [NOTICE.md](NOTICE.md) and [trust/README.md](trust/README.md). GPG checks the OpenPGP release identity separately. Artifact verification uses raw Ed25519 SPKI PEM keys. Candidate documentation is intentionally unsealed. The root release key is not an agent key.
