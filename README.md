# @moonglade/provenance

**Local-first cryptographic provenance for Markdown files and agentic AI memory.**

Sign a document, and prove later that it has not changed — and that the claim about *who* sealed it and *at what scope* has not changed either.

> **Status: v2.0.0, open source reference implementation.** *125 tests pass. See [SPEC.md](./SPEC.md) for the developer specification, [draft-ottley-agentic-epistemic-provenance-00.md](./draft-ottley-agentic-epistemic-provenance-00.md) for the formal IETF Internet-Draft, and [FINDINGS.md](./FINDINGS.md) for technical audits.*

---

## What it actually does

| | |
|---|---|
| **Ed25519 signatures** | Over a **structured claim** — version, scope, artifact hash and signer — not over raw bytes |
| **RFC 3161 Timestamps** | **Concurrent Degrading Architecture (DTA)** — parallel L1 DigiCert/Sectigo, L2 FreeTSA/Apple, L3 Network, and L4 Host UTC probes |
| **Model Context Protocol (MCP)** | Native zero-dependency stdio server for **Claude Desktop, Cursor, and Gemini Antigravity** |
| **Canonicalization** | CRLF → LF and Unicode NFC, so a git checkout on Windows does not invalidate every signature |
| **Sidecars** | An adjacent `<file>.provenance.json`; the artifact itself is never modified |
| **Merkle tree** | **RFC 9162** *(CT 2.0, obsoleting RFC 6962; construction unchanged)* — leaves prefixed `0x00`, nodes `0x01`, odd nodes promoted |
| **Inclusion proofs** | Verify one document against a published root in ~log₂(n) hashes |

> [!warning] ‼️ **Timestamps are obtained and structurally validated — not cryptographically verified**
> **What is checked:** the response is well-formed, `PKIStatus` is granted, the token covers the digest
> it was asked about, and the nonce echoes. *That rules out replay and wrong-subject responses.*
>
> ‼️ **What is not established: that the TSA actually signed the time.** *There is no signature check
> over the `TimeStampToken` and no certificate chain validation — `grep -cE "createVerify|X509Certificate" src/timestamp.ts`
> returns zero, deliberately. A returned `genTime` rests on TLS and the TSA's good behaviour, not on
> cryptography this package performed.* **Tracked openly as [FINDINGS.md §8](./FINDINGS.md), which sets
> out where the fix belongs and where it does not.**
>
> ⭐ **The Python sealing path that maintains the Moonglade vault does verify tokens**, via
> `openssl ts -verify` against a pinned CA bundle. **Artifacts sealed that way are unaffected;
> artifacts sealed by this package carry the weaker guarantee.** *Two implementations, two guarantees.
> Stated here so the difference is disclosed rather than discovered.*

---

## The Invariant Timestamping Doctrine

> **"Always return a timestamp, of the best quality you are currently capable."**

Sealing pipelines and agentic commits must never crash, stall, or fail because a remote authority is down, partitioned, or rate-limiting. The engine guarantees liveness through a deterministic 4-tier epistemic degradation cascade:

1. **Tier 1 — `L1_CRYPTO_PRIMARY` (Enterprise WebTrust TSAs)**:
   DigiCert, Sectigo, GlobalSign, Entrust, Certum. Binary RFC 3161 ASN.1 DER. **Structural validation only** — SHA-256 messageImprint digest match and 64-bit random nonce echo, *not* a signature check over the returned token. See the warning above.
2. **Tier 2 — `L2_CRYPTO_FALLBACK` (Ecosystem & Community TSAs)**:
   Apple TSA, QuoVadis EU, FreeTSA (with strict 15s rate-limit policy enforcement).
3. **Tier 3 — `L3_NETWORK_CONSENSUS` (Edge Multi-Region Network Time)**:
   TLS HTTP Date consensus from global edge providers (Cloudflare, Google).
4. **Tier 4 — `L4_HOST_UNAUTHENTICATED` (Local Kernel UTC)**:
   Local monotonic kernel UTC clock (`localhost`).

### Fair Rotation & Fleet Telemetry
- **Simultaneous 1-Per-Tier Seeking**: By default, seeks 1 probe from each tier simultaneously (3 network requests total), achieving zero-waterfall degradation speed with zero fleet flooding.
- **Fair Round-Robin Rotation**: Outbound traffic is balanced evenly across all healthy providers.
- **Continuous Fleet Auditing**: Every server in the pool gets automatically probed and verified in the normal course of operation.
- **Server Policies & Circuit Breaker**: Individual rate limits (e.g. FreeTSA 15s cooldown) and exponential failure backoff are enforced in-memory.

## Model Context Protocol (MCP) Server

`@moonglade/provenance` includes a native zero-dependency MCP server providing cryptographic gate tools to AI coding agents and IDEs:

### Tools Provided:
1. `verify_artifact_provenance`: Cryptographically verifies an artifact's Ed25519 signature, OpenPGP root delegation, and RFC 3161 DTA timestamp token.
2. `audit_vault_merkle_root`: Computes live RFC 9162 Merkle tree across workspace and detects drift.
3. `seal_canonical_epoch`: Promotes an artifact to Tier 3 Canonical Truth with Ed25519 signature and RFC 3161 timestamp.
4. `assert_gate_status`: Agentic barrier that blocks unverified code generation (Gate A) or PR merge (Gate B).

### MCP Configuration:

**Claude Desktop / Gemini Antigravity / Cursor (`mcp_config.json`):**
```json
{
  "mcpServers": {
    "provenance-gate": {
      "command": "npx",
      "args": ["-y", "@moonglade/provenance", "mcp"]
    }
  }
}
```

---

## Install

```bash
npm install @moonglade/provenance
```

*Not currently on the registry — install from the repository until it is.*

## Use

### Seal a document with RFC 3161 Timestamping

```js
const { ProvenanceEngine } = require('@moonglade/provenance');

const { publicKey, privateKey } = ProvenanceEngine.generateEd25519KeyPair();

await ProvenanceEngine.sealDocument(
  'notes/architecture.md',
  privateKey,
  'you@example.com',
  'git-commit-sha',
  { 
    vaultRoot: process.cwd(),        // scope is derived from the path relative to this
    timestamp: true                  // queries multi-source DTA cascade (DigiCert / Sectigo)
  }
);
```

Writes `notes/architecture.md.provenance.json`. **The document is untouched.**

### Verify it

```js
const result = await ProvenanceEngine.verifyDocument('notes/architecture.md', publicKey);

// { verified: true, signer: 'you@example.com', timestamp: '2026-09-01T15:33:07Z', timestampTier: 'L1_CRYPTO_PRIMARY' }
```

**`verified: false` comes with an `error` explaining which check failed** — mutated document, hash
mismatch, bad signature, missing or corrupt sidecar, or a v1 bundle.

### Build a tree over a directory

```js
const { ProvenanceVault } = require('@moonglade/provenance');

const vault = new ProvenanceVault('./vault');
const { merkleRoot, algorithm, fileCount } = await vault.scanAndAudit();

// Prove one file belongs to that root, without shipping the other 403
const proof = await vault.proveInclusion('Projects/spec.md');
```

### Verify a proof with nothing else

```js
const { verifyProof } = require('@moonglade/provenance');

verifyProof(proof);   // true
```

⭐ **This is the point of the tree.** *A third party holding only the published root and one proof can
check a single document. They do not need the registry, the other files, or you.*

---

## Scope

**A scope is `moonglade:vault:<path relative to the vault root>`**, POSIX-separated so a signature made
on Windows verifies on Linux.

It is **inside the signed payload**, so it cannot be edited after the fact. *Two files named
`README.md` in different directories are cryptographically distinct.* Pass `{ scope: '...' }` to
override.

## Epistemic Signer Taxonomy & Fallback Protocols

### Signer Roles:
- **`architect` (Human Root Authority)**: Password-protected offline key (`unattended: false`). Sovereign architectural directives.
- **`agent` / `ambassador` (Autonomous AI Subagents)**: Runtime execution pipelines (`unattended: true`). Validated against constitutional gates.

### Document Classification:
- **`[TIER_3_CANONICAL]` (Sealed Ground Truth)**: Must carry valid `.provenance.json` sidecar. Hash divergence or invalid signatures trigger an immediate `[INTEGRITY_BREACH / BLOCKED]` halt.
- **`[TIER_2_WORKING_DRAFT]` (Active Work)**: Sprints, resumes, and code files. Known to be unsigned by design; integrity is audited via repository-wide Merkle trees (`audit_vault_merkle_root`).
- **`[TIER_1_EPHEMERAL]` (Scratchpads & Logs)**: Ephemeral debug scripts and notes. Permitted for fluid execution, blocked from canonical memory.
- **`[NETWORK_OFFLINE_DEGRADATION]`**: If external TSAs are unreachable, degrades gracefully to L3 Network Date or L4 Host UTC without locking up offline development.

---

## Format

```json
{
  "standard": "Moonglade Provenance Attestation Bundle v2",
  "artifact": "architecture.md",
  "attestations": [
    {
      "method": "moonglade-ed25519-v2",
      "signer": "you@example.com",
      "scope": "moonglade:vault:notes/architecture.md",
      "sha256": "<hash of canonical bytes>",
      "created": "2026-09-01T12:00:00.000Z",
      "git_commit": "abc1234",
      "signature": "<base64>"
    },
    {
      "method": "rfc3161",
      "tier": "L1_CRYPTO_PRIMARY",
      "tsa": "http://timestamp.digicert.com",
      "tsa_time": "2026-09-01T15:33:07Z",
      "token_b64": "<base64 DER token>"
    }
  ],
  "sha256_at_last_write": "<same hash>",
  "updated": "2026-09-01T15:33:07.000Z"
}
```

**Every `ssh-ed25519` attestation must verify.** *One good signature does not redeem a forged sibling,
and an empty list fails closed.* **Methods this version cannot check are reported in
`unknownMethods`, never silently ignored.**

### ‼️ v1 bundles are refused

**v1 signed the document bytes alone**, leaving scope and signer as unauthenticated JSON beside the
signature — so a sidecar could be edited and still verify. **v2 refuses v1 bundles rather than
accepting them.** *Re-seal.*

---

## Develop

```bash
git clone https://github.com/moongladeai/provenance.git
cd provenance
npm install
npm test
```

125 tests cover CRLF normalization, structured payload framing, scope isolation, multi-attestation verification, RFC 3161 DER serialization, DTA fallback cascading, RFC 9162 Merkle tree construction with odd-node promotion, stdio MCP server tool calls, and seven regression tests for the independent findings of 2026-09-06.

*Tests run against `dist/`, which is what `main` ships. `noEmitOnError` is set, so a type error cannot
produce output that looks like a successful build.*

## Licence

MIT.

## Standalone module

**[`src/timestamp.ts`](./src/timestamp.ts) is usable on its own** — a dependency-free RFC 3161 client
(node builtins only). It obtains and structurally validates timestamps but does **not** verify their
signatures; see **[TIMESTAMP.md](./TIMESTAMP.md)** for features and limitations before relying on it.

---

---

> [!warning] ‼️ **Independent evaluation, 2026-09-06 — read this before deploying the agent-facing layer**
> An external evaluator audited this package by building fixtures and attacking it, rather than reading
> it. **It found four real security defects in the MCP and plugin layers that we had not found**, and
> the full report is published here unedited: **[`EVALUATION-2026-09-06.md`](./EVALUATION-2026-09-06.md)**.
>
> **The most serious: the "cryptographic gate" cleared on an unsigned sidecar.** A hash comparison
> against an editable JSON file was reported as *"cryptographically sealed and verified."* Anyone able
> to write a memory file could write the sidecar beside it and pass the gate with no key. **A gate that
> passes without a signature is worse than no gate, because it manufactures confidence.** It now fails
> closed. Identity is no longer inferred from unsigned strings, absent timestamps are no longer
> rendered as `L1_CRYPTO_PRIMARY`, `required_scope` is enforced, and the Merkle audit no longer reports
> `PRISTINE` without comparing anything.
>
> **All four are fixed and carry regression tests. Three further findings remain open and are
> documented by name** in [`FINDINGS.md`](./FINDINGS.md) §13–15: RFC 3161 tokens are still validated by
> byte-matching rather than CMS parsing; `verifyProof` is a hash-path helper, not an inclusion
> verifier; and the Internet-Draft mandates BOM stripping, NFC, binary preservation and an NTS quorum
> that this implementation does not provide.
>
> ⭐ **What the evaluation confirmed:** the core verifier rejects content changes, wrong keys, modified
> signed fields and forged sibling signatures; the Merkle construction matched an independent
> implementation across 66 tree sizes and 2,145 proofs; and OpenSSL verified the published epoch-67
> timestamp against a separate CA bundle, with a wrong-subject control correctly failing.
>
> *We published a defect list before anyone asked. Someone looked harder and found more. Publishing
> theirs unedited, with the fixes and the ones still open, is the only response consistent with the
> argument this project makes.*

## An open invitation to evaluate this

**We make no claim that provenance-native controls improve AI performance.** We have not measured it,
and nothing in this repository should be read as evidence that they do.

We think it is worth measuring. An agent that can tell a sealed, attested source from an unattested
one — and can be made to refuse the second — has a control surface that does not exist in current
systems. Whether that changes task accuracy, hallucination rate, or susceptibility to context
poisoning and retrieval-time tampering is an **empirical question, and an open one.**

**We invite labs, evaluators and independent researchers to test it.** The implementation is open, the
specification is published, the golden vectors are in this repository, and verification requires no
trust in us. We will support any serious evaluation with whatever it needs — and publish the result
either way, including a null or negative one.

*A project arguing that unchecked claims are the problem does not get to make one. This is the claim
we have not checked, said out loud, with an invitation to check it.*
