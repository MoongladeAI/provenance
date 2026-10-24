// 2.6.1: the self-test is a public entry point (package export and CLI with no file argument).
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const pkgRoot = path.resolve(__dirname, '..');
const cli = path.join(pkgRoot, 'dist', 'artifact-cli.js');

describe('self-test export and CLI', () => {
  it('exports ./self-test with types, require and default targets', () => {
    const e = pkg.exports['./self-test'];
    assert.ok(e, 'exports["./self-test"] missing');
    assert.equal(e.types, './dist/self-test.d.ts');
    assert.equal(e.require, './dist/self-test.js');
    assert.equal(e.default, './dist/self-test.js');
    for (const t of [e.types, e.require]) assert.ok(fs.existsSync(path.join(pkgRoot, t)), t);
  });

  it('`provenance test` with no file runs the self-test and exits 0', () => {
    const r = spawnSync(process.execPath, [cli, 'test'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Self-Test Suite v/);
    assert.match(r.stdout, /condition suites PASSED/);
    assert.ok(r.stdout.includes(`v${pkg.version}`));
  });

  it('`provenance test --json` prints a parseable passing report', () => {
    const r = spawnSync(process.execPath, [cli, 'test', '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.passed, true);
    assert.equal(report.version, pkg.version);
  });

  it('`provenance test` exits non-zero when a condition fails', () => {
    // A bogus package-root sidecar makes condition 6 fail; node_modules resolves by walking up from the temp dir.
    const tmp = fs.mkdtempSync(path.join(pkgRoot, '.tmp-cli-fail-'));
    try {
      fs.cpSync(path.join(pkgRoot, 'dist'), path.join(tmp, 'dist'), { recursive: true });
      fs.copyFileSync(path.join(pkgRoot, 'package.json'), path.join(tmp, 'package.json'));
      fs.writeFileSync(path.join(tmp, 'ghost.md.provenance.json'), JSON.stringify({ sha256_at_last_write: 'a'.repeat(64) }));
      const r = spawnSync(process.execPath, [path.join(tmp, 'dist', 'artifact-cli.js'), 'test'], { encoding: 'utf8' });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr + r.stdout, /FAILED/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
