/**
 * Unit tests for native stdio MCP server tools.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { handleMcpToolCall, MCP_TOOLS } = require('../dist/mcp.js');
const { ProvenanceEngine } = require('../dist/index.js');

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const write = (name, content) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, content);
  return p;
};

describe('MCP Tools Schema Definition', () => {
  test('exports 4 standard MCP tools', () => {
    expect(MCP_TOOLS.length).toBe(4);
    const names = MCP_TOOLS.map(t => t.name);
    expect(names).toContain('verify_artifact_provenance');
    expect(names).toContain('audit_vault_merkle_root');
    expect(names).toContain('seal_canonical_epoch');
    expect(names).toContain('assert_gate_status');
  });
});

describe('handleMcpToolCall Execution', () => {
  test('verify_artifact_provenance detects unsealed artifacts', async () => {
    const file = write('unsealed.md', '# Unsealed');
    const out = await handleMcpToolCall('verify_artifact_provenance', { file_path: file });
    expect(out).toContain('[UNATTESTED]');
  });

  test('assert_gate_status blocks on missing prerequisite', async () => {
    const out = await handleMcpToolCall('assert_gate_status', {
      gate_type: 'GATE_A_ARCHITECTURE',
      prerequisite_token_path: path.join(tmp, 'nonexistent.md')
    });
    expect(out).toContain('[BLOCKED 🛑]');
  });

  test('assert_gate_status clears on sealed artifact', async () => {
    const file = write('canonical.md', '# Architecture SAD\nCanonical ground truth.\n');
    const { privateKey } = ProvenanceEngine.generateEd25519KeyPair();
    await ProvenanceEngine.sealDocument(file, privateKey, 'architect@moongladeai', 'abc1234', {
      vaultRoot: tmp,
      timestamp: false
    });

    const out = await handleMcpToolCall('assert_gate_status', {
      gate_type: 'GATE_A_ARCHITECTURE',
      prerequisite_token_path: file
    });
    expect(out).toContain('[PASSED 🟢]');
  });

  test('audit_vault_merkle_root computes root over workspace', async () => {
    write('a.md', 'alpha');
    write('b.md', 'beta');
    const out = await handleMcpToolCall('audit_vault_merkle_root', { vault_root: tmp });
    expect(out).toContain('[MERKLE AUDIT COMPLETE]');
    expect(out).toContain('Root:');
  });
});
