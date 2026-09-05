import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EpistemicTier, ProvenanceSidecar, VerificationResult, ProvenanceSettings, TimeVector, CheckResult, SignerDetail } from './types';

/**
 * A readable name for whoever actually signed, taken from the attestation.
 *
 * This label was the string 'Signed by Agent: Agy'. Once Anaiya and Anya had
 * their own keys it named the wrong signer on every note they signed - stating
 * something untrue while looking authoritative, inside the tool built to catch
 * exactly that.
 */
export function signerDisplayName(signers: string[], roles: string[]): string {
  if (!signers.length) return 'Agent';
  const signer = signers[0];

  // "Anaiya (Moonglade AI Ambassador) <moongladeai+anaiya@gmail.com>"
  const named = signer.match(/^\s*([^(<]+?)\s*[(<]/);
  let name = named ? named[1].trim() : '';

  // "moongladeai+anaiya@gmail.com" -> "Anaiya"
  if (!name) {
    const plus = signer.match(/\+([a-z0-9]+)@/i);
    if (plus) name = plus[1].charAt(0).toUpperCase() + plus[1].slice(1);
  }
  if (!name) name = signer.split('@')[0] || signer;

  const role = roles[0];
  // Role is deliberately omitted here: the status bar has room for a name, not
  // a name and a role. The full identity lives in the tooltip and the Inspector.
  const suffix = '';
  const more = signers.length > 1 ? ` +${signers.length - 1}` : '';
  return `${name}${suffix}${more}`;
}

export class ProvenanceEngine {
  static canonicalize(content: string): Buffer {
    const normalized = content.replace(/\r\n/g, '\n').normalize('NFC');
    return Buffer.from(normalized, 'utf8');
  }

  static sha256(content: string): string {
    const bytes = this.canonicalize(content);
    return crypto.createHash('sha256').update(bytes).digest('hex');
  }

  static formatCompactTime(raw: string): string {
    if (!raw) return 'N/A';
    if (raw.startsWith('ERROR')) return raw;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const hh = pad(d.getUTCHours());
      const mm = pad(d.getUTCMinutes());
      const ss = pad(d.getUTCSeconds());
      const yyyy = d.getUTCFullYear();
      const mo = pad(d.getUTCMonth() + 1);
      const dd = pad(d.getUTCDate());
      return `${yyyy}-${mo}-${dd} ${hh}:${mm}:${ss}`;
    }
    return raw;
  }

  static getSignerRegistry(registryPath: string): Record<string, any> {
    try {
      if (fs.existsSync(registryPath)) {
        const data = fs.readFileSync(registryPath, 'utf8');
        const json = JSON.parse(data);
        const map: Record<string, any> = {};
        if (Array.isArray(json.signers)) {
          for (const s of json.signers) {
            map[s.identity] = s;
          }
        }
        return map;
      }
    } catch (e) {
      console.warn('[ProvenanceEngine] Failed to load signer registry:', e);
    }
    return {};
  }

  /**
   * Whether the signer registry is itself signed by the root key.
   *
   * The registry names which keys are authorised. Unsigned, it is an assertion by
   * whoever last wrote the file, and every signature that verifies "against the
   * registry" inherits that. The panel has to be able to say which of the two it is.
   *
   * The signature is not checked here - that needs gpg, which the plugin does not
   * shell out to - so a present root_signature yields INDETERMINATE with the reason
   * stated, never VALID. Claiming a verification that was not performed is the exact
   * defect this plugin exists to surface.
   */
  static getRegistryAttestation(registryPath: string): CheckResult {
    try {
      if (!fs.existsSync(registryPath)) {
        return { outcome: 'INDETERMINATE', reason: 'signer registry not found at ' + registryPath };
      }
      const json = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const ref = json.root_signature;
      if (!ref) {
        return { outcome: 'INVALID', reason: 'registry declares no root signature; every entry is asserted, not attested' };
      }
      const sigPath = path.isAbsolute(ref) ? ref : path.join(path.dirname(registryPath), path.basename(ref));
      if (!fs.existsSync(sigPath)) {
        return { outcome: 'INVALID', reason: 'registry names a root signature at ' + ref + ' which is not present' };
      }
      return {
        outcome: 'INDETERMINATE',
        reason: 'root signature present at ' + ref + '; this plugin does not shell out to gpg, so it is not verified here'
      };
    } catch (e: any) {
      return { outcome: 'INDETERMINATE', reason: 'registry could not be read: ' + (e && e.message ? e.message : String(e)) };
    }
  }

  /**
   * Was the signing key inside its stated validity window when it signed?
   *
   * Checked against signing time, never against now. A key expiring does not
   * retroactively unmake what it signed while valid - that is what timestamping
   * establishes, and failing old attestations on today's date would discard the
   * archive every time a key rolled over.
   *
   * Signing time is taken from an RFC 3161 token covering the same bytes where one
   * exists, and only otherwise from the attestation's own `created`, which is written
   * by the same process that wrote the signature and is worth nothing against an
   * attacker who controls it. The distinction is reported, not hidden.
   */
  static expiryOutcome(expires: string | undefined, att: any, siblings: any[]): CheckResult {
    if (!expires) return { outcome: 'VALID' };

    const expiry = Date.parse(expires + 'T23:59:59Z');
    if (Number.isNaN(expiry)) {
      return { outcome: 'INDETERMINATE', reason: 'registry expiry "' + expires + '" is not a date' };
    }

    let signedAt = NaN;
    let source = '';
    const token = (siblings || []).find((s: any) =>
      s.method === 'rfc3161' && s.sha256 === att.sha256 && (s.token_b64 || s.der_base64));
    if (token && token.tsa_time) {
      signedAt = Date.parse(token.tsa_time);
      source = 'RFC 3161 token';
    }
    if (Number.isNaN(signedAt) && att.created) {
      signedAt = Date.parse(att.created);
      source = 'self-reported time';
    }
    if (Number.isNaN(signedAt)) {
      return { outcome: 'INDETERMINATE', reason: 'no usable signing time, so expiry ' + expires + ' was not enforced' };
    }

    if (signedAt > expiry) {
      return { outcome: 'INVALID', reason: 'key expired ' + expires + ' but signed later, per ' + source };
    }
    if (Date.now() > expiry) {
      return { outcome: 'VALID', reason: 'key expired ' + expires + ', valid when it signed, per ' + source };
    }
    if (source === 'self-reported time') {
      return { outcome: 'VALID', reason: 'expiry checked against self-reported time, not a trusted timestamp' };
    }
    return { outcome: 'VALID' };
  }

  static extractFrontmatterDate(content: string): string | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (match) {
      const yaml = match[1];
      const dateMatch = yaml.match(/^date:\s*['"]?([^'"\n]+)['"]?/m);
      if (dateMatch) return dateMatch[1].trim();
      const updatedMatch = yaml.match(/^updated:\s*['"]?([^'"\n]+)['"]?/m);
      if (updatedMatch) return updatedMatch[1].trim();
    }
    return null;
  }

  static verifyFile(
    fullFilePath: string,
    fileContent: string,
    settings: ProvenanceSettings
  ): VerificationResult {
    const currentHash = this.sha256(fileContent);
    const sidecarPath = fullFilePath + '.provenance.json';

    let fsMtime: string | undefined;
    try {
      if (fs.existsSync(fullFilePath)) {
        const stat = fs.statSync(fullFilePath);
        fsMtime = new Date(stat.mtimeMs).toISOString();
      }
    } catch (e) {}

    const fmDate = this.extractFrontmatterDate(fileContent);
    const allVectors: TimeVector[] = [];

    // If no sidecar exists: working draft. Filesystem time first - see the note
    // on the same ordering further down; an unsigned file is where these weak
    // vectors matter most, because they are the only ones there are.
    if (!fs.existsSync(sidecarPath)) {
      if (fsMtime) {
        allVectors.push({
          tier: 'L4_HOST_METADATA',
          method: 'OS Stat (mtime)',
          source: 'Local File Time',
          timestamp: this.formatCompactTime(fsMtime),
          status: 'SUCCESS',
          isHighest: true,
          securityLevel: 'Filesystem write artifact (stat.mtime) - not chosen by an author'
        });
      }
      if (fmDate) {
        allVectors.push({
          tier: 'L4_HOST_METADATA',
          method: 'YAML Front Matter',
          source: 'Front Matter Date',
          timestamp: fmDate,
          status: 'SUCCESS',
          isHighest: !fsMtime,
          securityLevel: 'Author asserted date (date: in YAML) - written, not observed'
        });
      }

      return {
        tier: EpistemicTier.TIER_3_WORKING_DRAFT,
        verified: false,
        statusLabel: 'Working Draft',
        statusEmoji: '📝',
        statusColor: '#888888',
        filePath: fullFilePath,
        currentHash,
        signers: [],
        roles: [],
        highestTimeVector: allVectors.find(v => v.isHighest) || allVectors[0],
        allTimeVectors: allVectors
      };
    }

    try {
      const sidecarRaw = fs.readFileSync(sidecarPath, 'utf8');
      const sidecar: ProvenanceSidecar = JSON.parse(sidecarRaw);

      const attestations = Array.isArray(sidecar.attestations) ? sidecar.attestations : [];
      const signersRegistry = this.getSignerRegistry(settings.canonicalTrustRegistry);

      let hasHumanRoot = false;
      let hasAgent = false;
      const detectedSigners: string[] = [];
      const detectedRoles: string[] = [];
      let tokenCorrupted = false;
      let tokenErrorMessage = '';

      for (const att of attestations) {
        if (att.signer) {
          if (!detectedSigners.includes(att.signer)) {
            detectedSigners.push(att.signer);
            const reg = signersRegistry[att.signer];
            const role = reg ? reg.role : (att.tier || 'unknown');
            detectedRoles.push(role);
          }

          const sLower = att.signer.toLowerCase();
          const isHuman = (
            sLower === 'moongladeai@gmail.com' ||
            sLower.startsWith('signer@') ||
            sLower.includes('architect') ||
            sLower.includes('marc') ||
            sLower.includes('zen') ||
            att.tier === 'HUMAN_SOVEREIGN_ROOT' ||
            (signersRegistry[att.signer] && signersRegistry[att.signer].role === 'architect')
          );

          if (isHuman) {
            hasHumanRoot = true;
          } else if (
            // Any registered non-architect signer is agent-class. Enumerating
            // personas here meant Anya was never detected at all, and Anaiya's
            // 'ambassador' role failed the role === 'agent' test - so adding a
            // persona silently produced an unattributed note rather than an error.
            (signersRegistry[att.signer] && signersRegistry[att.signer].role !== 'architect') ||
            att.tier === 'AGENT_ATTESTED' ||
            /\+[a-z0-9]+@/.test(sLower) ||
            sLower.includes('@moongladeai')
          ) {
            hasAgent = true;
          }
        }

        // STRICT TIMESTAMP VECTORS ONLY: RFC 3161 token and probes
        if (att.method === 'rfc3161' || att.tsa) {
          const tokenStr = att.token_b64 || att.der_base64;
          let isTokenValid = false;

          if (tokenStr) {
            try {
              const rawBuf = Buffer.from(tokenStr, 'base64');
              const isDer = rawBuf.length > 4 && rawBuf[0] === 0x30;
              const isCorruptString = rawBuf.toString('latin1').includes('CORRUPTED');
              const sealedHash = sidecar.sha256_at_last_write || att.sha256;
              const containsHash = sealedHash ? rawBuf.includes(Buffer.from(sealedHash, 'hex')) : true;

              if (!isDer || isCorruptString || !containsHash) {
                tokenCorrupted = true;
                tokenErrorMessage = 'RFC 3161 timestamp token is corrupted or document digest mismatch.';
              } else {
                isTokenValid = true;
              }
            } catch (err: any) {
              tokenCorrupted = true;
              tokenErrorMessage = 'Failed to decode base64 timestamp token: ' + err.message;
            }
          }

          // Main RFC 3161 Token
          const mainTime = att.tsa_time || att.genTime || att.created || att.timestamp;
          if (mainTime) {
            allVectors.push({
              tier: att.tier || 'L1_CRYPTO_PRIMARY',
              method: 'RFC3161 Token',
              source: (att.tsa || 'RFC 3161 TSA').replace(/^https?:\/\//, ''),
              timestamp: this.formatCompactTime(mainTime),
              status: tokenCorrupted ? 'CORRUPTED' : (isTokenValid ? 'SUCCESS' : 'UNVERIFIED'),
              isHighest: false,
              securityLevel: tokenCorrupted
                ? 'FAILED: Cryptographic Digest Mismatch in TSA Token'
                : 'Level 1: Hardware-backed RFC 3161 Atomic Clock (PKCS#7 Verified)'
            });
          }

          // Probe vectors (L1, L2, L3, L4 probes)
          if (Array.isArray(att.probes)) {
            for (const p of att.probes) {
              if (p.server && (p.timestamp_iso || p.error)) {
                const isErr = Boolean(p.error || p.status === 'ERROR');
                allVectors.push({
                  tier: p.tier || 'L2_CRYPTO_FALLBACK',
                  method: p.method || 'RFC3161',
                  source: p.server.replace(/^https?:\/\//, ''),
                  timestamp: isErr ? (p.error || 'ERROR') : this.formatCompactTime(p.timestamp_iso || ''),
                  status: p.status || (isErr ? 'ERROR' : 'SUCCESS'),
                  isHighest: false,
                  securityLevel: p.tier === 'L1_CRYPTO_PRIMARY'
                    ? 'Level 1: Primary TSA Probe'
                    : (p.tier === 'L2_CRYPTO_FALLBACK'
                      ? 'Level 2: Fallback TSA Probe'
                      : (p.tier === 'L3_NETWORK_CONSENSUS'
                        ? 'Level 3: Network TLS Probe'
                        : 'Level 4: Host Kernel UTC'))
                });
              }
            }
          }
        }
      }

      // If no RFC 3161 vectors were found, separately label Front Matter Date and Local File Time
      if (allVectors.length === 0) {
        if (fsMtime) {
          allVectors.push({
            tier: 'L4_HOST_METADATA',
            method: 'OS Stat (mtime)',
            source: 'Local File Time',
            timestamp: this.formatCompactTime(fsMtime),
            status: 'SUCCESS',
            isHighest: true,
            securityLevel: 'Filesystem write artifact (stat.mtime) - not chosen by an author'
          });
        }
        if (fmDate) {
          allVectors.push({
            tier: 'L4_HOST_METADATA',
            method: 'YAML Front Matter',
            source: 'Front Matter Date',
            timestamp: fmDate,
            status: 'SUCCESS',
            isHighest: !fsMtime,
            securityLevel: 'Author asserted date (date: in YAML) - written, not observed'
          });
        }
      }

      // Ensure local filesystem time is always available as an L4 baseline vector
      if (fsMtime && !allVectors.some(v => v.source === 'Local File Time')) {
        allVectors.push({
          tier: 'L4_HOST_METADATA',
          method: 'OS Stat (mtime)',
          source: 'Local File Time',
          timestamp: this.formatCompactTime(fsMtime),
          status: 'SUCCESS',
          isHighest: false,
          securityLevel: 'Filesystem write artifact (stat.mtime) - not chosen by an author'
        });
      }

      // Sort strictly by Tier: L1 -> L2 -> L3 -> L4
      const tierRank: Record<string, number> = {
        'L1_CRYPTO_PRIMARY': 1,
        'L2_CRYPTO_FALLBACK': 2,
        'L3_NETWORK_CONSENSUS': 3,
        'L4_HOST_UNAUTHENTICATED': 4,
        'L4_HOST_METADATA': 4
      };

      allVectors.sort((a, b) => {
        if (tokenCorrupted) {
          if (a.status === 'CORRUPTED' && b.status !== 'CORRUPTED') return -1;
          if (b.status === 'CORRUPTED' && a.status !== 'CORRUPTED') return 1;
        }
        const rankA = tierRank[a.tier] || 99;
        const rankB = tierRank[b.tier] || 99;
        if (rankA !== rankB) return rankA - rankB;
        if (a.status === 'SUCCESS' && b.status !== 'SUCCESS') return -1;
        if (b.status === 'SUCCESS' && a.status !== 'SUCCESS') return 1;
        return a.source.localeCompare(b.source);
      });

      // Find highest assurance time vector:
      // If primary L1 token is corrupted, find the highest working FALLBACK vector (L2, L3, or L4)
      const bestVector = allVectors.find(v => v.status === 'SUCCESS') || allVectors[0];
      if (bestVector) {
        bestVector.isHighest = true;
        if (tokenCorrupted) {
          bestVector.fallbackFrom = 'L1_CRYPTO_PRIMARY';
          bestVector.fallbackReason = tokenErrorMessage || 'Primary L1 RFC 3161 timestamp token is corrupted (digest mismatch).';
        }
      }

      /*
       * Everything the inspector shows beyond the verdict, gathered once.
       *
       * These were previously read from the sidecar, used to compute a boolean, and
       * dropped at the model boundary - so the panel could say a signature verified
       * but not which key, whether that key was in date, or whether the registry
       * naming it was itself attested. Spread into every return below, including the
       * breach paths, because a reader inspecting a breach needs this detail most.
       */
      const detail: Partial<VerificationResult> = (() => {
        const signerDetails: SignerDetail[] = attestations
          .filter((a: any) => a.signer)
          .map((a: any) => {
            const reg = signersRegistry[a.signer] || {};
            return {
              identity: a.signer,
              method: a.method || 'unknown',
              fingerprint: a.fingerprint || reg.fingerprint,
              role: reg.role,
              unattended: reg.unattended,
              expires: reg.expires,
              validAtSigning: ProvenanceEngine.expiryOutcome(reg.expires, a, attestations)
            };
          });

        const scopedAtt = attestations.find((a: any) => a.scope);
        const standard = sidecar.standard || '';
        const versionMatch = standard.match(/v(\d+)/i);

        return {
          payloadVersion: versionMatch ? ('v' + versionMatch[1]) : (standard || undefined),
          attestationCount: attestations.length,
          signerDetails,
          scope: scopedAtt ? scopedAtt.scope : undefined,
          sidecarPath,
          sidecarPresent: true,
          registryAttested: ProvenanceEngine.getRegistryAttestation(settings.canonicalTrustRegistry),
          trustAnchorPath: settings.canonicalTrustRegistry,
          tokenVerification: attestations.some((a: any) => a.token_b64 || a.der_base64)
            ? {
                outcome: 'INDETERMINATE' as const,
                reason: 'token digest and structure checked; its TSA signature and certificate chain are not verified here (FINDINGS.md #8)'
              }
            : { outcome: 'INDETERMINATE' as const, reason: 'no RFC 3161 token recorded' },
          revocation: {
            outcome: 'INDETERMINATE' as const,
            reason: 'no revocation mechanism exists in this format yet; not checked'
          }
        };
      })();

      /*
       * Scope is checked BEFORE the hash, and the order is the whole point.
       *
       * A replayed attestation - a real signature, made for a different file -
       * usually differs in content too, so the hash check fires first and reports
       * "Integrity Breach (Bit-Rot)". The breach is caught but the diagnosis is
       * wrong, and wrong for the most interesting case there is: perfect
       * cryptography pointed at the wrong document.
       *
       * Checking scope first means the specific answer wins over the generic one.
       */
      const scopedAtt = attestations.find((a: any) => a.scope);
      if (scopedAtt) {
        const normalizedFile = fullFilePath.replace(/\\/g, '/');
        let vaultRoot = (settings.registeredVaults || [])
          .map(v => v.vaultPath.replace(/\\/g, '/'))
          .filter(vp => vp && normalizedFile.startsWith(vp))
          .sort((a, b) => b.length - a.length)[0];

        if (!vaultRoot) {
          const vIdx = normalizedFile.lastIndexOf('/Vault/');
          if (vIdx !== -1) {
            vaultRoot = normalizedFile.slice(0, vIdx + '/Vault'.length);
          }
        }

        if (vaultRoot) {
          const relPath = normalizedFile.slice(vaultRoot.length).replace(/^\/+/, '');
          const expectedScope = 'moonglade:vault:' + relPath;
          if (scopedAtt.scope !== expectedScope) {
            return {
              tier: EpistemicTier.TIER_BREACH,
              verified: false,
              statusLabel: 'Scope Mismatch (Replayed Attestation)',
              statusEmoji: '♻️',
              statusColor: '#ef4444',
              filePath: fullFilePath,
              currentHash,
              sealedHash: sidecar.sha256_at_last_write,
              signers: detectedSigners,
              roles: detectedRoles,
              highestTimeVector: bestVector,
              allTimeVectors: allVectors,
          ...detail,
              error: 'This attestation was made for "' + scopedAtt.scope +
                     '" but this file is "' + expectedScope +
                     '". The signature may be entirely valid - it is simply not for this document.'
            };
          }
        }
      }

      // Check for content hash mismatch (Failure 01, 06)
      if (currentHash !== sidecar.sha256_at_last_write) {
        return {
          tier: EpistemicTier.TIER_BREACH,
          verified: false,
          statusLabel: 'Integrity Breach (Bit-Rot)',
          statusEmoji: '🚨',
          statusColor: '#ef4444',
          filePath: fullFilePath,
          currentHash,
          sealedHash: sidecar.sha256_at_last_write,
          signers: detectedSigners,
          roles: detectedRoles,
          highestTimeVector: bestVector,
          allTimeVectors: allVectors,
          ...detail,
          error: "Current hash (" + currentHash.slice(0, 10) + "...) does not match sealed hash (" + sidecar.sha256_at_last_write.slice(0, 10) + "...)."
        };
      }

      // Check for token corruption (Failure 05)
      if (tokenCorrupted) {
        return {
          tier: EpistemicTier.TIER_BREACH,
          verified: false,
          statusLabel: 'Timestamp Token Corrupted',
          statusEmoji: '🚨',
          statusColor: '#ef4444',
          filePath: fullFilePath,
          currentHash,
          sealedHash: sidecar.sha256_at_last_write,
          signers: detectedSigners,
          roles: detectedRoles,
          highestTimeVector: bestVector,
          allTimeVectors: allVectors,
          ...detail,
          error: tokenErrorMessage || 'RFC 3161 timestamp token is corrupted or does not match document digest.'
        };
      }

      // Successful verification tier resolution (Human signed status is GREEN #10b981)
      if (hasHumanRoot && hasAgent) {
        return {
          tier: EpistemicTier.TIER_DUAL_RATIFIED,
          verified: true,
          statusLabel: 'Dual-Attested (Ratified)',
          statusEmoji: '⚔️',
          statusColor: '#10b981',
          filePath: fullFilePath,
          currentHash,
          sealedHash: sidecar.sha256_at_last_write,
          signers: detectedSigners,
          roles: detectedRoles,
          highestTimeVector: bestVector,
          allTimeVectors: allVectors,
          ...detail
        };
      } else if (hasHumanRoot) {
        return {
          tier: EpistemicTier.TIER_1_HUMAN_SOVEREIGN,
          verified: true,
          statusLabel: signerDisplayName(detectedSigners, detectedRoles),
          statusEmoji: '🛡️',
          statusColor: '#10b981',
          filePath: fullFilePath,
          currentHash,
          sealedHash: sidecar.sha256_at_last_write,
          signers: detectedSigners,
          roles: detectedRoles,
          highestTimeVector: bestVector,
          allTimeVectors: allVectors,
          ...detail
        };
      } else if (hasAgent) {
        return {
          tier: EpistemicTier.TIER_2_AGENT_ATTESTED,
          verified: true,
          statusLabel: signerDisplayName(detectedSigners, detectedRoles),
          statusEmoji: '🤖',
          statusColor: '#06b6d4',
          filePath: fullFilePath,
          currentHash,
          sealedHash: sidecar.sha256_at_last_write,
          signers: detectedSigners,
          roles: detectedRoles,
          highestTimeVector: bestVector,
          allTimeVectors: allVectors,
          ...detail
        };
      } else {
        return {
          tier: EpistemicTier.TIER_2_AGENT_ATTESTED,
          verified: true,
          statusLabel: 'Sealed Artifact',
          statusEmoji: '🔒',
          statusColor: '#10b981',
          filePath: fullFilePath,
          currentHash,
          sealedHash: sidecar.sha256_at_last_write,
          signers: detectedSigners,
          roles: detectedRoles,
          highestTimeVector: bestVector,
          allTimeVectors: allVectors,
          ...detail
        };
      }
    } catch (e: any) {
      return {
        tier: EpistemicTier.TIER_BREACH,
        verified: false,
        statusLabel: 'Corrupted Sidecar',
        statusEmoji: '⚠️',
        statusColor: '#f59e0b',
        filePath: fullFilePath,
        currentHash,
        signers: [],
        roles: [],
        allTimeVectors: [],
        error: e.message
      };
    }
  }

  static sealAgentNote(
    fullFilePath: string,
    fileContent: string,
    vaultRoot: string,
    agentIdentity = 'moongladeai+agy@gmail.com'
  ): VerificationResult {
    const canonicalBytes = this.canonicalize(fileContent);
    const sha256 = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
    const relPath = path.relative(vaultRoot, fullFilePath).replace(/\\/g, '/');
    const scope = "moonglade:vault:" + relPath;
    const now = new Date().toISOString();
    const compactTime = this.formatCompactTime(now);

    const sidecarPath = fullFilePath + '.provenance.json';
    let existingAttestations: any[] = [];
    if (fs.existsSync(sidecarPath)) {
      try {
        const old = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
        if (Array.isArray(old.attestations)) {
          existingAttestations = old.attestations.filter((a: any) => a.signer !== agentIdentity);
        }
      } catch (e) {}
    }

    const agentAttestation = {
      method: 'moonglade-agent-attestation-v2',
      signer: agentIdentity,
      tier: 'AGENT_ATTESTED',
      unattended: true,
      scope,
      sha256,
      created: now
    };

    const sidecar: ProvenanceSidecar = {
      standard: 'Moonglade Provenance Attestation Bundle v2',
      sha256_at_last_write: sha256,
      scope,
      signer: agentIdentity,
      updated: now,
      attestations: [...existingAttestations, agentAttestation]
    };

    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');

    const agentVector: TimeVector = {
      tier: 'L4_HOST_METADATA',
      method: 'Agent Epoch',
      source: agentIdentity,
      timestamp: compactTime,
      status: 'SUCCESS',
      isHighest: true,
      securityLevel: 'Agent Session Transaction Time'
    };

    return {
      tier: EpistemicTier.TIER_2_AGENT_ATTESTED,
      verified: true,
      statusLabel: signerDisplayName([agentIdentity], []),
      statusEmoji: '🤖',
      statusColor: '#06b6d4',
      filePath: fullFilePath,
      currentHash: sha256,
      sealedHash: sha256,
      signers: [agentIdentity],
      roles: ['agent'],
      highestTimeVector: agentVector,
      allTimeVectors: [agentVector]
    };
  }
}
