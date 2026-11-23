# Why Not ________? The Architectural Distinction of Moonglade Provenance 2.7.0

**Status:** Authoritative Comparative Reference Document  
**Version:** 2.7.0 Baseline  
**Scope:** Architecture, Security Boundaries, Runtime Economics, AI Memory Substrates, and CARICOM Digital Public Infrastructure (DPI) Integration  

---

## 1. Executive Summary

When technical architects, government ministries, regional enterprises, or independent auditors encounter **Moonglade Provenance 2.7.0**, the instinctive reaction is often pattern matching against existing commercial or sovereign platforms:
- *"Isn't this just DocuSign for files?"*
- *"Why not use C2PA since Adobe, Microsoft, and camera manufacturers back it?"*
- *"How does this fit alongside regional sovereign platforms like Trinidad and Tobago's VerifyTT, Barbados' Trident eID, or Jamaica's NIDS?"*
- *"Why not just use Sigstore, Git GPG, or OpenTimestamps?"*

The technical reality is clear: **Each of those platforms was engineered for a completely different threat model, identity architecture, and operational surface.** 

They solve human contract ceremonies, media attribution metadata, national citizen identity credentials, or cloud container admissions. None of them were engineered for **autonomous AI agent memory, local-first code execution, local assertion gates, and offline file-and-claim verification.**

Crucially, **Moonglade Provenance does not compete with regional identity or public PKI frameworks: it acts as a detached, system-agnostic sidecar envelope that binds file digests and canonical claim metadata alongside an Ed25519 agent or institutional attestation without mutating the underlying artifact.**

---

## 2. Multi-Vector Comparison & Interoperability Matrix

The table below contrasts existing international and regional identity standards against Moonglade Provenance 2.7.0, highlighting where Moonglade acts as the **System-Agnostic Envelope**:

| Capability Vector | DocuSign / Adobe Sign | C2PA / CAI | VerifyTT (Trinidad & Tobago) | Trident eID (Barbados) | NIDS / PKI (Jamaica) | Sigstore (Cosign / Rekor) | Moonglade Provenance 2.7.0 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Domain** | Enterprise legal contracts | Media provenance & creator metadata | Citizen educational & police credentials | Citizen national identity & e-signatures | National ID & e-government PKI | Cloud container & package supply chains | Local-first Markdown, repos, AI memory & model outputs |
| **Underlying Substrate** | Proprietary SaaS database | JUMBF container boxes inside file | W3C Verifiable Credentials / MOSIP / Inji | Smart Card PKI / Mobile app e-sign | PKI digital certs & NIN directory | OIDC / Public append-only log (Rekor) | Local sidecar (`<file>.provenance.json`) |
| **File Byte Mutation** | Injects visual signature into PDF | **Mutates raw file bytes** | External JSON credential in wallet | External signature / document digest | External digital certificate signature | Detached signature / OCI layer | **Byte-preserving sidecars (0 mutated bytes)** |
| **Offline Verification** | Zero (Cloud dependency) | Partial (Stripped on re-encode) | Zero (Web verification endpoint) | Requires CRL/OCSP connectivity | Requires CA CRL/OCSP check | Zero (Requires Rekor public log) | **Offline / Local-first CLI & Ed25519/TSA checks** |
| **Agentic AI & MCP Gates** | None | None | None | None | None | Limited (CI/CD pipeline hooks) | **Native stdio Model Context Protocol (MCP)** |
| **Canonicalization** | PDF structure parsing | Media-specific box parsing | JSON-LD credential canonicalization | X.509 ASN.1 DER / PDF PKCS#7 | ASN.1 DER / X.509 cert standard | Raw binary digest hashing | **Strict NFC, BOM removal, CRLF-to-LF, IEEE 754 JCS** |
| **Timestamp Model** | Vendor server clock | Embedded X.509 timestamp | Central platform clock | Qualified TSA server clock | Government TSA server clock | Transparency log checkpoint | **Degrading Timestamp Architecture (DTA: L1–L4 Quorum)** |
| **Tree Hashing & Proofs** | None | Cryptographic manifest list | Verifiable Registry pointer | None | Central registry audit log | Central Rekor Merkle tree | **RFC 9162 / RFC 6962 Merkle tree proofs ($\mathcal{O}(\log N)$ inclusion)** |
| **Verification Latency Model** | Network round-trips | Media box parsing | Network endpoint check | OCSP/CRL or card check | CA CRL/OCSP check | Rekor network lookup | **Local in-memory Ed25519 / WASM check (no network call)** |
| **Unit Economics** | \$1 to \$4+ per envelope | High compute overhead per render | Public infrastructure cost | Government service fee | Government service fee | Cloud infrastructure cost | **Zero marginal software fee (\$0.00)** |
| **Moonglade Claims / Metadata Interop** | **External** (Walled garden) | **Detached Binding** (Sidecar binds raw media) | **Structured Claim Metadata** (Stores VC data in `claims`) | **Structured Claim Metadata** (Stores cert/ref metadata in `claims`) | **Structured Claim Metadata** (Stores cert/ref metadata in `claims`) | **Structured Claim Metadata** (Stores bundle metadata in `claims`) | **Canonical Ed25519 v2/v3 & RFC 3161 Envelope** |

*(Note: Native signature verification in `@moonglade/provenance` 2.7.0 supports `moonglade-ed25519-v2` / `moonglade-ed25519-v3` and RFC 3161 Time-Stamp Tokens via top-level `verifyTimeStampToken` or `ProvenanceEngine.verifyDocument`. External citizen VCs, PKI certificates, and `openpgp` / `ssh-ed25519` proofs carried alongside a bundle are preserved as structured metadata or auxiliary records and validated by their respective external verifiers; unrecognized attestation methods in a bundle produce `INDETERMINATE` or `verified: false` natively rather than trusting unverified algorithms.)*

---

## 3. Deep-Dive: CARICOM & Regional Digital Public Infrastructure (DPI)

The Caribbean is actively deploying sovereign Digital Public Infrastructure to eliminate bureaucratic friction and establish paperless governance. Understanding how Moonglade Provenance integrates with these platforms clarifies our distinct architectural role.

### A. Trinidad & Tobago: VerifyTT (iGovTT / MOSIP / Inji)

#### What it is built for:
VerifyTT is Trinidad and Tobago's national digital credentialing ecosystem, built on open standards (MOSIP, Inji, and W3C Verifiable Credentials). It allows educational institutions (UWI, UTT, USC, COSTAATT) and state agencies (Police Service Certificates of Character, Registrar General civil records) to issue tamper-proof verifiable credentials that citizens hold in a mobile wallet and present via QR code verification.

#### Why it does not replace Moonglade:
1. **Target Boundary**: VerifyTT verifies *human citizens and their credentials*. It does not govern autonomous coding agents, workspace file trees, or model generation checkpoints.
2. **Platform Overhead**: Verifying an artifact through VerifyTT requires wallet-to-verifier protocols and government endpoint checks, which cannot execute inside a local offline compiler loop or test suite.

#### How Moonglade Complements It:
Moonglade Provenance 2.7.0 binds external credential payloads alongside source artifacts via deterministic canonical v3 claims:
- When a university registrar or government officer issues a credential evaluated via VerifyTT, a canonical representation of that Verifiable Credential metadata (using IEEE 754 safe-integer / string fields compatible with section 3.3 JCS) can be committed inside the Moonglade sidecar (`claims.verifiable_credential`) and sealed by an institutional Ed25519 key.
- Moonglade binds those claim fields directly to the underlying Markdown research, medical data file, or codebase digest, paired with RFC 3161 timestamps and Merkle tree inclusion proofs.
- The result: **VerifyTT verifies the citizen identity credential through its trust registry; Moonglade cryptographically binds the local file digest and committed metadata without mutating a single byte of the file.**

---

### B. Barbados: Trident ID & Trident eID (Electoral and Boundaries Commission)

#### What it is built for:
Barbados replaced its legacy 40-year-old plastic card system with the **Trident ID** contactless smart card, paired with the **Trident eID** mobile application. It implements sovereign Public Key Infrastructure (PKI) designed for remote citizen authentication and qualified electronic signatures for e-government, banking, and commercial contracts under Barbados Cap. 308.

#### Why it does not replace Moonglade:
1. **Physical Card & Mobile App Ceremony**: Trident eID requires a citizen to tap a contactless NFC card or authenticate biometrically on a smartphone. An autonomous coding assistant or automated verification pipeline running at 3:00 AM cannot physically tap a Trident smart card to verify a git commit.
2. **File Scope**: Trident PKI is optimized for human document approval (PDF sign-offs and portal logins), not for tracking atomic state changes across distributed agent memory or high-frequency code repositories.

#### How Moonglade Complements It:
- When a Barbadian public official or corporate director approves an artifact externally via Trident eID, the document's Trident signature reference, certificate fingerprint, or detached receipt can be committed inside structured Moonglade v3 `claims` and co-signed by an institutional or custodian Ed25519 key.
- (Any third-party non-Ed25519 PKI verification still runs through Trident/X.509 validators; placing non-Ed25519 entries in `attestations` causes `@moonglade/provenance` 2.7.0 `verifyDocument` to stop with `INDETERMINATE` or `verified: false`.)
- This lets Barbadian organizations keep legally recognized Trident workflows at human sign-off boundaries while using Moonglade's local-first Ed25519, RFC 3161 (`verifyTimeStampToken`), and Merkle proofs for continuous internal file integrity checks.

---

### C. Jamaica: National Identification System (NIDS / NIRA)

#### What it is built for:
Jamaica's NIDS (governed by the National Identification and Registration Authority) establishes a unified National Identification Number (NIN) backed by a national PKI trust root. Its mandate includes enabling secure digital identities for electronic document signing, e-passports, border e-gates, and digital commercial transactions.

#### Why it does not replace Moonglade:
1. **Citizen Directory Focus**: NIDS is a national identity management directory. It does not provide file canonicalization, multi-agent reasoning memory substrates, or Git worktree protection.
2. **Online Central Authority**: Verifying a NIDS signature requires validating trust chains against national certificate authority revocation lists (CRLs/OCSP).

#### How Moonglade Complements It:
- Metadata or detached signature references from a NIDS-backed approval can be bound into canonical v3 `claims` alongside the exact canonical file digest (UTF-8 / NFC / RFC 8785 subset) and an institutional Ed25519 seal.
- Even when national CRL/OCSP endpoints are offline in an air-gapped archive, parties holding the trusted institutional Ed25519 public key (and optional pinned TSA trust anchors, noting CRL/OCSP is not checked by Moonglade) can verify offline that neither the artifact nor its committed claim metadata drifted.

---

### D. The CARICOM Single Market & Economy (CSME) Cross-Border Trust Opportunity

A longstanding challenge in the CARICOM Single Market is **cross-border digital mutual recognition**:
- A degree issued in Trinidad under VerifyTT may require manual verification when presented to an employer or immigration officer in Barbados or Jamaica.
- A corporate record signed under Barbados Cap. 308 with a Trident eID is not natively understood by Jamaica's NIDS portal.

**Moonglade Provenance provides a neutral file-integrity container:**
Because Moonglade builds on open primitives (RFC 8785 JCS subset, RFC 3161 timestamps, RFC 9162/6962 Merkle trees, and Ed25519), **external credential references, certificate hashes, and audit metadata from VerifyTT, Trident eID, or NIDS workflows can be stored as committed data inside canonical v3 `claims` alongside immutable file digests in an adjacent `.provenance.json` sidecar.** (Moonglade does not natively parse, validate, or wrap external citizen-PKI certificates or smart-card signatures; those remain strictly external credentials verified by their respective state platforms.)

Any CARICOM entity with the custodian's trusted Ed25519 public key can verify offline that the artifact, its committed metadata, and its RFC 9162/6962 Merkle inclusion proof match without custom modifications to the underlying document, while still deferring citizen-identity trust validation to each issuing authority's validator.

---

## 4. Deep-Dive: Global Tech Standards

### A. Why Not DocuSign / Adobe Sign?
- **Centralized SaaS Trap**: Verification requires pinging vendor cloud servers. If your account closes, verification audit trails are compromised.
- **PDF Prison**: Cannot attest raw Markdown, Python/Rust code, `.onnx` model weights, or memory transcripts.
- **Prohibitive Economics**: \$1 to \$4 per envelope bankrupts autonomous agent swarms running thousands of checks a day.
- **Moonglade 2.7.0 Contrast**: Local-first, checks locally on host hardware without network calls or per-envelope fees.

### B. Why Not C2PA (Coalition for Content Provenance and Authenticity)?
- **Destructive Byte Mutation**: C2PA injects JUMBF boxes directly into the image/video container, immediately changing its `SHA-256` hash and invalidating build hashes.
- **Social Media Stripping**: The moment Twitter, Slack, or an image optimizer compresses the file, C2PA manifests are destroyed.
- **No Code/Text Specification**: Cannot handle cross-platform line endings or Git worktrees.
- **Moonglade 2.7.0 Contrast**: Moonglade uses **external sidecars (`<file>.provenance.json`)**. The artifact file itself is never mutated. Raw binaries (PNG, ONNX, WASM) preserve 100% raw byte fidelity, while text files undergo strict UTF-8 / BOM / CRLF->LF / NFC canonicalization.

### C. Why Not Sigstore (Cosign / Rekor)?
- **Mandatory Rekor Dependency**: Requires publishing to a central public transparency log (Rekor). If your host has no internet access, or if you are running proprietary enterprise audits, Sigstore fails closed.
- **Public Data Exposure**: Publishing enterprise hashes or file names exposes operational metadata to the open internet.
- **Moonglade 2.7.0 Contrast**: Completely self-contained, operates on air-gapped workstations, and verifies locally without public transparency log publication.

### D. Why Not Git Commit Signing (GPG / SSHSIG)?
- **Severed on Transmission**: Attestations vanish the moment a file leaves the `.git` repository (e.g., emailed, uploaded to S3, or shared via API).
- **Forged Dates**: Git dates (`GIT_COMMITTER_DATE`) are untrusted user strings; Moonglade supports RFC 3161 timestamps verified via CMS `SignedData` (`verifyTimeStampToken` / `ProvenanceEngine.verifyDocument`, with explicit `trustAnchors` required for `ANCHORED` assurance) alongside lightweight WASM DER imprint inspection (`verify_rfc3161_timestamp`).

---

## 5. Architectural Hierarchy: The System-Agnostic Envelope

```
+---------------------------------------------------------------------------------------------------+
|                                  THE INTEGRATED TRUST STACK                                       |
|                                                                                                   |
|  [ SOVEREIGN CITIZEN & LEGAL LAYER ]    Trident eID (BB) | VerifyTT (TT) | NIDS (JM) | DocuSign   |
|                                         (Proves legal authority, human identity, and state roots) |
|                                                   |                                               |
|                                                   v                                               |
|  [ MOONGLADE PROVENANCE 2.7.0 ]        THE SYSTEM-AGNOSTIC ENVELOPE                               |
|  (The Architectural Floor)              - Commits external metadata in canonical v3 claims + sidecar|
|                                         - Preserves 100% file immutability (zero file mutation)   |
|                                         - Deterministic canonicalization (CRLF/LF, NFC, RFC 8785) |
|                                         - Local stdio MCP assertion gates                         |
|                                         - RFC 9162 / 6962 Merkle tree proofs (O(log N) inclusion) |
|                                         - Air-gapped, zero-fee, local offline Ed25519 verification|
|                                                   |                                               |
|                                                   v                                               |
|  [ AGENTIC & REPOSITORY SUBSTRATE ]    Autonomous Swarms | Git Trees | Model Weights | SOAP Notes |
+---------------------------------------------------------------------------------------------------+
```

By decoupling **identity issuance** (managed by sovereign CARICOM states or enterprise CAs) from **structural artifact integrity** (managed locally by Moonglade), we create a trust architecture that is simultaneously legally recognized and technically incorruptible.
