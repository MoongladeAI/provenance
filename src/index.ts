import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { merkleRoot, inclusionProof, InclusionProof, ArtifactMap, MERKLE_ALGORITHM } from './merkle';
import { concurrentDegradingTimestamp, DTAResult, DTAOptions } from './timestamp';

/**
 * Moonglade Provenance Engine (TypeScript Implementation)
 * Provides Ed25519 micro-signatures, RFC 3161 timestamps, and Merkle root macro-provenance.
 */

export interface ProvenanceSidecar {
  standard: string;
  artifact: string;
  attestations: Array<{
    method: string;
    signer?: string;
    scope?: string;
    sha256?: string;
    created?: string;
    git_commit?: string;
    signature?: string;
    tier?: string;
    tsa?: string;
    tsa_time?: string;
    token_b64?: string;
    probes?: any[];
  }>;
  sha256_at_last_write: string;
  updated: string;
}

export interface VerificationResult {
  verified: boolean;
  signer?: string;
  timestamp?: string;
  timestampTier?: string;
  error?: string;
  /** How many signature attestations were checked. Zero means an empty bundle. */
  attestationsChecked?: number;
  /** Methods present that this version cannot verify. Reported, never ignored. */
  unknownMethods?: string[];
  /**
   * The scope covered by the verified signature. Returned so a caller can compare it
   * with the location or namespace it expected: the signature binds the scope string,
   * but nothing in this library binds that string to where the file actually is.
   * A caller that does not compare it has not enforced scope.
   */
  scope?: string;
}

export class ProvenanceEngine {
  /**
   * Canonicalize a file's bytes deterministically: normalize CRLF to LF.
   *
   * This exists so a git checkout on Windows does not invalidate every signature
   * in the repository. It is NOT RFC 8785, which this docstring previously cited -
   * that is the JSON Canonicalization Scheme and does not apply to markdown.
   *
   * Note the limit: a bare CR is left untouched, since it is not a line ending
   * this normalizes. Tested, so the behaviour is documented rather than assumed.
   */
  static async canonicalizeFile(filePath: string): Promise<Buffer> {
    const raw = await fs.readFile(filePath);
    let text = raw.toString('utf8');
    // Strip UTF-8 Byte Order Mark (BOM) if present
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    // Normalize CRLF to LF and apply Unicode NFC
    const normalized = text.replace(/\r\n/g, '\n').normalize('NFC');
    return Buffer.from(normalized, 'utf8');
  }

  /**
   * Generates an Ed25519 keypair for testing/local identities if none exists.
   */
  static generateEd25519KeyPair() {
    return crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
  }

  /**
   * The bytes that are actually signed.
   *
   * Until v2 the signature covered the document bytes alone, which meant the
   * scope, the signer identity and the timestamp were unauthenticated JSON
   * sitting beside it. Anyone could rewrite the scope in a sidecar and the
   * signature still verified - so the stated property, that a signature made
   * for one scope will not verify under another, was not true here.
   *
   * v2 signs a structured claim instead. Three properties matter:
   *
   *   1. Domain separation - the version string is inside the payload, so a
   *      signature over one payload type cannot be replayed as another.
   *   2. Field binding - scope, artifact hash and signer are all covered.
   *   3. Unambiguous framing - newlines delimit fields, and fields are
   *      validated to contain none, so a crafted scope cannot smuggle in a
   *      forged signer line.
   */
  static readonly PAYLOAD_VERSION = 'moonglade-provenance/v2';

  static buildSigningPayload(fields: { scope: string; sha256: string; signer: string }): Buffer {
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v !== 'string' || v.length === 0) {
        throw new Error(`signing payload: ${k} must be a non-empty string`);
      }
      if (/[\x00-\x1f\x7f]/.test(v)) {
        throw new Error(`signing payload: ${k} must not contain control characters`);
      }
    }
    const body = [
      this.PAYLOAD_VERSION,
      `scope:${fields.scope}`,
      `sha256:${fields.sha256}`,
      `signer:${fields.signer}`,
      ''
    ].join('\n');
    return Buffer.from(body, 'utf8');
  }

  /**
   * Build the attestation scope for an artifact.
   *
   * Scope isolation is the stated security property: a signature made for one
   * scope must not be presentable for another. Until 2026-08-30 this used
   * `path.basename(filePath)`, which gave every README.md in the tree the same
   * scope - a collision in any repository with repeated filenames, which is all
   * of them.
   *
   * It is now the path relative to `vaultRoot`, matching the Python
   * implementation's `namespace_for()`.
   *
   * Separators are forced to POSIX. `path.relative` yields backslashes on
   * Windows and forward slashes elsewhere, so without this the same file signed
   * on two machines would carry two different scopes. That is the same class of
   * defect canonicalizeFile exists to prevent for line endings, and it would be
   * careless to fix one and not the other.
   */
  static scopeFor(filePath: string, vaultRoot?: string, explicit?: string): string {
    if (explicit) return `moonglade:vault:${explicit}`;
    const root = vaultRoot ?? process.cwd();
    const rel = path.relative(root, path.resolve(filePath));
    // A path outside the root cannot be expressed relative to it; fall back to
    // the basename rather than emitting a scope full of `../`.
    const safe = rel && !rel.startsWith('..') ? rel : path.basename(filePath);
    return `moonglade:vault:${safe.split(path.sep).join('/')}`;
  }

  /**
   * Sign a document and generate the .provenance.json sidecar.
   */
  static async sealDocument(
    filePath: string,
    privateKeyPem: string,
    signerIdentity: string,
    gitCommit: string = 'unknown',
    opts: { vaultRoot?: string; scope?: string; timestamp?: boolean | DTAOptions } = {}
  ): Promise<ProvenanceSidecar> {
    const canonicalBytes = await this.canonicalizeFile(filePath);
    
    // Hash
    const hash = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
    const digestBuffer = crypto.createHash('sha256').update(canonicalBytes).digest();
    
    const scope = this.scopeFor(filePath, opts.vaultRoot, opts.scope);

    // Sign the structured claim, not the raw bytes - see buildSigningPayload.
    const payload = this.buildSigningPayload({ scope, sha256: hash, signer: signerIdentity });
    const signature = crypto.sign(null, payload, privateKeyPem).toString('base64');
    
    const attestations: ProvenanceSidecar['attestations'] = [
      {
        method: "moonglade-ed25519-v2",
        signer: signerIdentity,
        scope,
        sha256: hash,
        created: new Date().toISOString(),
        git_commit: gitCommit,
        signature
      }
    ];

    if (opts.timestamp) {
      const dtaOpts = typeof opts.timestamp === 'object' ? opts.timestamp : {};
      const dta = await concurrentDegradingTimestamp(digestBuffer, dtaOpts);
      attestations.push({
        method: "rfc3161",
        tier: dta.tier,
        tsa: dta.tsa,
        tsa_time: dta.tsa_time,
        token_b64: dta.token_b64,
        probes: dta.probes
      });
    }
    
    const sidecar: ProvenanceSidecar = {
      standard: "Moonglade Provenance Attestation Bundle v2",
      artifact: path.basename(filePath),
      attestations,
      sha256_at_last_write: hash,
      updated: new Date().toISOString()
    };
    
    const sidecarPath = `${filePath}.provenance.json`;
    await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');
    
    return sidecar;
  }

  /**
   * Attest RFC 3161 timestamping for an artifact via Concurrent Multi-Source DTA.
   */
  static async attestTimestamp(
    filePath: string,
    opts: DTAOptions = {}
  ): Promise<DTAResult> {
    const canonicalBytes = await this.canonicalizeFile(filePath);
    const digestBuffer = crypto.createHash('sha256').update(canonicalBytes).digest();
    const dta = await concurrentDegradingTimestamp(digestBuffer, opts);

    // If sidecar exists, attach or update the rfc3161 attestation
    const sidecarPath = `${filePath}.provenance.json`;
    try {
      const sidecarData = await fs.readFile(sidecarPath, 'utf8');
      const sidecar: ProvenanceSidecar = JSON.parse(sidecarData);
      if (Array.isArray(sidecar.attestations)) {
        const existingIdx = sidecar.attestations.findIndex(a => a.method === 'rfc3161');
        const tsAtt = {
          method: "rfc3161",
          tier: dta.tier,
          tsa: dta.tsa,
          tsa_time: dta.tsa_time,
          token_b64: dta.token_b64,
          probes: dta.probes
        };
        if (existingIdx >= 0) {
          sidecar.attestations[existingIdx] = tsAtt;
        } else {
          sidecar.attestations.push(tsAtt);
        }
        sidecar.updated = new Date().toISOString();
        await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');
      }
    } catch {
      // Sidecar does not exist or unreadable, still return DTAResult
    }

    return dta;
  }

  /**
   * Verify a document against its sidecar.
   */
  static async verifyDocument(filePath: string, publicKeyPem: string): Promise<VerificationResult> {
    try {
      const sidecarPath = `${filePath}.provenance.json`;
      const sidecarData = await fs.readFile(sidecarPath, 'utf8');
      const sidecar: ProvenanceSidecar = JSON.parse(sidecarData);
      
      const canonicalBytes = await this.canonicalizeFile(filePath);
      const currentHash = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
      
      if (currentHash !== sidecar.sha256_at_last_write) {
        return { verified: false, error: "Hash mismatch: Document has been mutated since sealing." };
      }
      
      if (!/v2\b/.test(sidecar.standard || '')) {
        return {
          verified: false,
          error: "Unsupported bundle: this is a v1 sidecar, whose signature does " +
                 "not cover the scope or signer. Re-seal it with v2."
        };
      }

      const attestations = Array.isArray(sidecar.attestations) ? sidecar.attestations : [];

      const SUPPORTED = 'moonglade-ed25519-v2';
      const signatures = attestations.filter(a => a.method === SUPPORTED);
      const unknownMethods = Array.from(new Set(
        attestations.filter(a => a.method !== SUPPORTED).map(a => a.method)
      ));

      if (signatures.length === 0) {
        return {
          verified: false,
          error: 'No moonglade-ed25519-v2 attestation in the bundle. An ssh-ed25519 (SSHSIG) attestation must be verified with ssh-keygen -Y verify, not by this package.',
          attestationsChecked: 0,
          unknownMethods
        };
      }

      // Every signature must hold. A good signature does not redeem a forged sibling.
      for (const att of signatures) {
        if (!att.signature || !att.signer || !att.scope || !att.sha256) {
          return {
            verified: false,
            error: 'Incomplete signature attestation block.',
            attestationsChecked: signatures.length,
            unknownMethods
          };
        }
        if (att.sha256 !== currentHash) {
          return {
            verified: false,
            error: `Attestation for scope "${att.scope}" records a different hash.`,
            attestationsChecked: signatures.length,
            unknownMethods
          };
        }
        const payload = ProvenanceEngine.buildSigningPayload({
          scope: att.scope,
          sha256: att.sha256,
          signer: att.signer
        });
        const ok = crypto.verify(
          null, payload, publicKeyPem, Buffer.from(att.signature, 'base64')
        );
        if (!ok) {
          return {
            verified: false,
            error: `Signature validation failed for signer "${att.signer}".`,
            attestationsChecked: signatures.length,
            unknownMethods
          };
        }
      }

      // Extract timestamp info if present
      const rfcAtt = attestations.find(a => a.method === 'rfc3161');

      return {
        verified: true,
        signer: signatures[0].signer,
        scope: signatures[0].scope,
        timestamp: rfcAtt?.tsa_time || signatures[0].created,
        timestampTier: rfcAtt?.tier,
        attestationsChecked: signatures.length,
        unknownMethods
      };
    } catch (e: any) {
      return { verified: false, error: `Verification error: ${e.message}` };
    }
  }
}

/**
 * Vault Macro-Provenance: Merkle Tree Hash Registry
 */
export class ProvenanceVault {
  // `salt` is retained for API compatibility but no longer participates in the
  // root. RFC 6962 domain separation supersedes it, and a salted root cannot be
  // verified by a third party who does not know the salt - which defeats the
  // purpose of publishing one.
  constructor(public rootPath: string, public salt: string = "moonglade-v1") {}

  private async walk(dir: string, fileList: string[] = []): Promise<string[]> {
    const files = await fs.readdir(dir);
    for (const file of files) {
      const filepath = path.join(dir, file);
      const stat = await fs.stat(filepath);
      if (stat.isDirectory()) {
        if (!file.startsWith('.') && file !== 'node_modules') {
          await this.walk(filepath, fileList);
        }
      } else {
        fileList.push(filepath);
      }
    }
    return fileList.sort(); // Deterministic ordering
  }

  /**
   * Hash every file under the root and build a real Merkle tree over them.
   *
   * Until v2 this returned a flat SHA-256 over the concatenated hashes. That
   * detected change and nothing else - it could not produce an inclusion proof,
   * which is the only reason to use a tree. See merkle.ts.
   *
   * Paths are POSIX-normalised before hashing, so a vault scanned on Windows and
   * on Linux yields the same root. Without that the two would silently disagree,
   * which is the same defect canonicalizeFile prevents for line endings.
   */
  async scanAndAudit(): Promise<{
    merkleRoot: string;
    algorithm: string;
    fileCount: number;
    artifacts: ArtifactMap;
  }> {
    const files = await this.walk(this.rootPath);
    const artifacts: ArtifactMap = {};

    for (const file of files) {
      const bytes = await fs.readFile(file);
      const rel = path.relative(this.rootPath, file).split(path.sep).join('/');
      artifacts[rel] = { sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    }

    return {
      merkleRoot: merkleRoot(artifacts),
      algorithm: MERKLE_ALGORITHM,
      fileCount: files.length,
      artifacts
    };
  }

  /** Audit path for one artifact, by its POSIX path relative to the root. */
  async proveInclusion(relPath: string): Promise<InclusionProof | null> {
    const { artifacts } = await this.scanAndAudit();
    return inclusionProof(artifacts, relPath);
  }
}

// RFC 6962 Merkle tree and inclusion proofs.
export * from './merkle';

// RFC 3161 and Concurrent Degrading Timestamping Architecture (DTA).
export * from './timestamp';

// Model Context Protocol (MCP) Server.
export * from './mcp';
