// B1 regression guard: a sealed binary artifact must fail verification after any single-byte mutation.
// Uses the same ProvenanceEngine.sealDocument / verifyDocument path as the library and the CLI `verify` command.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ProvenanceEngine } = require('../dist/index.js');

function fixture(kind) {
  // Deterministic pseudo-random bytes so failures reproduce.
  const rnd = (n, seed) => {
    const out = Buffer.alloc(n);
    let h = crypto.createHash('sha256').update(seed).digest();
    for (let i = 0; i < n; i += 32) {
      h.copy(out, i, 0, Math.min(32, n - i));
      h = crypto.createHash('sha256').update(h).digest();
    }
    return out;
  };
  const body = rnd(4096, kind);
  body[10] = 0x00; // guaranteed NUL byte
  if (kind === 'png') return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), body]);
  if (kind === 'onnx') return Buffer.concat([Buffer.from([0x08, 0x08, 0x12, 0x00]), body]);
  return body; // 'blob': unknown extension, NUL in first 1024 bytes
}

const cases = [['png', 'model.png'], ['onnx', 'net.onnx'], ['blob', 'payload.dat']];

describe('B1 regression: binary artifacts are byte exact', () => {
  for (const [kind, name] of cases) {
    it(`${name}: seal verifies, one-byte mutation fails`, async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prov-b1-'));
      try {
        const file = path.join(dir, name);
        const original = fixture(kind);
        await fs.writeFile(file, original);
        const kp = ProvenanceEngine.generateEd25519KeyPair();
        await ProvenanceEngine.sealDocument(file, kp.privateKey, 'b1@test', 'head', { vaultRoot: dir, timestamp: false });
        const opts = { expectedScope: ProvenanceEngine.scopeFor(file, dir) };
        const ok = await ProvenanceEngine.verifyDocument(file, kp.publicKey, opts);
        assert.equal(ok.verified, true, ok.error);

        const mutated = Buffer.from(original);
        mutated[mutated.length - 1] ^= 0x01;
        await fs.writeFile(file, mutated);
        const bad = await ProvenanceEngine.verifyDocument(file, kp.publicKey, opts);
        assert.equal(bad.verified, false);
        assert.match(bad.error ?? '', /Hash mismatch/);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  }

  it('CRLF to LF rewrite inside a binary file is detected (no text normalization)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prov-b1-'));
    try {
      const file = path.join(dir, 'crlf.png');
      const original = Buffer.concat([Buffer.from([0x89, 0x50, 0x00, 0x0d, 0x0a, 0x41]), Buffer.alloc(64, 7)]);
      await fs.writeFile(file, original);
      const kp = ProvenanceEngine.generateEd25519KeyPair();
      await ProvenanceEngine.sealDocument(file, kp.privateKey, 'b1@test', 'head', { vaultRoot: dir, timestamp: false });
      await fs.writeFile(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x00, 0x0a, 0x41]), Buffer.alloc(64, 7)]));
      const bad = await ProvenanceEngine.verifyDocument(file, kp.publicKey, { expectedScope: ProvenanceEngine.scopeFor(file, dir) });
      assert.equal(bad.verified, false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
