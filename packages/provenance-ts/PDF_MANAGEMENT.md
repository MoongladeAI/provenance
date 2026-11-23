# Moonglade Provenance: PDF Document Architecture & Clean Binary Invariant

**Status:** Living Architectural Specification (2.7.0 / v3-Extended)  
**Author:** Moonglade AI Infrastructure Team  
**Scope:** `@moonglade/provenance` and Sovereign Enterprise Document Architecture  

---

## 1. Executive Summary & Design Rationale

Portable Document Format (PDF) files represent the global legal and enterprise standard for contracts, judicial evidence, regulatory filings, and tax reporting. Securing the integrity and provenance of PDF documents has traditionally relied on Adobe Acrobat and the PAdES (PDF Advanced Electronic Signatures) standard (ISO 32000 / ETSI EN 319 142).

Moonglade Provenance departs deliberately from embedded PAdES signatures in favor of a **Detached Cryptographic Sidecar (`.provenance.json`)** anchored by the **Clean Binary Invariant**.

### Why Not Adobe PAdES?

1. **Container Mutation & Bloat:** PAdES embeds signatures directly inside the PDF binary structure by appending incremental update sections (`/ByteRange`, `/Contents`). This mutates the original file bytes, inflates document size, and complicates downstream processing.
2. **Parser Fragility & Shadow Attacks:** Embedded PDF signatures create severe security risks. Vulnerabilities collectively known as "PDF Shadow Attacks" (CVE-2020-28352, CVE-2021-28545, etc.) exploit incremental PDF update parsers to hide malicious overlay pages or alter contract text without invalidating the embedded signature.
3. **Vendor Lock-in & Heavy Dependencies:** Validating PAdES signatures requires massive, complex ASN.1 and X.509 parsing engines (e.g. Adobe Acrobat, PDFBox, iText), creating operational friction for lightweight edge workers, cloud pipelines, and local AI agents.
4. **Agentic Incompatibility:** AI coding agents and autonomous models need fast, local-first cryptographic verification across heterogeneous file types without binary rewriting.

### The Moonglade Sidecar Alternative

Moonglade Provenance treats every PDF document as an immutable, byte-exact binary artifact. Cryptographic proof is maintained in an adjacent, human-readable JSON sidecar (`<filename>.pdf.provenance.json`):
- **Raw Byte Immutability:** The PDF binary is never modified, injected, or altered.
- **Ed25519 Micro-Signatures:** Compact elliptic-curve signatures verify locally on host hardware without heavy PDF container parsers.
- **RFC 3161 Atomic Timestamps:** Globally verifiable proof of document existence without central authorities.
- **Generic Claims Binding:** Rich, structured domain metadata (court case numbers, forensic lab IDs, photographer rights, enterprise retention tags) cryptographically bound to the PDF hash via RFC 8785 JSON Canonicalization Scheme (JCS).
- **Multi-Party Countersigning:** Multiple sovereign parties (creator, auditor, enterprise custodian, government registrar) can countersign the identical PDF without touching a single byte of the source container.

---

## 2. The Clean Binary Invariant

### 2.1 Text vs. Binary Canonicalization

In text-based artifacts (Markdown, JSON, code), canonicalization normalizes line endings (CRLF to LF), strips UTF-8 Byte Order Marks (BOM), and enforces Unicode NFC. This prevents Git checkouts on Windows from breaking signatures.

However, applying text normalization to binary files like PDFs is catastrophic:
- PDF files contain strict byte offsets in their Cross-Reference Tables (`xref`).
- Converting `0x0D 0x0A` (CRLF) to `0x0A` (LF) inside binary font tables, compressed streams (`/FlateDecode`), or xref tables permanently corrupts the PDF document.
- UTF-8 string decoding of binary byte sequences mutates high-order bytes (`0x80` to `0xFF`) into replacement characters (`0xFFFD`).

### 2.2 Formal Definition

Under Moonglade Provenance, binary artifacts adhere to the Clean Binary Invariant:

```text
canonical_text(f)   = encode_utf8(nfc(strip_leading_bom(replace_crlf(decode_utf8_fatal(read_bytes(f)), 0x0A))))
canonical_binary(f) = read_bytes(f)
```

For all PDF documents:
$$\text{TargetHash} = \text{SHA-256}(\text{RawPDFBytes})$$

### 2.3 Detection Mechanism

The provenance engine automatically distinguishes binary files from text files via a two-stage filter:
1. **Extension Whitelist/Blacklist:** Known binary extensions (`.pdf`, `.png`, `.jpg`, `.zip`, `.wasm`, `.bin`) bypass text transformation immediately.
2. **Null-Byte Inspection:** If an unknown extension is encountered, the engine inspects the first 1024 bytes. The presence of a null byte (`0x00`) flags the file as binary, preserving raw byte fidelity.

---

## 3. PDF Attestation & Sidecar Schema

### 3.1 Sidecar Naming & Placement
For any PDF file at `path/to/contract.pdf`, the corresponding sidecar is stored at:
```text
path/to/contract.pdf.provenance.json
```

### 3.2 Canonical Sidecar Structure (v3-Extended)

```json
{
  "standard": "Moonglade Provenance Attestation Bundle v3",
  "artifact": "contract.pdf",
  "claims": {
    "document_type": "legal_agreement",
    "parties": ["Moonglade AI Inc", "Partner Enterprise Ltd"],
    "jurisdiction": "Barbados",
    "effective_date": "2026-09-14",
    "classification": "CONFIDENTIAL"
  },
  "claims_sha256": "8a3e7b28c5a4d193...",
  "attestations": [
    {
      "method": "moonglade-ed25519-v3",
      "signer": "marc.ottley@moongladeai.net",
      "scope": "moonglade:vault:contracts/2026/contract.pdf",
      "target_sha256": "4a5e6f...",
      "claims_sha256": "8a3e7b28c5a4d193...",
      "created": "2026-09-14T14:30:00Z",
      "git_commit": "e89d12a",
      "signature": "base64-encoded-ed25519-signature..."
    },
    {
      "method": "rfc3161",
      "tier": "INTEGRITY_ONLY",
      "tsa": "https://freetsa.org/tsr",
      "tsa_time": "2026-09-14T14:30:02Z",
      "token_b64": "MIIB...ASN.1-DER-token..."
    }
  ],
  "sha256_at_last_write": "4a5e6f...",
  "updated": "2026-09-14T14:30:02Z",
  "status": "canonical"
}
```

---

## 4. Operational Lifecycle: Seal, Timestamp, Countersign, Verify

### 4.1 Sealing a PDF Document

When sealing a PDF document:
1. Read the raw PDF bytes into a buffer without text decoding.
2. Compute `target-sha256 = SHA-256(rawBytes)`.
3. If custom claims are present, serialize them using RFC 8785 JSON Canonicalization Scheme (JCS) and compute `claims-sha256 = SHA-256(canonicalJson)`.
4. Form the 5-line signing preimage:
   ```text
   moonglade-provenance/v3\n
   scope:<scope-uri>\n
   target-sha256:<target-sha256>\n
   signer:<signer-identity>\n
   claims-sha256:<claims-sha256>\n
   ```
5. Sign the preimage with the signer's Ed25519 private key.
6. Write `<filename>.pdf.provenance.json` adjacent to the document.

### 4.2 Multi-Source RFC 3161 Timestamping (DTA)

To establish legal non-repudiation, the engine executes Concurrent Degrading Timestamping Architecture (DTA):
- Queries primary and fallback RFC 3161 Time-Stamp Authority pools (`L1_CRYPTO_PRIMARY` / `L2_CRYPTO_FALLBACK`).
- Binds the SHA-256 digest of the raw PDF bytes to an X.509 timestamp token (producing `INTEGRITY_ONLY` evidence by default, or `ANCHORED` when verified against caller-supplied `trustAnchors`).
- Appends the ASN.1 DER token to the sidecar.

### 4.3 Two-Party & Multi-Party Countersigning

In business workflows, multiple parties must sign off on a PDF:
1. Party A (Author/Originator) signs the PDF and attaches domain claims.
2. Party B (Legal Counsel, Executive, or Reviewer) inspects the PDF and sidecar.
3. Party B invokes `countersignDocument()`:
   - Validates that the PDF file matches `sha256_at_last_write`.
   - Validates that `claims` match `claims_sha256`.
   - Signs the identical v3 preimage with Party B's sovereign key.
   - Appends Party B's attestation to the existing sidecar.
4. The PDF file itself remains 100% byte-identical throughout the entire multi-signature lifecycle.

### 4.4 Verification Flow

When a recipient verifies a PDF document:
1. Check sidecar presence. If missing, fail closed.
2. Compute `currentHash = SHA-256(rawBytes)` of the PDF file.
3. Confirm `currentHash === sidecar.sha256_at_last_write`. If different, fail with `Hash mismatch: Document has been mutated since sealing.`.
4. If v3 claims exist, canonicalize `sidecar.claims` with JCS and verify that the digest matches `sidecar.claims_sha256`.
5. For each signature attestation:
   - Match signer identity against provided public key or keyring.
   - Reconstruct the signing preimage.
   - Verify the Ed25519 digital signature.
6. If an RFC 3161 token exists, verify the message imprint against `currentHash` and CMS/EKU checks (`INTEGRITY_ONLY` by default; pass `policy.timestampTrustAnchors` to validate the certificate chain via `ESSCertIDv2` and earn `ANCHORED`, noting OCSP/CRL revocation is not checked).
7. Return verification verdict, signer identities, verified claims, and render provenance badges.

> **Security Boundary:** Provenance badges generated without a trusted public key (`getArtifactBadge` returning `HASH_ONLY`, or UI strings rendered via `formatHtmlBadge`) reflect only a digest match against an editable sidecar. They provide zero cryptographic signature assurance and MUST NOT be used for access control, automated release gating, or legal authorization decisions.

---

## 5. Implementation Reference (TypeScript)

```typescript
import * as crypto from 'node:crypto';
import { ProvenanceEngine } from '@moonglade/provenance';

async function managePdfWorkflow() {
  const pdfPath = 'contracts/Master_Services_Agreement.pdf';
  const { privateKey: marcPriv, publicKey: marcPub } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const { privateKey: clientPriv, publicKey: clientPub } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // 1. Initial Seal with Generic Legal Claims
  const legalClaims = {
    contract_id: "MSA-2026-0042",
    effective_date: "2026-09-14",
    governing_law: "Laws of Barbados",
    dispute_resolution: "Arbitration - Bridgetown",
    total_value_usd: 150000
  };

  console.log("Sealing PDF with Clean Binary Invariant...");
  await ProvenanceEngine.sealDocument(pdfPath, marcPriv, "marc@moongladeai.net", "git:a1b2c3d", {
    claims: legalClaims,
    timestamp: true // Request RFC 3161 DTA timestamp
  });

  // 2. Client Countersigning (requires verificationKeys to validate prior signatures first)
  console.log("Client countersigning PDF...");
  await ProvenanceEngine.countersignDocument(pdfPath, clientPriv, "client@enterprise.com", "git:a1b2c3d", {
    verificationKeys: { "marc@moongladeai.net": marcPub }
  });

  // 3. Independent Verification via Keyring
  console.log("Verifying multi-party PDF bundle...");
  const keyring = {
    "marc@moongladeai.net": marcPub,
    "client@enterprise.com": clientPub
  };

  const result = await ProvenanceEngine.verifyDocument(pdfPath, keyring, {
    expectedScope: ProvenanceEngine.scopeFor(pdfPath),
    requiredSigners: ["marc@moongladeai.net", "client@enterprise.com"]
  });
  if (result.verified) {
    console.log("PDF verified successfully!");
    console.log("Attestations checked:", result.attestationsChecked);
    console.log("Timestamp:", result.timestamp);
    console.log("Verified Claims:", result.claims);
    console.log("Provenance Badge:", result.badge);
  } else {
    console.error("Verification failed:", result.error);
  }
}
```

---

## 6. Summary of Guarantees

| Requirement | Adobe PAdES Embedded | Moonglade Provenance Sidecar |
| :--- | :--- | :--- |
| **PDF Binary Invariant** | Mutated via incremental updates | 100% byte-exact immutable |
| **Shadow Attack Protection** | Vulnerable to visual overlay injection | Immune (byte hash strictly bound) |
| **Signature Algorithm** | RSA / ECDSA (heavy ASN.1) | Ed25519 (high-velocity micro-signatures) |
| **Atomic Timestamping** | Embedded PKCS#7 token | RFC 3161 DTA with multi-source fallback |
| **Generic Claims Support** | Rigid PDF Dictionary metadata | Arbitrary JSON data types (RFC 8785 JCS) |
| **Multi-Party Signing** | Nested PDF container rewrites | Clean attestation array append |
| **Verification Footprint** | Heavy PDF parser required | Lightweight (standard crypto primitives) |
