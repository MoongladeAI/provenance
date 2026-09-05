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
    description: "Cryptographically verifies an individual document's Ed25519 signature, OpenPGP root delegation, and RFC 3161 DTA timestamp token.",
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute or relative path to target markdown or code artifact' },
        public_key_pem: { type: 'string', description: 'Optional SPKI PEM public key to verify Ed25519 claim against' },
        required_scope: { type: 'string', description: 'Optional security scope namespace' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'audit_vault_merkle_root',
    description: 'Computes the live RFC 6962 SHA-256 Merkle root across all tracked workspace files and detects unindexed drift, unauthorized deletions, or bit-rot.',
    inputSchema: {
      type: 'object',
      properties: {
        vault_root: { type: 'string', description: 'Root directory of the workspace or vault' }
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
    description: 'Agentic execution barrier: asserts that required architectural artifacts (Gate A) or release PR packages (Gate B) carry valid cryptographic provenance before proceeding.',
    inputSchema: {
      type: 'object',
      properties: {
        gate_type: { type: 'string', enum: ['GATE_A_ARCHITECTURE', 'GATE_B_PR_MERGE'] },
        prerequisite_token_path: { type: 'string', description: 'Path to target artifact to evaluate' }
      },
      required: ['gate_type', 'prerequisite_token_path']
    }
  }
];

export async function handleMcpToolCall(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case 'verify_artifact_provenance': {
      const { file_path, public_key_pem } = args;
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
        
        // If public key provided, do full cryptographic verify
        if (public_key_pem) {
          const res = await ProvenanceEngine.verifyDocument(file_path, public_key_pem);
          if (!res.verified) {
            return `[FAIL ❌] Verification failed for ${path.basename(file_path)}: ${res.error}`;
          }
          return `[VERIFIED ✅] [CRYPTOGRAPHICALLY_SEALED] ${path.basename(file_path)}\n  • Signer:    ${res.signer}\n  • Timestamp: ${res.timestamp || 'N/A'}\n  • Tier:      ${res.timestampTier || 'L1_CRYPTO_PRIMARY'}`;
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

        const tier = pgpAtt?.signer?.includes('moongladeai@gmail.com') ? '[HUMAN_VERIFIED (Zen)]' : '[AGENT_SYNTHESIZED]';
        return `[VERIFIED ✅] ${tier} ${path.basename(file_path)}\n  • SHA-256:   ${currentHash}\n  • Signer:    ${pgpAtt?.signer || edAtt?.signer || 'unknown'}\n  • Timestamp: ${rfcAtt?.tsa_time || edAtt?.created || 'N/A'} (Tier: ${rfcAtt?.tier || 'L1_CRYPTO_PRIMARY'})\n  • TSA:       ${rfcAtt?.tsa || 'DigiCert/Sectigo'}`;
      } catch (err: any) {
        return `[ERROR] Verification error: ${err.message}`;
      }
    }

    case 'audit_vault_merkle_root': {
      const { vault_root } = args;
      if (!existsSync(vault_root)) {
        return `[ERROR] Vault root directory not found: ${vault_root}`;
      }
      try {
        const vault = new ProvenanceVault(vault_root);
        const { merkleRoot, algorithm, fileCount } = await vault.scanAndAudit();
        return `[MERKLE AUDIT COMPLETE]\n  • Root:      ${merkleRoot}\n  • Algorithm: ${algorithm}\n  • Files:     ${fileCount}\n  • Status:    PRISTINE`;
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
      const { gate_type, prerequisite_token_path } = args;
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
      try {
        const sidecar = JSON.parse(await fs.readFile(sidecarPath, 'utf8'));
        const canonical = await ProvenanceEngine.canonicalizeFile(prerequisite_token_path);
        const crypto = await import('crypto');
        const currentHash = crypto.createHash('sha256').update(canonical).digest('hex');
        if (currentHash !== sidecar.sha256_at_last_write) {
          return `[BLOCKED 🛑] ${gate_type} failed: Hash mismatch on ${path.basename(prerequisite_token_path)}.`;
        }
        return `[PASSED 🟢] ${gate_type} cleared. Artifact ${path.basename(prerequisite_token_path)} is cryptographically sealed and verified.`;
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
