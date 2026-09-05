---
title: "Sovereign Cryptographic Attestation and Epistemic Provenance for Autonomous Agent Memory (SCA-EPM)"
docname: draft-ottley-agentic-epistemic-provenance-00
category: std
consensus: false
ipr: trust200902
area: Security
workgroup: Network Working Group / AI Supply Chain Security
date: 2026-09-01
author:
  - name: Marc Ottley
    org: Moonglade AI
    city: Boscobelle
    region: St. Andrew
    country: Barbados
    email: moongladeai@gmail.com
---

# Sovereign Cryptographic Attestation and Epistemic Provenance for Autonomous Agent Memory

```
Network Working Group                                          M. Ottley
Internet-Draft                                              Moonglade AI
Intended status: Standards Track                       September 1, 2026
Expires: March 5, 2027


   Sovereign Cryptographic Attestation and Epistemic Provenance for
                       Autonomous Agent Memory
               draft-ottley-agentic-epistemic-provenance-00
```

## Abstract

This document specifies the format, canonicalization algorithms, concurrent multi-source temporal verification protocol, and Merkle tree inclusion proof data structures for **Sovereign Cryptographic Attestation (SCA)**. SCA provides a deterministic, local-first mechanism to bind autonomous AI agent outputs (code, markdown documents, weights, and data artifacts) to a cryptographically verifiable author identity, an independent atomic timestamp, and a published immutable epoch root. This standard enables third-party verification of artifact integrity and authorship without requiring access to the signer's internal infrastructure, runtime telemetry, or private storage.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions of BCP 78 and BCP 79. Internet-Drafts are working documents of the Internet Engineering Task Force (IETF).

## Copyright Notice

Copyright (c) 2026 IETF Trust and the persons identified as the document authors. All rights reserved.

---

## 1. Introduction and Terminology

### 1.1. Motivation
Autonomous agentic systems generate, mutate, and persist software and documentation over extended operational lifecycles. Existing storage layers (e.g., Git histories, POSIX filesystems, vector embeddings) provide neither cryptographic non-repudiation of agent identity nor mathematical protection against silent data drift, hallucinated claims, or unauthorized post-facto modification. 

SCA establishes a deterministic cryptographic sidecar attestation format (`.provenance.json`) and an associated Model Context Protocol (MCP) gate to prevent semantic drift and enforce epistemic boundaries.

### 1.2. Requirement Language
The key words "**MUST**", "**MUST NOT**", "**REQUIRED**", "**SHALL**", "**SHALL NOT**", "**SHOULD**", "**SHOULD NOT**", "**RECOMMENDED**", "**NOT RECOMMENDED**", "**MAY**", and "**OPTIONAL**" in this document are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals, as shown here.

### 1.3. Definitions
* **Artifact**: Any discrete file (markdown, source code, binary image) subject to attestation.
* **Sidecar**: A JSON document named `<artifact_filename>.provenance.json` containing cryptographic signatures, Merkle proofs, and temporal attestation records.
* **Canonical Bytes**: The deterministic byte sequence obtained after applying Section 2 normalization.
* **Epoch Root**: The top-level SHA-256 Merkle root computed across an entire attested archive according to Section 4.
* **Assertion Gate**: An execution barrier within an agent runtime that rejects input lacking a valid, verified cryptographic attestation.
* **Verification Outcome**: The result a verifier reports for a single attestation, drawn from the vocabulary defined in Section 7. An outcome distinguishes an attestation that failed evaluation from one that could not be evaluated.

---

## 2. Canonicalization Algorithms

To ensure cross-platform reproducibility, an implementation **MUST** normalize input artifacts into canonical bytes prior to digest computation.

### 2.1. Text & Markdown Normalization
For text and UTF-8 encoded documents:
1. **Line Ending Normalization**: All `CRLF` (0x0D 0x0A) byte sequences **MUST** be converted to `LF` (0x0A). Bare `CR` (0x0D) bytes **MUST NOT** be modified.
2. **Byte Order Marks**: Implementations **MUST** strip leading UTF-8 Byte Order Marks (`0xEF, 0xBB, 0xBF`) if present.
3. **Unicode Normalization**: To prevent cross-filesystem verification failures between decomposed (NFD, common on macOS HFS+/APFS) and precomposed (NFC) representations, implementations **MUST** apply Unicode Normalization Form C (NFC) [UAX15], consistent with the
Net-Unicode requirement of [RFC5198] §2.
   *Note:* [RFC5198] additionally requires CRLF line endings for network interchange. This document
   deliberately departs from that requirement — canonicalization here targets a stable signing
   preimage across checkouts, not interchange framing, and normalizes to `LF` per step 1.
4. **Whitespace Preservation**: Implementations **MUST NOT** strip trailing whitespace or mutate indentation, preserving exact code semantics.

This scheme applies to arbitrary text and is **not** the JSON Canonicalization Scheme [RFC8785]; JCS
canonicalizes JSON value structure, whereas the algorithm above canonicalizes byte-level text
encoding. Implementations **MUST NOT** cite [RFC8785] as the basis for text canonicalization.

Formal Definition:
```
canonical_text(f) = nfc(strip_bom(replace_all(read_bytes(f), 0x0D0A, 0x0A)))
```

### 2.2. Binary Artifacts
For non-text files (images, audio, compiled binaries), the canonical representation **MUST** be the raw, unaltered byte stream:
```
canonical_binary(f) = read_bytes(f)
```

---

## 3. Signing Payload and Framing

### 3.1. Payload Structure
The digital signature **MUST NOT** be computed directly over raw artifact bytes. Instead, it **MUST** sign an unambiguous, length-safe, newline-delimited framing payload that enforces strict domain separation.

The payload format **MUST** adhere to the following Augmented Backus-Naur Form (ABNF) [RFC5234]:

```abnf
SCA-Payload = "moonglade-provenance/v2" LF
              "scope:" Scope-URI LF
              "sha256:" 64HEXDIG LF
              "signer:" Identity-String LF

Scope-URI = 1*(ALPHA / DIGIT / "-" / "_" / "." / "/" / ":")
Identity-String = 1*(VCHAR)
LF = %x0A
HEXDIG = DIGIT / "a" / "b" / "c" / "d" / "e" / "f"
```

### 3.2. Security Invariants of Payload Framing
1. **Domain Separation**: The header `"moonglade-provenance/v2\n"` guarantees that signatures cannot be reused or downgraded to legacy v1 formats.
2. **Field Binding**: Modifying the scope, target hash, or signer identity in the sidecar invalidates the cryptographic signature.
3. **Control Character Rejection**: The `Scope-URI` and `Identity-String` **MUST NOT** contain newline (`0x0A`), carriage return (`0x0D`), or null (`0x00`) characters. If any control character is detected during compilation, the signer **MUST** abort.

---

## 4. Concurrent Multi-Source Temporal Verification (DTA)

To avoid single-point-of-failure vulnerabilities, timestamp acquisition **MUST** execute via concurrent parallel fan-out across four assurance tiers.

### 4.1. Assurance Tiers
1. **Tier 1 (`L1_CRYPTO_PRIMARY`)**: Primary RFC 3161 Time-Stamp Authority (TSA). Returns an ASN.1 DER-encoded `TimeStampToken` certified by a trusted X.509 Certificate Authority over the SHA-256 digest of the signed attestation payload.
2. **Tier 2 (`L2_CRYPTO_FALLBACK`)**: Secondary independent RFC 3161 TSA. Provides cryptographic non-repudiation if Tier 1 is unreachable.
3. **Tier 3 (`L3_NETWORK_CONSENSUS`)**: Authenticated Network Time Security (NTS) [RFC8915] or multi-server NTP consensus quorum (minimum 3 Stratum-1/Stratum-2 servers). Records bounded offset ($\pm \Delta$ ms) and dispersion.
4. **Tier 4 (`L4_HOST_UNAUTHENTICATED`)**: Local host kernel system clock in ISO 8601 UTC format. Used exclusively for air-gapped or offline operations.

### 4.2. Parallel Fan-Out Dispatch Protocol
Implementations **MUST** dispatch queries to all configured timestamp providers concurrently. The dispatch engine:
* **MUST** impose a strict maximum timeout budget (RECOMMENDED: 2500ms).
* **MUST** record every probe response into the `.provenance.json` sidecar `probes` array.
* **MUST NOT** abort if individual external network probes fail; errors and timeouts **MUST** be recorded explicitly as forensic evidence.
* **MUST** set the `highest_assurance` attribute to the most secure tier that succeeded.

---

## 5. Merkle Tree and Consistency Proofs

Long-term preservation of archived attestations is out of scope for this document; [RFC4998]
(Evidence Record Syntax) addresses timestamp and hash-tree renewal as algorithms weaken, and is the
appropriate companion for archives intended to outlive their signing algorithms.

Archive-wide integrity is verified via a binary Merkle tree compliant with the Certificate
Transparency hash-tree construction, specified in [RFC9162] (Certificate Transparency Version 2.0),
which obsoletes [RFC6962]. The leaf and node prefixes are unchanged between the two revisions; this
document cites [RFC9162] as the current reference and [RFC6962] where the original construction is
meant.

### 5.1. Tree Construction
* **Leaf Hash**: `SHA-256(0x00 ‖ "<sha256_hex>  <posix_relative_path>")`
* **Internal Node Hash**: `SHA-256(0x01 ‖ left_child_hash ‖ right_child_hash)`
* **Leaf Sorting**: Leaves **MUST** be sorted lexicographically by POSIX-normalized relative file path.
* **Odd Node Handling**: In subtrees with an odd number of nodes, the isolated node **MUST** be promoted to the parent level without duplication, preventing CVE-2012-2459 collision vulnerabilities.
* **Empty Tree**: Defined as `SHA-256("")` (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).

### 5.2. Inclusion and Consistency Proofs
1. **Inclusion Proof**: Consists of the target leaf's sibling path. A verifier computes candidate root $R'$:
   ```
   R' = fold_merkle_path(leaf_hash, inclusion_proof)
   ```
2. **Consistency Proof ([RFC9162] §2.1.4; [RFC6962] §2.1.2)**: Proves that an updated epoch root $R_{n+1}$ of size $m$ is an append-only extension of previous epoch root $R_n$ of size $k$ ($k \le m$) without history rewriting or deletion. Verifiers **MUST** verify consistency proofs when tracking evolving workspace logs.
3. **Verification**: If $R' == \text{Published\_Epoch\_Root}$, the artifact is cryptographically proven to belong to the published epoch without requiring the verifier to download or inspect any other file in the archive.

---

## 6. Sidecar Wire Format Schema

The attestation sidecar file **MUST** be valid JSON conforming to the following JSON Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SovereignAttestationSidecar",
  "type": "object",
  "required": ["version", "scope", "sha256", "attestations", "timestamp_attestation"],
  "properties": {
    "version": { "type": "string", "enum": ["2.0.0"] },
    "scope": { "type": "string" },
    "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
    "canonicalization": { "type": "string", "enum": ["utf8_lf", "raw_binary"] },
    "attestations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["signer", "public_key", "signature_b64", "algorithm"],
        "properties": {
          "signer": { "type": "string" },
          "public_key": { "type": "string" },
          "algorithm": { "type": "string", "enum": ["Ed25519", "ECDSA_P256"] },
          "signature_b64": { "type": "string" }
        }
      }
    },
    "timestamp_attestation": {
      "type": "object",
      "required": ["effective_utc", "highest_assurance", "probes"],
      "properties": {
        "effective_utc": { "type": "string", "format": "date-time" },
        "highest_assurance": { 
          "type": "string", 
          "enum": ["L1_CRYPTO_PRIMARY", "L2_CRYPTO_FALLBACK", "L3_NETWORK_CONSENSUS", "L4_HOST_UNAUTHENTICATED"] 
        },
        "fanout_timeout_ms": { "type": "integer" },
        "probes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["tier", "assurance_level", "status", "latency_ms"],
            "properties": {
              "tier": { "type": "string" },
              "assurance_level": { "type": "string" },
              "status": { "type": "string", "enum": ["SUCCESS", "TIMEOUT", "ERROR"] },
              "provider_uri": { "type": "string" },
              "latency_ms": { "type": "integer" },
              "token_der_base64": { "type": "string" },
              "error_detail": { "type": "string" }
            }
          }
        }
      }
    },
    "merkle_inclusion_proof": {
      "type": "object",
      "properties": {
        "epoch_id": { "type": "string" },
        "merkle_root": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
        "path": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["position", "hash"],
            "properties": {
              "position": { "type": "string", "enum": ["left", "right"] },
              "hash": { "type": "string", "pattern": "^[a-f0-9]{64}$" }
            }
          }
        }
      }
    }
  }
}
```

---

## 7. Verification Outcome Vocabulary

### 7.1. Motivation

A verifier answers two independent questions: whether an attestation is mathematically sound, and whether the verifier was able to evaluate it at all. Implementations routinely collapse both into a single boolean, reporting an unreadable key database, an unreachable Timestamp Authority, and a forged signature with the same token.

This is not solely a usability defect. An operator who cannot separate an environment fault from an attack is trained by repeated false alarms to discount both, and the cost is paid precisely when a real failure appears among them. A verifier that cannot say "I did not check this" has no way to avoid asserting something it does not know.

### 7.2. Outcome States

A conformant verifier **MUST** report each attestation as exactly one of:

* **VALID**: The attestation was evaluated and holds.
* **INVALID**: The attestation was evaluated and does not hold. This is positive evidence of tampering, forgery, or undeclared revision.
* **INDETERMINATE**: The attestation could not be evaluated. The verifier asserts nothing about its soundness. Causes include an unavailable key store, an absent trust anchor, an unreachable network dependency, or prior bytes that cannot be recovered.
* **UNSUPPORTED**: The attestation method is recognised but this implementation cannot verify it.

### 7.3. Requirements

1. A verifier **MUST NOT** report an INDETERMINATE result as INVALID. The distinction between "this is broken" and "I could not look" is security-relevant and **MUST** survive to the operator.
2. A verifier **MUST** accompany every INDETERMINATE and UNSUPPORTED result with a machine-readable reason.
3. A verifier **MUST NOT** report an aggregate result of VALID unless at least one attestation is VALID and no attestation is INVALID.
4. Where any attestation is INVALID, the aggregate **MUST** be INVALID.
5. Where no attestation is INVALID but a required method is INDETERMINATE or UNSUPPORTED, the aggregate **MUST** be INDETERMINATE. It **MUST NOT** be VALID.
6. An empty attestation set **MUST NOT** be reported as VALID.
7. A verifier **SHOULD** report which method produced each outcome, so that an INDETERMINATE timestamp is distinguishable from an INDETERMINATE signature.

### 7.4. Operational Rationale

This section is non-normative.

The requirement arises from an observed failure rather than from analysis. In a deployment of the reference architecture, a bundled OpenPGP distribution whose key database daemon could not start won a `PATH` resolution against a working installation. Every OpenPGP attestation in the archive was consequently reported as a failure, indistinguishable in the output from a forged signature: twenty of twenty-six reported failures were this single environment fault. The signatures were sound throughout, and the archive was never compromised.

The defect survived because the verifier had no vocabulary in which to say that it had been unable to open a key database. Under this section, the same condition is reported as INDETERMINATE with a stated cause, and the aggregate does not claim VALID.

---

## 8. Epistemic Signer Classification (Human vs. Autonomous Agent Distinction)

To establish clear accountability in AI-augmented software supply chains, verifiers **MUST** distinguish between artifacts authored or directly verified by human engineers versus those synthesized autonomously by agentic models.

### 8.1. Signer Role Taxonomy
Signers in an SCA ecosystem are categorized into distinct ontological roles:
1. `architect` (**Human Root Authority**): Represents a verified human engineer or system architect. Keys assigned to this role **MUST** be interactive, password-protected, or hardware-backed (`unattended: false`). Signatures produced by an `architect` key assert direct human authorship, manual review, or sovereign root delegation.
2. `agent` (**Autonomous Generative Model**): Represents an autonomous AI subagent or runtime synthesis pipeline. Keys assigned to this role operate unattended in execution environments (`unattended: true`). Signatures assert autonomous model synthesis within constitutional boundary gates.
3. `ambassador` (**Public Editorial Voice**): Represents a persona or automated release pipeline publishing public documentation, changelogs, or client-facing materials (`unattended: true`).

### 8.2. Trust Delegation via Attested Signer Registry
Agent and ambassador keys **SHALL NOT** be trusted implicitly. Trust is established via hierarchical delegation:
1. **Signer Registry**: A machine-readable manifest (e.g., `trust/moonglade-signers.json`) enumerating all active keys, roles, expiration bounds, and `unattended` attributes.
2. **Root Attestation**: The Signer Registry **MUST** be detached-signed by the `architect` root key.
3. **Verification Rule**: A verifier evaluating an artifact:
   * **MUST** verify the signature against the document bytes.
   * **MUST** check the signer's identity and key fingerprint in the Signer Registry.
   * **MUST** verify that the Signer Registry carries a valid, unrevoked signature from an authorized `architect` root key.
   * **SHALL** report the epistemic tier to the consuming client: `[HUMAN_VERIFIED]`, `[AGENT_SYNTHESIZED]`, or `[UNATTESTED_SIGNER]`.

---

## 9. Security Considerations

1. **Key Compromise and Revocation**: Signing keys **SHOULD** be hardware-backed (FIPS 140-2 Level 3 or Secure Enclave) or ephemeral subagent keys signed by a root authority. Verifiers **MUST** check key validity against the published root key manifest.
2. **Timestamp Authority Collusion**: Mitigated by Section 4 concurrent multi-source fan-out; discrepancies between RFC 3161 timestamps and NTP quorum offsets **MUST** trigger security alerts.
3. **Replay and Repudiation**: Scoped URI domain separation and Ed25519 signatures prevent
cross-context replay: a signature made under one scope will not verify under another. Backdating
resistance is weaker and rests on the TSA, not on mathematics performed by the verifier — [RFC3161]
specifies no clock source, and a verifier that does not cryptographically validate the token
signature and its certificate chain (per [RFC5816]) is trusting the TSA's good behaviour rather than
proving anything. Implementations **MUST NOT** describe an unvalidated `genTime` as proof.

---

## 10. IANA Considerations

This document requests the registration of the MIME media type `application/vnd.moonglade.provenance+json` for attestation sidecar bundles.

---

## 11. References

### 11.1. Normative References

* [RFC2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997.
* [RFC3161] Adams, C., Cain, P., Pinkas, D., and R. Zuccherato, "Internet X.509 Public Key Infrastructure Time-Stamp Protocol (TSP)", RFC 3161, August 2001.
* [RFC5198] Klensin, J. and M. Padlipsky, "Unicode Format for Network Interchange", RFC 5198, March 2008.
* [RFC5234] Crocker, D. and P. Overell, "Augmented BNF for Syntax Specifications: ABNF", STD 68, RFC 5234, January 2008.
* [RFC5816] Santesson, S. and N. Pope, "ESSCertIDv2 Update for RFC 3161", RFC 5816, March 2010.
* [RFC8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.
* [RFC9162] Laurie, B., Messeri, E., and R. Stradling, "Certificate Transparency Version 2.0", RFC 9162, December 2021.
* [UAX15] The Unicode Consortium, "Unicode Standard Annex #15: Unicode Normalization Forms".

### 11.2. Informative References

* [RFC4998] Gondrom, T., Brandner, R., and U. Pordesch, "Evidence Record Syntax (ERS)", RFC 4998, August 2007.
* [RFC6962] Laurie, B., Langley, A., and E. Kasper, "Certificate Transparency", RFC 6962, June 2013. (Obsoleted by [RFC9162].)
* [RFC8785] Rundgren, A., Jordan, B., and S. Erdtman, "JSON Canonicalization Scheme (JCS)", RFC 8785, June 2020.
* [RFC8915] Franke, D., Sibold, D., Teichel, K., Dansarie, M., and R. Sundblad, "Network Time Security for the Network Time Protocol", RFC 8915, September 2020.

---

## 12. Author's Address

```text
Marc Ottley
Moonglade AI
Boscobelle, St. Andrew
Barbados
Email: moongladeai@gmail.com
URI:   https://moongladeai.net
```
