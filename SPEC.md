# Attestation Bundle v2 — format, threat model, open questions

**Status:** implemented in `@moonglade/provenance` v2.0.0. **Not a standard. Not submitted anywhere.**
*Written for a reviewer, so the parts that are weak are marked as such rather than left to be found.*

---

## 1. Design intent

**A local-first attestation that a third party can check without trusting the signer's infrastructure**
— no server, no registry lookup, no API. *A file, a sidecar, and a public key.*

**The target case is agentic AI memory.** *An agent writing into a long-lived note store can assert
anything; the substrate cannot currently distinguish a sourced claim from a generated one. This does
not solve that — **it makes tampering after the fact detectable**, which is a smaller and achievable
goal.*

## 2. Canonicalization

```
canonical(f) = utf8(replace(read(f), CRLF, LF))
```

**Minimal by design.** *The only normalization is line endings, because a git checkout on Windows would
otherwise invalidate every signature in a repository.*

⚠️ **Known limits.** *A bare `CR` is untouched. No Unicode normalization, no whitespace folding, no BOM
handling. **Two texts that a human would call identical can canonicalize differently.*** *This is
deliberate — every additional normalization is a place where two implementations can diverge — but it
is a limit and not a feature.*

## 3. Signing payload

**The signature covers a structured claim, not the document bytes.**

```
moonglade-provenance/v2\n
scope:<scope>\n
sha256:<hex of canonical bytes>\n
signer:<identity>\n
```

**Three properties:**

1. ⭐ **Domain separation.** *The version string is inside the payload. A signature over raw bytes — the
   v1 method — does not verify under v2, so the format cannot be downgraded.*
2. ⭐ **Field binding.** *Scope, artifact hash and signer are covered. Editing any of them in a sidecar
   breaks verification.* **Under v1 all three were editable.**
3. **Unambiguous framing.** *Fields are newline-delimited and rejected if they contain control
   characters, so a scope of `a\nsigner:root` cannot inject a second signer line.*

> ⚠️ **Reviewer note.** *Delimiter-plus-validation is weaker than length-prefixed encoding. It is
> sufficient here because the validation is total — any control character is rejected, not merely
> newlines — but **length prefixing would be the stronger construction** and is the obvious v3 change
> if this ever carries fields with looser content rules.*

## 4. Scope

```
moonglade:vault:<path relative to the vault root, POSIX separators>
```

**POSIX normalization is load-bearing**: `path.relative` yields backslashes on Windows, so without it
the same artifact would carry different scopes on different machines and signatures would not travel.

⚠️ **A path outside the root falls back to the basename** rather than emitting `../`. *That is a
collision surface if two out-of-root files share a name. Callers should pass an explicit scope for
anything outside the tree.*

## 5. Merkle tree

**RFC 9162** *(Certificate Transparency 2.0, which obsoletes RFC 6962; the tree construction is
unchanged between them)*. Leaves `SHA-256(0x00 ‖ leaf)`, nodes `SHA-256(0x01 ‖ left ‖ right)`.

- **Leaf content:** `"<sha256>  <path>"` — *two spaces, matching the reference Python*
- **Leaf order:** sorted by path. *Walk order is not stable across filesystems*
- ⭐ **Odd nodes are promoted, never duplicated.** *Duplicating the final leaf allows two distinct trees
  to share a root — CVE-2012-2459*
- **Empty tree:** `SHA-256("")`

**Inclusion proof:** the sibling hash at each level, with a side. `verifyProof` recomputes the root from
a leaf and the path alone — **no other artifact is required.**

⚠️ **No consistency proofs.** *There is no way to prove that root *n+1* is an append-only extension of
root *n*. **For a log that publishes successive epochs, that is a real gap** — a signer could rewrite
history between epochs and nothing in this format would show it. RFC 9162 §2.1.4 defines consistency proofs;
these are not implemented.*

## 6. Threat model

### ✅ Detected

| | |
|---|---|
| Any modification of the artifact | Hash mismatch |
| Signature substituted from another key | Verification failure |
| **Scope, signer or recorded hash edited in the sidecar** | **Payload mismatch — v2 only** |
| A forged attestation appended to a valid bundle | **All attestations must hold** |
| An empty attestation list | Fails closed |
| A v1 bundle | Refused explicitly |
| Bit-rot or silent deletion across a tree | Root moves |

### ❌ Not detected — and these are the honest limits

| | |
|---|---|
| ‼️ **Key compromise** | *There is no revocation, no expiry, no chain. A stolen key seals valid attestations indefinitely* |
| ‼️ **A false statement, signed** | *Provenance is not truth. A hallucination, sealed, is a cryptographically verified hallucination* |
| **Sidecar deletion** | *Removing a sidecar leaves an unsigned file. Nothing in the file itself announces that it was once sealed* |
| **Trust in the public key** | *Out of scope. Key distribution is the caller's problem* |
| **History rewriting between epochs** | *No consistency proofs — see §5* |

## 7. Resolved & Open Questions

1. ✅ **RFC 3161 Timestamping — RESOLVED 2026-09-01**: Pure TypeScript `timestamp.ts` implements ASN.1 DER `TimeStampReq` serialization and concurrent multi-source DTA cascade (DigiCert, Sectigo, FreeTSA, Apple, Network Quorum, Host UTC).
2. **Should `verifyDocument` require the scope to match the file's actual location?** *At present it verifies the scope is authentic but not that it is correct — a validly-signed artifact could be moved and would still verify under its old scope.*
3. **Is `git_commit` worth signing?** *It is currently inside the sidecar but outside the payload, so it is unauthenticated. Either bind it or drop it.*
4. **Multi-signer semantics.** *All attestations must currently verify against one public key. Real countersignature needs per-attestation key resolution.*
5. **Consistency proofs**, per §5.

## 8. Model Context Protocol (MCP) Server Specification

`@moonglade/provenance` exports a native stdio JSON-RPC 2.0 MCP server (`provenance-gate`) providing hard cryptographic boundaries for LLM agents:

### Exposed Tools:
1. `verify_artifact_provenance(file_path, public_key_pem?)`: Ingests sidecar, verifies canonical hash, Ed25519 signature claim, and RFC 3161 timestamp assurance tier.
2. `audit_vault_merkle_root(vault_root)`: Builds RFC 6962 Merkle tree across workspace and detects drift.
3. `seal_canonical_epoch(artifact_path, private_key_pem, signer_identity, git_commit)`: Seals document with Ed25519 and requests RFC 3161 DTA timestamp token.
4. `assert_gate_status(gate_type, prerequisite_token_path)`: Agentic execution barrier that blocks unverified code generation (Gate A) or PR merge (Gate B).

### Fallback Protocols & Document Classification:
- **`[TIER_3_CANONICAL]`**: Sealed Ground Truth. Must carry valid `.provenance.json`. Hash mismatch triggers `[INTEGRITY_BREACH / BLOCKED]`.
- **`[TIER_2_WORKING_DRAFT]`**: Sprints, resumes, and code files. Known to be unsigned by design; integrity governed by workspace Merkle trees (`audit_vault_merkle_root`).
- **`[TIER_1_EPHEMERAL]`**: Scratchpads & debug logs. Fluid execution permitted; strictly blocked from promoting to Tier 3 without Gate B sign-off.
- **`[NETWORK_OFFLINE_DEGRADATION]`**: If external TSAs are unreachable, degrades gracefully to L3 Network Date or L4 Host UTC without locking up offline development.

## 9. Prior art this should be positioned against

**in-toto** *(supply-chain attestation)* · **Sigstore / Rekor** *(transparency log, keyless signing)* ·
**C2PA** *(content provenance for media)* · **RFC 9162** *(certificate transparency 2.0, obsoleting
RFC 6962; the tree here is its construction)* · **RFC 3161** *(timestamping)* · **SLSA** *(build provenance levels)*

⚠️ **The overlap with Sigstore is substantial** and should be addressed explicitly before this is
offered as anything standards-adjacent. **"Local-first, no transparency log" is a real distinction —
but it is a distinction that has to be argued, not assumed.**

---

## Provenance of this document

**Written 2026-08-30 and updated 2026-09-01 alongside the v2 implementation**, by an AI assistant working with the author.
*See [`FINDINGS.md`](./FINDINGS.md) for the audit trail.*
