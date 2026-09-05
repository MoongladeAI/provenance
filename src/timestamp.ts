import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';

/**
 * ‼️ INCOMPLETE - SIGNATURE VERIFICATION IS NOT IMPLEMENTED. Finding #8, open.
 *
 * This module obtains RFC 3161 timestamps and validates their STRUCTURE. It does not
 * verify that the TSA signed them. Three layers, and only the first is built here:
 *
 *   1. Binding    DONE  - PKIStatus granted, messageImprint matches the caller's
 *                         digest, nonce echoes. Rules out replay and wrong subject.
 *   2. Signature  TODO  - Parse CMS SignedData, verify SignerInfo.signature over the
 *                         signed attributes RE-ENCODED AS SET OF (0x31, not the [0]
 *                         IMPLICIT form they arrive in), and bind the certificate via
 *                         signingCertificateV2 (RFC 5035) rather than trusting
 *                         whichever cert is present.
 *   3. Trust      OUT OF SCOPE - chain building, id-kp-timeStamping EKU (must be
 *                         critical, RFC 3161 s2.3), validity at genTime, CRL/OCSP.
 *                         Node ships no CRL or OCSP; a half-built chain validator
 *                         returns a confident wrong answer, which is worse than none.
 *
 * Layer 2 needs no network and no dependency: responses are requested with certReq,
 * so the full chain is already embedded. crypto.verify() and X509Certificate suffice.
 *
 * Until layer 2 lands, a genTime from this module rests on TLS and the TSA's good
 * behaviour - not on cryptography performed here. See FINDINGS.md #8 and TIMESTAMP.md.
 * The Python sealing path verifies via `openssl ts -verify` and is unaffected.
 */

/**
 * RFC 3161 Timestamping and Multi-Source Degrading Timestamping Architecture (DTA)
 * Pure TypeScript implementation with zero external dependencies.
 *
 * THE INVARIANT TIMESTAMPING DOCTRINE:
 * "Always return a timestamp, of the best quality you are currently capable."
 *
 * The timestamping engine guarantees liveness under all circumstances. It never crashes,
 * stalls, or fails a sealing pipeline due to network outages or remote rate limits.
 * It degrades transparently along a 4-tier epistemic assurance cascade:
 *   - L1_CRYPTO_PRIMARY: Commercial WebTrust CAs (DigiCert, Sectigo, GlobalSign, Entrust, Certum)
 *   - L2_CRYPTO_FALLBACK: Ecosystem & Community TSAs (Apple, QuoVadis, FreeTSA)
 *   - L3_NETWORK_CONSENSUS: TLS HTTP Date consensus from global edge providers (Cloudflare, Google)
 *   - L4_HOST_UNAUTHENTICATED: Local monotonic kernel UTC clock (localhost)
 */

export interface TSAProbeResult {
  tier: 'L1_CRYPTO_PRIMARY' | 'L2_CRYPTO_FALLBACK' | 'L3_NETWORK_CONSENSUS' | 'L4_HOST_UNAUTHENTICATED';
  method: 'RFC3161' | 'HTTP_DATE' | 'KERNEL_UTC';
  server: string;
  status: 'SUCCESS' | 'ERROR' | 'TIMEOUT';
  timestamp_iso?: string;
  token_b64?: string;
  token_bytes?: Buffer;
  error?: string;
}

export interface DTAResult {
  tier: 'L1_CRYPTO_PRIMARY' | 'L2_CRYPTO_FALLBACK' | 'L3_NETWORK_CONSENSUS' | 'L4_HOST_UNAUTHENTICATED';
  tsa?: string;
  tsa_time: string;
  token_b64?: string;
  token_bytes?: Buffer;
  probes: TSAProbeResult[];
}

export interface DTAOptions {
  /** If specified, bypasses multi-tier fanout and queries only this specific TSA server URL or network host */
  specifiedServer?: string;

  /** If specified, restricts queries to this tier only */
  specifiedTier?: 'L1_CRYPTO_PRIMARY' | 'L2_CRYPTO_FALLBACK' | 'L3_NETWORK_CONSENSUS' | 'L4_HOST_UNAUTHENTICATED';

  /** Number of probes to simultaneously seek from each tier (default: 1) */
  probesPerTier?: number;

  /** Whether to rotate through available endpoints (default: true) */
  rotate?: boolean;

  primaryEndpoints?: string[];
  fallbackEndpoints?: string[];
  networkEndpoints?: string[];
  timeoutMs?: number;
  certReq?: boolean;
  nonce?: Buffer | bigint;
  circuitBreaker?: EndpointCircuitBreaker;
  maxParallelProbes?: number; // legacy alias for probesPerTier
}

export interface TierEndpointConfig {
  default: string;
  fallbacks: string[];
}

export const TIER_CONFIGS: {
  L1: TierEndpointConfig;
  L2: TierEndpointConfig;
  L3: TierEndpointConfig;
} = {
  L1: {
    default: 'http://timestamp.digicert.com',
    fallbacks: [
      'http://timestamp.sectigo.com',
      'http://timestamp.globalsign.com/tsa/r6advanced1',
      'http://timestamp.entrust.net/TSS/RFC3161sha2TS',
      'http://time.certum.pl'
    ]
  },
  L2: {
    default: 'http://timestamp.apple.com/ts01',
    fallbacks: [
      'http://ts.quovadisglobal.com/eu',
      'https://freetsa.org/tsr'
    ]
  },
  L3: {
    default: 'cloudflare.com',
    fallbacks: [
      'google.com'
    ]
  }
};

export const DEFAULT_PRIMARY_TSAS = [
  TIER_CONFIGS.L1.default,
  ...TIER_CONFIGS.L1.fallbacks
];

export const DEFAULT_FALLBACK_TSAS = [
  TIER_CONFIGS.L2.default,
  ...TIER_CONFIGS.L2.fallbacks
];

export const DEFAULT_NETWORK_HOSTS = [
  TIER_CONFIGS.L3.default,
  ...TIER_CONFIGS.L3.fallbacks
];

export interface ServerPolicy {
  url: string;
  name: string;
  tier: 'L1_CRYPTO_PRIMARY' | 'L2_CRYPTO_FALLBACK' | 'L3_NETWORK_CONSENSUS';
  /** Minimum interval in ms between consecutive requests to this endpoint (rate-limit compliance) */
  minIntervalMs: number;
}

export const DEFAULT_SERVER_POLICIES: ServerPolicy[] = [
  // Tier 1 Primary
  { url: 'http://timestamp.digicert.com', name: 'DigiCert', tier: 'L1_CRYPTO_PRIMARY', minIntervalMs: 1000 },
  { url: 'http://timestamp.sectigo.com', name: 'Sectigo', tier: 'L1_CRYPTO_PRIMARY', minIntervalMs: 1000 },
  { url: 'http://timestamp.globalsign.com/tsa/r6advanced1', name: 'GlobalSign', tier: 'L1_CRYPTO_PRIMARY', minIntervalMs: 1000 },
  { url: 'http://timestamp.entrust.net/TSS/RFC3161sha2TS', name: 'Entrust', tier: 'L1_CRYPTO_PRIMARY', minIntervalMs: 1000 },
  { url: 'http://time.certum.pl', name: 'Certum', tier: 'L1_CRYPTO_PRIMARY', minIntervalMs: 1000 },

  // Tier 2 Fallback
  { url: 'http://timestamp.apple.com/ts01', name: 'Apple', tier: 'L2_CRYPTO_FALLBACK', minIntervalMs: 1000 },
  { url: 'http://ts.quovadisglobal.com/eu', name: 'QuoVadis', tier: 'L2_CRYPTO_FALLBACK', minIntervalMs: 1000 },
  { url: 'https://freetsa.org/tsr', name: 'FreeTSA', tier: 'L2_CRYPTO_FALLBACK', minIntervalMs: 15000 }, // FreeTSA 15s policy

  // Tier 3 Network Consensus
  { url: 'cloudflare.com', name: 'Cloudflare', tier: 'L3_NETWORK_CONSENSUS', minIntervalMs: 500 },
  { url: 'google.com', name: 'Google', tier: 'L3_NETWORK_CONSENSUS', minIntervalMs: 500 }
];

export interface EndpointHealth {
  url?: string;
  name?: string;
  consecutiveFailures: number;
  nextAvailableTime: number;
  lastRequestTime?: number;
  lastSuccessTime?: number;
  lastError?: string;
}

export interface ServerStatusSnapshot {
  url: string;
  name?: string;
  status: 'READY' | 'COOLDOWN' | 'BACKOFF';
  consecutiveFailures: number;
  remainingCooldownMs: number;
  lastError?: string;
}

/**
 * Circuit breaker & Server Pool Manager.
 * Manages:
 * 1. Endpoint health and consecutive failure tracking
 * 2. Exponential backoff for failing/down servers
 * 3. Individual server policies (e.g. FreeTSA 15s rate-limit cooldown)
 * 4. Fair round-robin rotation queue ("who's next")
 * 5. Telemetry for ready vs disabled/cooldown servers
 */
export class EndpointCircuitBreaker {
  private health: Map<string, EndpointHealth> = new Map();
  private policies: Map<string, ServerPolicy> = new Map();
  private queuePointers: Map<string, number> = new Map();
  readonly baseBackoffMs: number;
  readonly maxBackoffMs: number;

  constructor(options: { baseBackoffMs?: number; maxBackoffMs?: number; policies?: ServerPolicy[] } = {}) {
    this.baseBackoffMs = options.baseBackoffMs ?? 5000;   // 5s initial backoff
    this.maxBackoffMs = options.maxBackoffMs ?? 300000;   // 5m max backoff
    const initialPolicies = options.policies || DEFAULT_SERVER_POLICIES;
    for (const p of initialPolicies) {
      this.policies.set(p.url, p);
    }
  }

  getPolicy(url: string): ServerPolicy {
    return this.policies.get(url) || {
      url,
      name: url,
      tier: 'L1_CRYPTO_PRIMARY',
      minIntervalMs: 1000
    };
  }

  setPolicy(policy: ServerPolicy): void {
    this.policies.set(policy.url, policy);
  }

  isAvailable(url: string, now = Date.now()): boolean {
    const entry = this.health.get(url);
    if (!entry) return true;
    return now >= entry.nextAvailableTime;
  }

  getServerStatus(url: string, now = Date.now()): 'READY' | 'COOLDOWN' | 'BACKOFF' {
    const entry = this.health.get(url);
    if (!entry || now >= entry.nextAvailableTime) {
      return 'READY';
    }
    if (entry.consecutiveFailures > 0) {
      return 'BACKOFF';
    }
    return 'COOLDOWN';
  }

  recordRequest(url: string, now = Date.now()): void {
    const policy = this.getPolicy(url);
    const prev = this.health.get(url) || { consecutiveFailures: 0, nextAvailableTime: 0 };
    this.health.set(url, {
      ...prev,
      url,
      name: policy.name,
      lastRequestTime: now,
      // Enforce server policy rate cooldown
      nextAvailableTime: Math.max(prev.nextAvailableTime, now + policy.minIntervalMs)
    });
  }

  recordSuccess(url: string, now = Date.now()): void {
    const policy = this.getPolicy(url);
    const prev = this.health.get(url);
    const cooldownUntil = (prev?.lastRequestTime || 0) + policy.minIntervalMs;
    this.health.set(url, {
      url,
      name: policy.name,
      consecutiveFailures: 0,
      lastSuccessTime: now,
      lastRequestTime: prev?.lastRequestTime,
      // Clear failure backoff; retain policy rate cooldown only if cooldownUntil > now
      nextAvailableTime: cooldownUntil > now ? cooldownUntil : 0
    });
  }

  recordFailure(url: string, error: string, now = Date.now()): number {
    const policy = this.getPolicy(url);
    const prev = this.health.get(url) || { consecutiveFailures: 0, nextAvailableTime: 0 };
    const consecutiveFailures = prev.consecutiveFailures + 1;
    // Exponential backoff: base * 2^(failures - 1)
    const backoffMs = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * Math.pow(2, consecutiveFailures - 1)
    );
    this.health.set(url, {
      url,
      name: policy.name,
      consecutiveFailures,
      nextAvailableTime: now + backoffMs,
      lastError: error,
      lastRequestTime: prev.lastRequestTime,
      lastSuccessTime: prev.lastSuccessTime
    });
    return backoffMs;
  }

  getHealth(url: string): EndpointHealth | undefined {
    return this.health.get(url);
  }

  reset(): void {
    this.health.clear();
    this.queuePointers.clear();
  }

  /**
   * Return ordered candidate queue starting with "who's next".
   */
  getQueue(urls: string[], queueKey = 'default'): string[] {
    if (urls.length === 0) return [];
    const ptr = (this.queuePointers.get(queueKey) || 0) % urls.length;
    return [...urls.slice(ptr), ...urls.slice(0, ptr)];
  }

  /**
   * Return servers currently on cooldown or in failure backoff.
   */
  getDisabledEndpoints(urls: string[], now = Date.now()): ServerStatusSnapshot[] {
    return urls
      .filter(u => !this.isAvailable(u, now))
      .map(u => {
        const h = this.health.get(u)!;
        const status = this.getServerStatus(u, now);
        return {
          url: u,
          name: this.getPolicy(u).name,
          status,
          consecutiveFailures: h.consecutiveFailures,
          remainingCooldownMs: Math.max(0, h.nextAvailableTime - now),
          lastError: h.lastError
        };
      });
  }

  /**
   * Return servers currently READY to serve requests immediately.
   */
  getReadyEndpoints(urls: string[], now = Date.now()): ServerStatusSnapshot[] {
    return urls
      .filter(u => this.isAvailable(u, now))
      .map(u => {
        const h = this.health.get(u);
        return {
          url: u,
          name: this.getPolicy(u).name,
          status: 'READY',
          consecutiveFailures: h?.consecutiveFailures || 0,
          remainingCooldownMs: 0
        };
      });
  }

  /**
   * Fair rotating endpoint selection.
   * Cycles through the array in round-robin order, picking healthy/available endpoints,
   * skipping those in failure backoff or policy cooldown, and advancing the queue pointer.
   */
  selectRotatingEndpoints(urls: string[], count = 1, queueKey = 'default', now = Date.now()): string[] {
    if (urls.length === 0) return [];
    const len = urls.length;
    const currentPtr = (this.queuePointers.get(queueKey) || 0) % len;
    const selected: string[] = [];

    // 1. Scan in round-robin order starting at currentPtr for available endpoints
    let checkIdx = currentPtr;
    for (let i = 0; i < len && selected.length < count; i++) {
      const candidate = urls[checkIdx];
      if (this.isAvailable(candidate, now)) {
        selected.push(candidate);
      }
      checkIdx = (checkIdx + 1) % len;
    }

    // 2. If not enough available endpoints, pick those with shortest remaining cooldown
    if (selected.length < count) {
      const remaining = urls.filter(u => !selected.includes(u));
      remaining.sort((a, b) => {
        const ta = this.health.get(a)?.nextAvailableTime || 0;
        const tb = this.health.get(b)?.nextAvailableTime || 0;
        return ta - tb;
      });
      for (const candidate of remaining) {
        if (selected.length >= count) break;
        selected.push(candidate);
      }
    }

    // Advance queue pointer for the next request
    this.queuePointers.set(queueKey, (currentPtr + 1) % len);

    return selected;
  }

  /**
   * Prioritized selection (used for targeted or non-rotating requests).
   */
  selectEndpoints(urls: string[], maxCount = urls.length, now = Date.now()): string[] {
    return this.selectRotatingEndpoints(urls, maxCount, 'legacy', now);
  }
}

export const globalCircuitBreaker = new EndpointCircuitBreaker();

/**
 * Helper to encode ASN.1 DER length octets.
 */
export function encodeDerLength(len: number): Buffer {
  if (len < 128) {
    return Buffer.from([len]);
  }
  const octets: number[] = [];
  let temp = len;
  while (temp > 0) {
    octets.unshift(temp & 0xff);
    temp >>= 8;
  }
  return Buffer.from([0x80 | octets.length, ...octets]);
}

/**
 * Helper to wrap elements in an ASN.1 DER SEQUENCE (tag 0x30).
 */
export function encodeDerSequence(items: Buffer[]): Buffer {
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x30]), encodeDerLength(body.length), body]);
}

/**
 * Helper to decode ASN.1 DER length octets from a buffer at a given offset.
 * Returns the parsed length and the number of octets consumed by the length header.
 */
export function decodeDerLength(buf: Buffer, offset: number): { length: number; headerLength: number } {
  if (offset >= buf.length) {
    throw new Error('Offset out of bounds reading DER length');
  }
  const first = buf[offset];
  if (first < 0x80) {
    return { length: first, headerLength: 1 };
  }
  const octetCount = first & 0x7f;
  if (offset + 1 + octetCount > buf.length) {
    throw new Error('Malformed DER length: exceeds buffer bounds');
  }
  let len = 0;
  for (let i = 0; i < octetCount; i++) {
    len = (len << 8) | buf[offset + 1 + i];
  }
  return { length: len, headerLength: 1 + octetCount };
}

export const PKI_STATUS_TEXT: Record<number, string> = {
  0: 'granted',
  1: 'grantedWithMods',
  2: 'rejection',
  3: 'waiting',
  4: 'revocationWarning',
  5: 'revocationNotification'
};

export interface ValidateTimeStampRespOptions {
  expectedDigest?: Buffer;
  expectedNonce?: Buffer | bigint;
}

export interface ValidationResultRFC3161 {
  valid: boolean;
  status: number;
  statusText: string;
  error?: string;
  genTime?: string;
}

/**
 * Parse the RFC 3161 PKIStatusInfo integer code from TimeStampResp.
 * RFC 3161 §2.4.2:
 *   TimeStampResp ::= SEQUENCE {
 *      status            PKIStatusInfo,
 *      timeStampToken    TimeStampToken     OPTIONAL
 *   }
 *   PKIStatusInfo ::= SEQUENCE {
 *      status        PKIStatus,
 *      statusString  PKIFreeText     OPTIONAL,
 *      failInfo      PKIFailureInfo  OPTIONAL
 *   }
 */
export function parsePkiStatus(respBuffer: Buffer): { status: number; statusText: string } {
  if (!respBuffer || respBuffer.length < 5) {
    throw new Error('Response buffer too short for RFC 3161 TimeStampResp');
  }
  if (respBuffer[0] !== 0x30) {
    throw new Error(`Expected SEQUENCE tag (0x30) at start of TimeStampResp, got 0x${respBuffer[0].toString(16)}`);
  }
  const topLen = decodeDerLength(respBuffer, 1);
  const statusInfoOffset = 1 + topLen.headerLength;
  if (statusInfoOffset >= respBuffer.length || respBuffer[statusInfoOffset] !== 0x30) {
    throw new Error(`Expected PKIStatusInfo SEQUENCE (0x30) at offset ${statusInfoOffset}`);
  }
  const statusInfoLen = decodeDerLength(respBuffer, statusInfoOffset + 1);
  const statusIntOffset = statusInfoOffset + 1 + statusInfoLen.headerLength;
  if (statusIntOffset >= respBuffer.length || respBuffer[statusIntOffset] !== 0x02) {
    throw new Error(`Expected INTEGER tag (0x02) for PKIStatus at offset ${statusIntOffset}`);
  }
  const statusIntLen = decodeDerLength(respBuffer, statusIntOffset + 1);
  const valOffset = statusIntOffset + 1 + statusIntLen.headerLength;
  if (valOffset + statusIntLen.length > respBuffer.length) {
    throw new Error('Truncated PKIStatus integer value in DER buffer');
  }
  let status = 0;
  for (let i = 0; i < statusIntLen.length; i++) {
    status = (status << 8) | respBuffer[valOffset + i];
  }
  return {
    status,
    statusText: PKI_STATUS_TEXT[status] || `unknown_status_${status}`
  };
}

/**
 * In-band RFC 3161 TimeStampResp validator.
 * Enforces:
 * 1. PKIStatusInfo is granted (0) or grantedWithMods (1)
 * 2. TimeStampToken presence
 * 3. MessageImprint digest equality (asserts TSA stamped the exact requested file hash)
 * 4. Cryptographic nonce echo match (asserts replay attack protection)
 */
export function validateTimeStampResp(
  respBuffer: Buffer,
  options: ValidateTimeStampRespOptions = {}
): ValidationResultRFC3161 {
  try {
    const { status, statusText } = parsePkiStatus(respBuffer);
    if (status !== 0 && status !== 1) {
      return {
        valid: false,
        status,
        statusText,
        error: `RFC 3161 PKIStatus rejected: ${status} (${statusText})`
      };
    }

    const topLen = decodeDerLength(respBuffer, 1);
    const statusInfoOffset = 1 + topLen.headerLength;
    const statusInfoLen = decodeDerLength(respBuffer, statusInfoOffset + 1);
    const tokenOffset = statusInfoOffset + 1 + statusInfoLen.headerLength + statusInfoLen.length;

    if (tokenOffset >= respBuffer.length || respBuffer[tokenOffset] !== 0x30) {
      return {
        valid: false,
        status,
        statusText,
        error: 'Malformed RFC 3161 TimeStampResp: missing TimeStampToken SEQUENCE'
      };
    }

    const tokenBytes = respBuffer.slice(tokenOffset);

    // Assert expected messageImprint digest match
    if (options.expectedDigest) {
      if (options.expectedDigest.length !== 32) {
        throw new Error(`expectedDigest must be 32 bytes for SHA-256, received ${options.expectedDigest.length}`);
      }
      // ASN.1 OCTET STRING tag (0x04) + length (0x20) + 32-byte digest
      const digestNeedle = Buffer.concat([Buffer.from([0x04, 0x20]), options.expectedDigest]);
      if (!tokenBytes.includes(digestNeedle)) {
        return {
          valid: false,
          status,
          statusText,
          error: 'RFC 3161 assertion failed: TimeStampToken does not contain expected message imprint digest'
        };
      }
    }

    // Assert expected cryptographic nonce match (replay attack defense)
    if (options.expectedNonce !== undefined) {
      let nonceBuf: Buffer;
      if (Buffer.isBuffer(options.expectedNonce)) {
        nonceBuf = options.expectedNonce;
      } else {
        let hex = options.expectedNonce.toString(16);
        if (hex.length % 2 !== 0) hex = '0' + hex;
        nonceBuf = Buffer.from(hex, 'hex');
      }
      if (nonceBuf.length > 0 && (nonceBuf[0] & 0x80)) {
        nonceBuf = Buffer.concat([Buffer.from([0x00]), nonceBuf]);
      }
      const nonceNeedle = Buffer.concat([Buffer.from([0x02]), encodeDerLength(nonceBuf.length), nonceBuf]);
      if (!tokenBytes.includes(nonceNeedle)) {
        return {
          valid: false,
          status,
          statusText,
          error: 'RFC 3161 assertion failed: TimeStampToken nonce does not match request nonce'
        };
      }
    }

    const genTime = extractGenTime(respBuffer) || undefined;

    return {
      valid: true,
      status,
      statusText,
      genTime
    };
  } catch (err: any) {
    return {
      valid: false,
      status: -1,
      statusText: 'parse_error',
      error: err?.message || String(err)
    };
  }
}

/**
 * Build an RFC 3161 TimeStampReq ASN.1 DER structure.
 * RFC 3161 §2.4.1:
 *   TimeStampReq ::= SEQUENCE {
 *      version          INTEGER { v1(1) },
 *      messageImprint   MessageImprint,
 *      nonce            INTEGER OPTIONAL,
 *      certReq          BOOLEAN DEFAULT FALSE
 *   }
 */
export function buildTimeStampReq(sha256Digest: Buffer, options: { certReq?: boolean; nonce?: Buffer | bigint } = {}): Buffer {
  if (sha256Digest.length !== 32) {
    throw new Error(`TimeStampReq requires a 32-byte SHA-256 digest, received ${sha256Digest.length} bytes`);
  }

  const version = Buffer.from([0x02, 0x01, 0x01]); // INTEGER 1

  // AlgorithmIdentifier for SHA-256 (OID: 2.16.840.1.101.3.4.2.1) + NULL parameters
  const sha256Oid = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
  const nullParams = Buffer.from([0x05, 0x00]);
  const algId = encodeDerSequence([sha256Oid, nullParams]);

  // MessageImprint
  const octetDigest = Buffer.concat([Buffer.from([0x04, 0x20]), sha256Digest]);
  const messageImprint = encodeDerSequence([algId, octetDigest]);

  const elements = [version, messageImprint];

  // Nonce (comes before certReq in RFC 3161 §2.4.1)
  if (options.nonce !== undefined) {
    let nonceBuf: Buffer;
    if (Buffer.isBuffer(options.nonce)) {
      nonceBuf = options.nonce;
    } else {
      let hex = options.nonce.toString(16);
      if (hex.length % 2 !== 0) hex = '0' + hex;
      nonceBuf = Buffer.from(hex, 'hex');
    }
    // Ensure positive integer in DER (prepend 0x00 if highest bit is set)
    if (nonceBuf.length > 0 && (nonceBuf[0] & 0x80)) {
      nonceBuf = Buffer.concat([Buffer.from([0x00]), nonceBuf]);
    }
    elements.push(Buffer.concat([Buffer.from([0x02]), encodeDerLength(nonceBuf.length), nonceBuf]));
  }

  // certReq: true
  if (options.certReq !== false) {
    elements.push(Buffer.from([0x01, 0x01, 0xff]));
  }

  return encodeDerSequence(elements);
}

/**
 * Extract GeneralizedTime (tag 0x18) from ASN.1 DER TimeStampResp buffer.
 * Returns ISO 8601 formatted string or null if not found.
 */
export function extractGenTime(tsrBuffer: Buffer): string | null {
  for (let i = 0; i < tsrBuffer.length - 16; i++) {
    if (tsrBuffer[i] === 0x18) {
      const len = tsrBuffer[i + 1];
      if (len >= 13 && len <= 24 && i + 2 + len <= tsrBuffer.length) {
        const str = tsrBuffer.slice(i + 2, i + 2 + len).toString('ascii');
        // Matches YYYYMMDDHHMMSS...Z
        if (/^\d{14}/.test(str)) {
          const year = str.slice(0, 4);
          const month = str.slice(4, 6);
          const day = str.slice(6, 8);
          const hour = str.slice(8, 10);
          const min = str.slice(10, 12);
          const sec = str.slice(12, 14);
          return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
        }
      }
    }
  }
  return null;
}

/**
 * Execute HTTP POST query to an RFC 3161 TSA endpoint.
 */
export function queryTsa(tsaUrl: string, tsqBuffer: Buffer, timeoutMs = 5000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(tsaUrl);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/timestamp-query',
        'Accept': 'application/timestamp-reply',
        'Content-Length': tsqBuffer.length,
        'User-Agent': 'Moonglade-DTA/2.0'
      },
      timeout: timeoutMs
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`TSA HTTP ${res.statusCode}: ${body.toString('utf8').slice(0, 100)}`));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`TSA query to ${tsaUrl} timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.write(tsqBuffer);
    req.end();
  });
}

/**
 * Probe a single TSA server and return a structured telemetry record.
 * Automatically performs in-band RFC 3161 verification on successful responses:
 * - Checks PKIStatus is granted (0) or grantedWithMods (1)
 * - Verifies TimeStampToken exists
 * - Asserts messageImprint digest matches expectedDigest (if provided)
 * - Asserts returned nonce matches expectedNonce (if provided)
 */
export async function probeTsa(
  tsaUrl: string,
  tsqBuffer: Buffer,
  tier: 'L1_CRYPTO_PRIMARY' | 'L2_CRYPTO_FALLBACK',
  timeoutMs = 4000,
  expectedDigest?: Buffer,
  expectedNonce?: Buffer | bigint,
  circuitBreaker: EndpointCircuitBreaker = globalCircuitBreaker
): Promise<TSAProbeResult> {
  // Fast path: if circuit breaker has this endpoint in backoff, skip network query
  if (!circuitBreaker.isAvailable(tsaUrl)) {
    const health = circuitBreaker.getHealth(tsaUrl);
    const waitRemaining = Math.max(0, (health?.nextAvailableTime || 0) - Date.now());
    const status = circuitBreaker.getServerStatus(tsaUrl);
    return {
      tier,
      method: 'RFC3161',
      server: tsaUrl,
      status: 'ERROR',
      error: `Endpoint in ${status.toLowerCase()} (${Math.round(waitRemaining / 1000)}s remaining): ${health?.lastError || 'circuit breaker active'}`
    };
  }

  circuitBreaker.recordRequest(tsaUrl);

  try {
    const data = await queryTsa(tsaUrl, tsqBuffer, timeoutMs);
    if (data && data.length > 32) {
      const validation = validateTimeStampResp(data, { expectedDigest, expectedNonce });
      if (!validation.valid) {
        circuitBreaker.recordFailure(tsaUrl, validation.error || 'RFC 3161 response validation failed');
        return {
          tier,
          method: 'RFC3161',
          server: tsaUrl,
          status: 'ERROR',
          error: validation.error || 'RFC 3161 response validation failed'
        };
      }
      circuitBreaker.recordSuccess(tsaUrl);
      const genTime = validation.genTime || extractGenTime(data) || new Date().toISOString();
      return {
        tier,
        method: 'RFC3161',
        server: tsaUrl,
        status: 'SUCCESS',
        timestamp_iso: genTime,
        token_b64: data.toString('base64'),
        token_bytes: data
      };
    }
    circuitBreaker.recordFailure(tsaUrl, 'Empty or invalid response from TSA');
    return {
      tier,
      method: 'RFC3161',
      server: tsaUrl,
      status: 'ERROR',
      error: 'Empty or invalid response from TSA'
    };
  } catch (err: any) {
    const isTimeout = /timed? out/i.test(err?.message || '');
    circuitBreaker.recordFailure(tsaUrl, err?.message || String(err));
    return {
      tier,
      method: 'RFC3161',
      server: tsaUrl,
      status: isTimeout ? 'TIMEOUT' : 'ERROR',
      error: err?.message || String(err)
    };
  }
}

/**
 * Probe network time via HTTP Date header.
 */
export function probeNetworkTime(host: string, timeoutMs = 3000): Promise<TSAProbeResult> {
  return new Promise((resolve) => {
    const req = https.request(`https://${host}`, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Moonglade-DTA/2.0' },
      timeout: timeoutMs
    }, (res) => {
      const dateStr = res.headers['date'];
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          resolve({
            tier: 'L3_NETWORK_CONSENSUS',
            method: 'HTTP_DATE',
            server: host,
            status: 'SUCCESS',
            timestamp_iso: parsed.toISOString()
          });
          return;
        }
      }
      resolve({
        tier: 'L3_NETWORK_CONSENSUS',
        method: 'HTTP_DATE',
        server: host,
        status: 'ERROR',
        error: 'No valid Date header returned'
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({
        tier: 'L3_NETWORK_CONSENSUS',
        method: 'HTTP_DATE',
        server: host,
        status: 'TIMEOUT',
        error: `Network probe to ${host} timed out`
      });
    });
    req.on('error', (err) => {
      resolve({
        tier: 'L3_NETWORK_CONSENSUS',
        method: 'HTTP_DATE',
        server: host,
        status: 'ERROR',
        error: err.message
      });
    });
    req.end();
  });
}

/**
 * Execute Concurrent Multi-Source Degrading Timestamping Architecture (DTA) fan-out.
 * Default pattern: simultaneously seeks 1 probe from each tier (L1, L2, L3, L4).
 * If specifiedServer or specifiedTier is requested, executes targeted query instead.
 */
export async function concurrentDegradingTimestamp(
  sha256Digest: Buffer,
  options: DTAOptions = {}
): Promise<DTAResult> {
  const cb = options.circuitBreaker || globalCircuitBreaker;
  const timeoutMs = options.timeoutMs || 4000;
  const nonce = options.nonce || crypto.randomBytes(8);
  const tsq = buildTimeStampReq(sha256Digest, { certReq: options.certReq !== false, nonce });

  const hostProbe: TSAProbeResult = {
    tier: 'L4_HOST_UNAUTHENTICATED',
    method: 'KERNEL_UTC',
    server: 'localhost',
    status: 'SUCCESS',
    timestamp_iso: new Date().toISOString()
  };

  // Case 1: Specifically requested server
  if (options.specifiedServer) {
    const s = options.specifiedServer;
    if (s.startsWith('http://') || s.startsWith('https://')) {
      const tier: 'L1_CRYPTO_PRIMARY' | 'L2_CRYPTO_FALLBACK' =
        DEFAULT_FALLBACK_TSAS.includes(s) ? 'L2_CRYPTO_FALLBACK' : 'L1_CRYPTO_PRIMARY';
      const probe = await probeTsa(s, tsq, tier, timeoutMs, sha256Digest, nonce, cb);
      const allProbes = [probe, hostProbe];
      if (probe.status === 'SUCCESS') {
        return {
          tier,
          tsa: probe.server,
          tsa_time: probe.timestamp_iso || hostProbe.timestamp_iso!,
          token_b64: probe.token_b64,
          token_bytes: probe.token_bytes,
          probes: allProbes
        };
      }
      return {
        tier: 'L4_HOST_UNAUTHENTICATED',
        tsa: 'localhost',
        tsa_time: hostProbe.timestamp_iso!,
        probes: allProbes
      };
    } else {
      const probe = await probeNetworkTime(s, timeoutMs);
      const allProbes = [probe, hostProbe];
      if (probe.status === 'SUCCESS') {
        return {
          tier: 'L3_NETWORK_CONSENSUS',
          tsa: probe.server,
          tsa_time: probe.timestamp_iso || hostProbe.timestamp_iso!,
          probes: allProbes
        };
      }
      return {
        tier: 'L4_HOST_UNAUTHENTICATED',
        tsa: 'localhost',
        tsa_time: hostProbe.timestamp_iso!,
        probes: allProbes
      };
    }
  }

  // Case 2: Specifically requested tier
  if (options.specifiedTier === 'L4_HOST_UNAUTHENTICATED') {
    return {
      tier: 'L4_HOST_UNAUTHENTICATED',
      tsa: 'localhost',
      tsa_time: hostProbe.timestamp_iso!,
      probes: [hostProbe]
    };
  }

  const probesPerTier = options.probesPerTier ?? options.maxParallelProbes ?? 1;
  const rotate = options.rotate !== false; // Default: true fair rotation

  const primaryPool = options.primaryEndpoints || DEFAULT_PRIMARY_TSAS;
  const fallbackPool = options.fallbackEndpoints || DEFAULT_FALLBACK_TSAS;
  const networkHosts = options.networkEndpoints || DEFAULT_NETWORK_HOSTS;

  const probePromises: Promise<TSAProbeResult>[] = [];

  if (!options.specifiedTier || options.specifiedTier === 'L1_CRYPTO_PRIMARY') {
    const selectedPrimary = rotate
      ? cb.selectRotatingEndpoints(primaryPool, probesPerTier, 'L1_PRIMARY')
      : cb.selectEndpoints(primaryPool, probesPerTier);
    probePromises.push(...selectedPrimary.map(url => probeTsa(url, tsq, 'L1_CRYPTO_PRIMARY', timeoutMs, sha256Digest, nonce, cb)));
  }

  if (!options.specifiedTier || options.specifiedTier === 'L2_CRYPTO_FALLBACK') {
    const selectedFallback = rotate
      ? cb.selectRotatingEndpoints(fallbackPool, probesPerTier, 'L2_FALLBACK')
      : cb.selectEndpoints(fallbackPool, probesPerTier);
    probePromises.push(...selectedFallback.map(url => probeTsa(url, tsq, 'L2_CRYPTO_FALLBACK', timeoutMs, sha256Digest, nonce, cb)));
  }

  if (!options.specifiedTier || options.specifiedTier === 'L3_NETWORK_CONSENSUS') {
    const selectedNetwork = rotate
      ? cb.selectRotatingEndpoints(networkHosts, probesPerTier, 'L3_NETWORK')
      : cb.selectEndpoints(networkHosts, probesPerTier);
    probePromises.push(...selectedNetwork.map(host => probeNetworkTime(host, Math.min(timeoutMs, 3000))));
  }

  const results = await Promise.all(probePromises);
  const allProbes = [...results, hostProbe];

  // Selection precedence: L1_CRYPTO_PRIMARY > L2_CRYPTO_FALLBACK > L3_NETWORK_CONSENSUS > L4_HOST_UNAUTHENTICATED
  const successfulL1 = results.find(p => p.tier === 'L1_CRYPTO_PRIMARY' && p.status === 'SUCCESS');
  if (successfulL1) {
    return {
      tier: 'L1_CRYPTO_PRIMARY',
      tsa: successfulL1.server,
      tsa_time: successfulL1.timestamp_iso || hostProbe.timestamp_iso!,
      token_b64: successfulL1.token_b64,
      token_bytes: successfulL1.token_bytes,
      probes: allProbes
    };
  }

  const successfulL2 = results.find(p => p.tier === 'L2_CRYPTO_FALLBACK' && p.status === 'SUCCESS');
  if (successfulL2) {
    return {
      tier: 'L2_CRYPTO_FALLBACK',
      tsa: successfulL2.server,
      tsa_time: successfulL2.timestamp_iso || hostProbe.timestamp_iso!,
      token_b64: successfulL2.token_b64,
      token_bytes: successfulL2.token_bytes,
      probes: allProbes
    };
  }

  const successfulL3 = results.find(p => p.tier === 'L3_NETWORK_CONSENSUS' && p.status === 'SUCCESS');
  if (successfulL3) {
    return {
      tier: 'L3_NETWORK_CONSENSUS',
      tsa: successfulL3.server,
      tsa_time: successfulL3.timestamp_iso || hostProbe.timestamp_iso!,
      probes: allProbes
    };
  }

  return {
    tier: 'L4_HOST_UNAUTHENTICATED',
    tsa: 'localhost',
    tsa_time: hostProbe.timestamp_iso!,
    probes: allProbes
  };
}
