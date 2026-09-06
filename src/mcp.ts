#!/usr/bin/env node
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { ProvenanceEngine, ProvenanceVault } from './index';

/**
 * Native Model Context Protocol (MCP) Server for Epistemic Provenance Gate.
 * Zero external dependencies — communicates via stdio JSON-RPC 2.0.
 */

export const MCP_TOOLS = [
  {
    name: 'verify_artifact_provenance',
    description: "Verifies a document's Ed25519 signature against a caller-supplied public key. WITHOUT public_key_pem this performs a hash-only comparison against an editable sidecar and is NOT cryptographic verification. OpenPGP and RFC 3161 attestations are reported as present, never validated here.",
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute or relative path to target markdown or code artifact' },
        public_key_pem: { type: 'string', description: 'Optional SPKI PEM public key to verify Ed25519 claim against' },
        required_scope: { type: 'string', description: 'Optional. If given, the signed scope must equal it or verification fails.' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'audit_vault_merkle_root',
    description: 'Computes the current RFC 9162 SHA-256 Merkle root across visible workspace files. This is a snapshot, not a comparison: pass expected_root to detect drift. Without it, no drift, deletion or rollback can be detected. Hidden directories and node_modules are excluded and are therefore uncovered.',
    inputSchema: {
      type: 'object',
      properties: {
        vault_root: { type: 'string', description: 'Root directory of the workspace or vault' },
        expected_root: { type: 'string', description: 'Optional. A previously published root to compare against; without it no drift can be reported.' }
      },
      required: ['vault_root']
    }
  },
  {
    name: 'seal_canonical_epoch',
    description: 'Enforces Gate B sign-off: signs the artifact, requests an RFC 3161 DTA atomic timestamp, and emits an immutable attestation sidecar.',
    inputSchema: {
      type: 'object',
      properties: {
        artifact_path: { type: 'string', description: 'Path to target artifact' },
        private_key_pem: { type: 'string', description: 'Ed25519 PKCS8 PEM private key' },
        signer_identity: { type: 'string', description: 'Signer identity email or handle' },
        git_commit: { type: 'string', description: 'Current git commit SHA' }
      },
      required: ['artifact_path', 'private_key_pem', 'signer_identity']
    }
  },
  {
    name: 'assert_gate_status',
    description: 'Agentic execution barrier. Requires public_key_pem and a valid Ed25519 signature; fails closed without a key. A hash-only check is not enforcement, because anyone able to write the artifact can write its sidecar.',
    inputSchema: {
      type: 'object',
      properties: {
        gate_type: { type: 'string', enum: ['GATE_A_ARCHITECTURE', 'GATE_B_PR_MERGE'] },
        prerequisite_token_path: { type: 'string', description: 'Path to target artifact to evaluate' },
        public_key_pem: { type: 'string', description: 'REQUIRED. SPKI PEM public key the signature must verify against.' },
        required_scope: { type: 'string', description: 'Optional. If given, the signed scope must equal it.' }
      },
      required: ['gate_type', 'prerequisite_token_path', 'public_key_pem']
    }
  }
];

export async function handleMcpToolCall(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case 'verify_artifact_provenance': {
      const { file_path, public_key_pem, required_scope } = args;
      if (!existsSync(file_path)) {
        return `[ERROR] File not found: ${file_path}`;
      }
      const sidecarPath = `${file_path}.provenance.json`;
      if (!existsSync(sidecarPath)) {
        return `[UNATTESTED] No provenance sidecar found for ${path.basename(file_path)}`;
      }
      try {
        const sidecarRaw = await fs.readFile(sidecarPath, 'utf8');
        const sidecar = JSON.parse(sidecarRaw);
        
        // A supplied key is the only path that performs cryptographic verification.
        if (public_key_pem) {
          const res = await ProvenanceEngine.verifyDocument(file_path, public_key_pem);
          if (!res.verified) {
            return `[FAIL ❌] Verification failed for ${path.basename(file_path)}: ${res.error}`;
          }
          // A signed scope that is never compared is decoration. Enforce it when asked.
          if (required_scope && res.scope !== required_scope) {
            return `[FAIL ❌] Scope mismatch on ${path.basename(file_path)}: signed scope is "${res.scope}", required "${required_scope}".`;
          }
          return [
            `[VERIFIED ✅] [SIGNATURE_VALID] ${path.basename(file_path)}`,
            `  • Signer (as claimed in the signed payload): ${res.signer}`,
            `  • Scope:     ${res.scope ?? 'n/a'}`,
            `  • Timestamp: ${res.timestamp || 'none recorded'}${res.timestamp ? '  (NOT cryptographically validated - see FINDINGS.md #7)' : ''}`,
            `  • Note:      a valid signature proves key possession, not the identity or honesty of its holder.`
          ].join('\n');
        }

        // Structural and hash assertion
        const canonical = await ProvenanceEngine.canonicalizeFile(file_path);
        const crypto = await import('crypto');
        const currentHash = crypto.createHash('sha256').update(canonical).digest('hex');
        
        if (currentHash !== sidecar.sha256_at_last_write) {
          return `[FAIL ❌] Hash mismatch on ${path.basename(file_path)}. Recorded: ${sidecar.sha256_at_last_write.slice(0, 16)}.., Computed: ${currentHash.slice(0, 16)}..`;
        }

        const rfcAtt = sidecar.attestations?.find((a: any) => a.method === 'rfc3161');
        const edAtt = sidecar.attestations?.find((a: any) => /ed25519/.test(a.method));
        const pgpAtt = sidecar.attestations?.find((a: any) => a.method === 'openpgp');

        // No key was supplied, so NOTHING here has been cryptographically verified.
        // Identity must never be inferred from an unsigned string, and absent evidence
        // must never be rendered as a default assurance tier.
        return [
          `[UNVERIFIED - HASH ONLY] ${path.basename(file_path)}`,
          `  The bytes match the hash recorded in the sidecar. That is all this check establishes.`,
          `  No signature was verified. Anyone able to write this file can write its sidecar,`,
          `  so this result does not resist a filesystem writer. Supply public_key_pem for`,
          `  cryptographic verification.`,
          ``,
          `  • SHA-256 matches recorded: ${currentHash}`,
          `  • Signature attestations present (unverified): ${[edAtt && 'ed25519', pgpAtt && 'openpgp'].filter(Boolean).join(', ') || 'none'}`,
          `  • Claimed signer (unverified, attacker-controllable): ${pgpAtt?.signer || edAtt?.signer || 'none recorded'}`,
          `  • Timestamp attestation: ${rfcAtt ? `${rfcAtt.tier ?? 'tier not recorded'} via ${rfcAtt.tsa ?? 'TSA not recorded'} at ${rfcAtt.tsa_time ?? 'time not recorded'} (unvalidated)` : 'none recorded'}`
        ].join('\n');
      } catch (err: any) {
        return `[ERROR] Verification error: ${err.message}`;
      }
    }

    case 'audit_vault_merkle_root': {
      const { vault_root, expected_root } = args;
      if (!existsSync(vault_root)) {
        return `[ERROR] Vault root directory not found: ${vault_root}`;
      }
      try {
        const vault = new ProvenanceVault(vault_root);
        const { merkleRoot, algorithm, fileCount } = await vault.scanAndAudit();
        // "PRISTINE" was previously hardcoded, so a deleted file still reported clean.
        // A snapshot cannot report drift; only a comparison can.
        const status = expected_root
          ? (merkleRoot === expected_root
              ? 'MATCHES the supplied expected root'
              : `DIFFERS from the supplied expected root (${expected_root.slice(0, 16)}..) - content added, changed, or DELETED`)
          : 'NOT COMPARED - no expected_root supplied, so drift, deletion and rollback are undetectable here';
        return [
          `[MERKLE SNAPSHOT]`,
          `  • Root:      ${merkleRoot}`,
          `  • Algorithm: ${algorithm}`,
          `  • Files:     ${fileCount}  (hidden directories and node_modules are excluded and uncovered)`,
          `  • Status:    ${status}`
        ].join('\n');
      } catch (err: any) {
        return `[ERROR] Merkle audit failed: ${err.message}`;
      }
    }

    case 'seal_canonical_epoch': {
      const { artifact_path, private_key_pem, signer_identity, git_commit } = args;
      if (!existsSync(artifact_path)) {
        return `[ERROR] Artifact not found: ${artifact_path}`;
      }
      try {
        const sidecar = await ProvenanceEngine.sealDocument(
          artifact_path,
          private_key_pem,
          signer_identity,
          git_commit || 'HEAD',
          { timestamp: true }
        );
        const rfcAtt = sidecar.attestations.find(a => a.method === 'rfc3161');
        return `[SEALED & ATTESTED ✅] ${path.basename(artifact_path)}\n  • SHA-256:   ${sidecar.sha256_at_last_write}\n  • Timestamp: ${rfcAtt?.tsa_time || 'N/A'} (${rfcAtt?.tier || 'L1_CRYPTO_PRIMARY'})\n  • Sidecar:   ${artifact_path}.provenance.json`;
      } catch (err: any) {
        return `[ERROR] Sealing failed: ${err.message}`;
      }
    }

    case 'assert_gate_status': {
      const { gate_type, prerequisite_token_path, public_key_pem, required_scope } = args;
      if (!prerequisite_token_path) {
        return `[BLOCKED 🛑] ${gate_type} requires a target artifact path to evaluate.`;
      }
      if (!existsSync(prerequisite_token_path)) {
        return `[BLOCKED 🛑] ${gate_type} prerequisite artifact not found: ${prerequisite_token_path}`;
      }
      const sidecarPath = `${prerequisite_token_path}.provenance.json`;
      if (!existsSync(sidecarPath)) {
        return `[BLOCKED 🛑] ${gate_type} requires valid provenance token at ${path.basename(sidecarPath)}, but none exists.`;
      }
      // Fail closed. A hash-only gate is not a gate: the writer who tampers with the
      // artifact can write the sidecar hash too, and needs no key to do it.
      if (!public_key_pem) {
        return `[BLOCKED 🛑] ${gate_type} requires public_key_pem. A hash comparison against an editable sidecar is not cryptographic enforcement and will not clear this gate.`;
      }
      try {
        const res = await ProvenanceEngine.verifyDocument(prerequisite_token_path, public_key_pem);
        if (!res.verified) {
          return `[BLOCKED 🛑] ${gate_type} failed: signature did not verify for ${path.basename(prerequisite_token_path)}: ${res.error}`;
        }
        if (required_scope && res.scope !== required_scope) {
          return `[BLOCKED 🛑] ${gate_type} failed: signed scope "${res.scope}" does not match required "${required_scope}".`;
        }
        return `[PASSED 🟢] ${gate_type} cleared. ${path.basename(prerequisite_token_path)} carries a valid Ed25519 signature under the supplied key${required_scope ? ' at the required scope' : ''}. This authenticates key possession, not identity or authorization.`;
      } catch (err: any) {
        return `[BLOCKED 🛑] ${gate_type} evaluation error: ${err.message}`;
      }
    }

    default:
      return `[ERROR] Unknown tool: ${name}`;
  }
}

/**
 * Starts the stdio JSON-RPC 2.0 MCP server loop.
 */
export function startMcpServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
      const req = JSON.parse(line);
      const { id, method, params } = req;

      if (method === 'initialize') {
        const resp = {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'provenance-gate', version: '2.0.0' }
          }
        };
        process.stdout.write(JSON.stringify(resp) + '\n');
        return;
      }

      if (method === 'notifications/initialized' || method === 'ping') {
        if (id !== undefined) {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result: {} }) + '\n');
        }
        return;
      }

      if (method === 'tools/list') {
        const resp = {
          jsonrpc: '2.0',
          id,
          result: { tools: MCP_TOOLS }
        };
        process.stdout.write(JSON.stringify(resp) + '\n');
        return;
      }

      if (method === 'tools/call') {
        const { name, arguments: toolArgs } = params || {};
        const outputText = await handleMcpToolCall(name, toolArgs || {});
        const resp = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: outputText }]
          }
        };
        process.stdout.write(JSON.stringify(resp) + '\n');
        return;
      }

      if (id !== undefined) {
        const resp = {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method ${method} not found` }
        };
        process.stdout.write(JSON.stringify(resp) + '\n');
      }
    } catch (err: any) {
      const errResp = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `Parse error: ${err.message}` }
      };
      process.stdout.write(JSON.stringify(errResp) + '\n');
    }
  });
}

// Auto-run if executed directly
if (require.main === module) {
  startMcpServer();
}
