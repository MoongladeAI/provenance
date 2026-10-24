/* tslint:disable */
/* eslint-disable */

/**
 * Claims JSON per draft -03 section 3.3: safe-integer numbers (judged by value) and UTF-16 key order.
 */
export function canonicalize_claims_json(json: string): string;

/**
 * Canonicalize a JSON string according to RFC-8785 (JCS).
 */
export function canonicalize_json(json_str: string): string;

/**
 * Strict provenance-ts text/binary canonicalization, distinct from frozen legacy profiles.
 */
export function canonicalize_provenance(filename: string, bytes: Uint8Array): Uint8Array;

/**
 * Returns the engine version and cryptographic capabilities.
 */
export function engine_info(): string;

export function provenance_inclusion_proof(artifacts_json: string, target: string): string;

export function provenance_merkle_root(artifacts_json: string): string;

/**
 * Compute SHA-256 digest over arbitrary binary bytes, returning lowercase hex.
 */
export function sha256_digest(bytes: Uint8Array): string;

/**
 * Verify a full Moonglade sidecar attestation against a live payload hash and known signers registry.
 *
 * Returns a JSON string of the complete `Verdict`.
 */
export function verify_attestation(current_hash: string, sidecar_json: string, known_signers_json: string): string;

/**
 * Verify a raw Ed25519 signature over a message using hex-encoded public key and signature.
 */
export function verify_ed25519_hex(message: Uint8Array, signature_hex: string, public_key_hex: string): boolean;

/**
 * Verify a Merkle inclusion proof for a leaf against a root digest.
 *
 * Siblings must be passed as an ordered array of 32-byte hex hashes with a direction flag
 * (e.g. `[{"hash": "...", "is_left": true}]`).
 */
export function verify_merkle_proof(leaf_hash_hex: string, root_hash_hex: string, proof_siblings_json: string): boolean;

export function verify_provenance_merkle_proof(proof_json: string, expected_root: string): boolean;
