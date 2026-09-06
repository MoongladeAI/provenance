/**
 * Tests for @moonglade/provenance.
 *
 * These run against the COMPILED output in dist/, not src/. That is deliberate:
 * package.json declares `main: dist/index.js`, so dist is what a consumer
 * actually loads. Testing src would test something nobody imports, and the
 * repository has no ts-jest installed - adding a dependency at test time is a
 * worse trade than testing the artifact that ships.
 *
 * `npm test` builds first. If the build is stale the tests fail loudly rather
 * than passing against yesterday's code.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { ProvenanceEngine, ProvenanceVault } = require('../dist/index.js');

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const write = (name, content) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, content);
  return p;
};

// ---------------------------------------------------------------------------
// canonicalizeFile
// ---------------------------------------------------------------------------

describe('canonicalizeFile', () => {
  test('normalizes CRLF to LF', async () => {
    const p = write('crlf.md', 'alpha\r\nbeta\r\n');
    const out = await ProvenanceEngine.canonicalizeFile(p);
    expect(out.toString('utf8')).toBe('alpha\nbeta\n');
  });

  test('the same content is byte-identical regardless of line endings', async () => {
    const a = await ProvenanceEngine.canonicalizeFile(write('a.md', 'x\r\ny\r\nz'));
    const b = await ProvenanceEngine.canonicalizeFile(write('b.md', 'x\ny\nz'));
    expect(a.equals(b)).toBe(true);
  });

  test('leaves LF-only content untouched', async () => {
    const p = write('lf.md', 'one\ntwo\n');
    const out = await ProvenanceEngine.canonicalizeFile(p);
    expect(out.toString('utf8')).toBe('one\ntwo\n');
  });

  test('preserves a bare CR, which is not a line ending it claims to normalize', async () => {
    const p = write('cr.md', 'a\rb');
    const out = await ProvenanceEngine.canonicalizeFile(p);
    expect(out.toString('utf8')).toBe('a\rb');
  });

  test('strips UTF-8 byte order mark (BOM)', async () => {
    const pWithBom = write('bom.md', '\ufeffalpha\r\nbeta\r\n');
    const pWithoutBom = write('nobom.md', 'alpha\nbeta\n');
    const outBom = await ProvenanceEngine.canonicalizeFile(pWithBom);
    const outNoBom = await ProvenanceEngine.canonicalizeFile(pWithoutBom);
    expect(outBom.toString('utf8')).toBe('alpha\nbeta\n');
    expect(outBom.equals(outNoBom)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// keypair
// ---------------------------------------------------------------------------

describe('generateEd25519KeyPair', () => {
  test('returns a usable PEM keypair', () => {
    const { publicKey, privateKey } = ProvenanceEngine.generateEd25519KeyPair();
    expect(privateKey).toContain('BEGIN PRIVATE KEY');
    expect(publicKey).toContain('BEGIN PUBLIC KEY');
  });

  test('the keypair actually signs and verifies', () => {
    const { publicKey, privateKey } = ProvenanceEngine.generateEd25519KeyPair();
    const msg = Buffer.from('provenance');
    const sig = crypto.sign(null, msg, privateKey);
    expect(crypto.verify(null, msg, publicKey, sig)).toBe(true);
  });

  test('successive calls produce different keys', () => {
    const a = ProvenanceEngine.generateEd25519KeyPair();
    const b = ProvenanceEngine.generateEd25519KeyPair();
    expect(a.privateKey).not.toBe(b.privateKey);
  });
});

// ---------------------------------------------------------------------------
// seal / verify round trip
// ---------------------------------------------------------------------------

describe('sealDocument and verifyDocument', () => {
  let keys;
  beforeEach(() => { keys = ProvenanceEngine.generateEd25519KeyPair(); });

  test('sealing writes a sidecar next to the artifact', async () => {
    const p = write('doc.md', '# hello\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    expect(fs.existsSync(`${p}.provenance.json`)).toBe(true);
  });

  test('the recorded hash is the hash of the canonical bytes', async () => {
    const p = write('doc.md', 'line\r\n');
    const sidecar = await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    const expected = crypto.createHash('sha256').update(Buffer.from('line\n', 'utf8')).digest('hex');
    expect(sidecar.sha256_at_last_write).toBe(expected);
  });

  test('a freshly sealed document verifies', async () => {
    const p = write('doc.md', 'content\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    const r = await ProvenanceEngine.verifyDocument(p, keys.publicKey);
    expect(r.verified).toBe(true);
    expect(r.signer).toBe('tester@moonglade');
  });

  test('mutating the document breaks verification', async () => {
    const p = write('doc.md', 'original\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    fs.writeFileSync(p, 'tampered\n');
    const r = await ProvenanceEngine.verifyDocument(p, keys.publicKey);
    expect(r.verified).toBe(false);
    expect(r.error).toMatch(/mutated/i);
  });

  test('a single flipped byte is caught', async () => {
    const p = write('doc.md', 'aaaa\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    fs.writeFileSync(p, 'aaab\n');
    expect((await ProvenanceEngine.verifyDocument(p, keys.publicKey)).verified).toBe(false);
  });

  test('the wrong public key does not verify', async () => {
    const p = write('doc.md', 'content\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    const other = ProvenanceEngine.generateEd25519KeyPair();
    const r = await ProvenanceEngine.verifyDocument(p, other.publicKey);
    expect(r.verified).toBe(false);
  });

  test('a missing sidecar fails closed rather than throwing', async () => {
    const p = write('unsealed.md', 'nothing here\n');
    const r = await ProvenanceEngine.verifyDocument(p, keys.publicKey);
    expect(r.verified).toBe(false);
    expect(r.error).toBeDefined();
  });

  test('a corrupt sidecar fails closed rather than throwing', async () => {
    const p = write('doc.md', 'content\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    fs.writeFileSync(`${p}.provenance.json`, '{ not json');
    const r = await ProvenanceEngine.verifyDocument(p, keys.publicKey);
    expect(r.verified).toBe(false);
  });

  test('a forged signature with a matching hash is rejected', async () => {
    // The interesting attack: keep the document and its recorded hash intact,
    // and substitute a signature made by a different key. The hash check passes;
    // only the cryptography catches this.
    const p = write('doc.md', 'content\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    const sc = JSON.parse(fs.readFileSync(`${p}.provenance.json`, 'utf8'));
    const attacker = ProvenanceEngine.generateEd25519KeyPair();
    const canonical = await ProvenanceEngine.canonicalizeFile(p);
    sc.attestations[0].signature = crypto.sign(null, canonical, attacker.privateKey).toString('base64');
    fs.writeFileSync(`${p}.provenance.json`, JSON.stringify(sc));
    const r = await ProvenanceEngine.verifyDocument(p, keys.publicKey);
    expect(r.verified).toBe(false);
  });

  test('CRLF rewriting does not break a seal made on LF', async () => {
    // Canonicalization exists precisely so a git checkout on Windows does not
    // invalidate every signature in the repository.
    const p = write('doc.md', 'a\nb\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    fs.writeFileSync(p, 'a\r\nb\r\n');
    expect((await ProvenanceEngine.verifyDocument(p, keys.publicKey)).verified).toBe(true);
  });

  test('the sidecar records the declared standard and git commit', async () => {
    const p = write('doc.md', 'content\n');
    const sc = await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade', 'abc1234');
    expect(sc.standard).toMatch(/Moonglade Provenance Attestation Bundle/);
    expect(sc.attestations[0].git_commit).toBe('abc1234');
    // NOT ssh-ed25519: that name belongs to SSHSIG, which ssh-keygen -Y sign
    // produces and this package cannot read. See the comment in sealDocument.
    expect(sc.attestations[0].method).toBe('moonglade-ed25519-v2');
  });

  test('the signature is a bare ed25519 signature, not an SSHSIG blob', async () => {
    const p = write('doc.md', 'content\n');
    const sc = await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    const sig = sc.attestations[0].signature;
    expect(sig.startsWith('-----BEGIN SSH SIGNATURE')).toBe(false);
    expect(Buffer.from(sig, 'base64').length).toBe(64);
  });

  test('an SSHSIG attestation is reported as unverifiable, not silently ignored', async () => {
    // _sign.py emits real SSHSIG under the name ssh-ed25519. This package
    // cannot read that format, so it must say so rather than return a verdict.
    const p = write('doc.md', 'content\n');
    await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade');
    const f = `${p}.provenance.json`;
    const sc = JSON.parse(fs.readFileSync(f, 'utf8'));
    sc.attestations = [{ ...sc.attestations[0], method: 'ssh-ed25519' }];
    fs.writeFileSync(f, JSON.stringify(sc, null, 2));

    const r = await ProvenanceEngine.verifyDocument(p, keys.publicKey);
    expect(r.verified).toBe(false);
    expect(r.unknownMethods).toContain('ssh-ed25519');
    expect(r.error).toMatch(/ssh-keygen -Y verify/);
  });
});

// ---------------------------------------------------------------------------
// vault scan
// ---------------------------------------------------------------------------

describe('ProvenanceVault.scanAndAudit', () => {
  const seed = (dir) => {
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.md'), 'alpha');
    fs.writeFileSync(path.join(dir, 'sub', 'b.md'), 'beta');
  };

  test('counts every file, at any depth', async () => {
    seed(tmp);
    const { fileCount } = await new ProvenanceVault(tmp).scanAndAudit();
    expect(fileCount).toBe(2);
  });

  test('is deterministic across runs', async () => {
    seed(tmp);
    const v = new ProvenanceVault(tmp);
    const first = await v.scanAndAudit();
    const second = await v.scanAndAudit();
    expect(second.merkleRoot).toBe(first.merkleRoot);
  });

  test('any content change moves the root', async () => {
    seed(tmp);
    const before = (await new ProvenanceVault(tmp).scanAndAudit()).merkleRoot;
    fs.writeFileSync(path.join(tmp, 'a.md'), 'alpha!');
    const after = (await new ProvenanceVault(tmp).scanAndAudit()).merkleRoot;
    expect(after).not.toBe(before);
  });

  test('adding a file moves the root', async () => {
    seed(tmp);
    const before = (await new ProvenanceVault(tmp).scanAndAudit()).merkleRoot;
    fs.writeFileSync(path.join(tmp, 'c.md'), 'gamma');
    const after = (await new ProvenanceVault(tmp).scanAndAudit()).merkleRoot;
    expect(after).not.toBe(before);
  });

  test('the salt no longer affects the root, deliberately', async () => {
    // A salted root cannot be verified by a third party who does not know the
    // salt, which defeats the point of publishing one. RFC 6962 domain
    // separation supersedes it. The parameter is retained for API compatibility.
    seed(tmp);
    const a = (await new ProvenanceVault(tmp, 'salt-a').scanAndAudit()).merkleRoot;
    const b = (await new ProvenanceVault(tmp, 'salt-b').scanAndAudit()).merkleRoot;
    expect(a).toBe(b);
  });

  test('dotfiles and node_modules are skipped', async () => {
    seed(tmp);
    fs.mkdirSync(path.join(tmp, 'node_modules'));
    fs.writeFileSync(path.join(tmp, 'node_modules', 'x.js'), 'noise');
    fs.mkdirSync(path.join(tmp, '.git'));
    fs.writeFileSync(path.join(tmp, '.git', 'HEAD'), 'ref');
    const { fileCount } = await new ProvenanceVault(tmp).scanAndAudit();
    expect(fileCount).toBe(2);
  });

  test('the root is a sha256 hex digest', async () => {
    seed(tmp);
    const { merkleRoot } = await new ProvenanceVault(tmp).scanAndAudit();
    expect(merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// scope
// ---------------------------------------------------------------------------

describe('scopeFor', () => {
  test('uses the path relative to the vault root, not the basename', () => {
    const s = ProvenanceEngine.scopeFor(path.join(tmp, 'Projects', 'a', 'README.md'), tmp);
    expect(s).toBe('moonglade:vault:Projects/a/README.md');
  });

  test('two files sharing a basename get different scopes', () => {
    const a = ProvenanceEngine.scopeFor(path.join(tmp, 'Projects', 'a', 'README.md'), tmp);
    const b = ProvenanceEngine.scopeFor(path.join(tmp, 'Projects', 'b', 'README.md'), tmp);
    expect(a).not.toBe(b);
  });

  test('separators are POSIX regardless of platform', () => {
    // Without this a scope generated on Windows would not match one generated
    // on Linux for the same artifact, and signatures would not travel.
    const s = ProvenanceEngine.scopeFor(path.join(tmp, 'deep', 'nested', 'file.md'), tmp);
    // chr(92) is a backslash; writing one literally here keeps getting eaten in transit.
    expect(s.includes(String.fromCharCode(92))).toBe(false);
    expect(s).toBe('moonglade:vault:deep/nested/file.md');
  });

  test('an explicit scope overrides derivation', () => {
    const s = ProvenanceEngine.scopeFor(path.join(tmp, 'x.md'), tmp, 'Projects/Custom');
    expect(s).toBe('moonglade:vault:Projects/Custom');
  });

  test('a path outside the root falls back to basename rather than emitting ../', () => {
    const s = ProvenanceEngine.scopeFor(path.join(tmp, '..', 'outside.md'), path.join(tmp, 'inner'));
    expect(s).not.toContain('..');
    expect(s).toBe('moonglade:vault:outside.md');
  });

  test('sealDocument records the derived relative scope', async () => {
    const keys = ProvenanceEngine.generateEd25519KeyPair();
    fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true });
    const p = path.join(tmp, 'sub', 'doc.md');
    fs.writeFileSync(p, 'content\n');
    const sc = await ProvenanceEngine.sealDocument(p, keys.privateKey, 'tester@moonglade', 'abc', { vaultRoot: tmp });
    expect(sc.attestations[0].scope).toBe('moonglade:vault:sub/doc.md');
  });
});
