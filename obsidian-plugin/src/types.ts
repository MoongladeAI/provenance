export enum EpistemicTier {
  TIER_1_HUMAN_SOVEREIGN = 'TIER_1_HUMAN_SOVEREIGN',
  TIER_2_AGENT_ATTESTED = 'TIER_2_AGENT_ATTESTED',
  TIER_DUAL_RATIFIED = 'TIER_DUAL_RATIFIED',
  TIER_3_WORKING_DRAFT = 'TIER_3_WORKING_DRAFT',
  TIER_BREACH = 'TIER_BREACH'
}

export interface Attestation {
  method: string;
  signature?: string;
  signer?: string;
  scope?: string;
  sha256?: string;
  tier?: string;
  unattended?: boolean;
  tsa?: string;
  tsa_time?: string;
  token_b64?: string;
  der_base64?: string;
  genTime?: string;
  accuracy?: string;
  source?: string;
  timestamp?: string;
  created?: string;
  probes?: Array<{
    tier?: string;
    method?: string;
    server?: string;
    status?: string;
    timestamp_iso?: string;
    error?: string;
  }>;
}

/**
 * Verification outcome vocabulary.
 *
 * A verifier answers two independent questions: whether a check holds, and whether
 * it could be evaluated at all. Collapsing both into a boolean reports an unreadable
 * keyring, an unreachable TSA and a forged signature identically - which is how an
 * environment fault gets read as an attack. INDETERMINATE is the state that says
 * "I did not look", and it is never red.
 *
 * Mirrors Section 7 of draft-ottley-agentic-epistemic-provenance-00.
 */
export type Outcome = 'VALID' | 'INVALID' | 'INDETERMINATE' | 'UNSUPPORTED';

export interface CheckResult {
  outcome: Outcome;
  /** Required for INDETERMINATE and UNSUPPORTED: why the check could not be made. */
  reason?: string;
}

export interface SignerDetail {
  identity: string;
  method: string;
  /** The thing that was actually checked. An identity without a key id is a claim. */
  fingerprint?: string;
  role?: string;
  /** True when the key signs without a human in the loop - the Tier 1/Tier 2 distinction. */
  unattended?: boolean;
  expires?: string;
  /** Whether the key was inside its stated validity window when it signed, not now. */
  validAtSigning?: CheckResult;
}

export interface ProvenanceSidecar {
  standard: string;
  sha256_at_last_write: string;
  scope?: string;
  signer?: string;
  updated?: string;
  attestations: Attestation[];
}

export interface TimeVector {
  tier: string;
  method: string;
  source: string;
  timestamp: string;
  status: string;
  isHighest: boolean;
  securityLevel: string;
  fallbackFrom?: string;
  fallbackReason?: string;
}

export interface VerificationResult {
  tier: EpistemicTier;
  verified: boolean;
  statusLabel: string;
  statusEmoji: string;
  statusColor: string;
  filePath: string;
  currentHash: string;
  sealedHash?: string;
  signers: string[];
  roles: string[];
  highestTimeVector?: TimeVector;
  allTimeVectors: TimeVector[];
  error?: string;

  // ---- Detail surfaced by the inspector. All optional: the early-return paths
  // ---- (no sidecar, unreadable sidecar) legitimately cannot populate them.

  /** Attestation bundle version. v1 bundles are refused; the panel should say which. */
  payloadVersion?: string;
  attestationCount?: number;
  signerDetails?: SignerDetail[];

  /** The scope the signature covers, and the scope this file's location implies. */
  scope?: string;
  expectedScope?: string;

  sidecarPath?: string;
  sidecarPresent?: boolean;

  /** Whether the signer registry is itself signed by the root key. */
  registryAttested?: CheckResult;
  trustAnchorPath?: string;

  /** Structural validation is not signature verification. See FINDINGS.md #8. */
  tokenVerification?: CheckResult;

  /** No revocation mechanism exists yet. Stated, because silence reads as "fine". */
  revocation?: CheckResult;
}

export interface RegisteredVault {
  vaultId: string;
  vaultName: string;
  vaultPath: string;
  isCanonicalRoot: boolean;
}

export interface ProvenanceSettings {
  canonicalTrustRegistry: string;
  registeredVaults: RegisteredVault[];
  enableGutterDiff: boolean;
  enableAutoVerify: boolean;
  defaultAgentIdentity: string;
}

export const DEFAULT_SETTINGS: ProvenanceSettings = {
  canonicalTrustRegistry: '',
  registeredVaults: [],
  enableGutterDiff: true,
  enableAutoVerify: true,
  defaultAgentIdentity: 'moongladeai+agy@gmail.com'
};
