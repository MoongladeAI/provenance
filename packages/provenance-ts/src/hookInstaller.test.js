// Hook installer: never overwrite silently, enable only what was chosen, resolve hooks dir via git.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installHooks, resolveHooksDir, HOOK_MARKER, HookConflictError } = require('../dist/hookInstaller.js');

const cli = path.resolve(__dirname, '..', 'dist', 'artifact-cli.js');

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function tempRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prov-hooks-')));
  git(dir, 'init', '-q');
  return dir;
}
const rm = d => fs.rmSync(d, { recursive: true, force: true });
const only = (o = {}) => ({ preCommit: false, mcpVerifyRead: false, mcpAutoSeal: false, force: false, ...o });
const hookPath = dir => path.join(dir, '.git', 'hooks', 'pre-commit');

describe('hook installer', () => {
  it('fresh install writes our marked, executable hook and a manifest with only the chosen settings', async () => {
    const dir = tempRepo();
    try {
      const r = await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      assert.equal(r.hook.action, 'created');
      const body = fs.readFileSync(hookPath(dir), 'utf8');
      assert.ok(body.includes(HOOK_MARKER));
      if (process.platform !== 'win32') assert.ok(fs.statSync(hookPath(dir)).mode & 0o111);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.provenance-hooks.json'), 'utf8'));
      assert.deepEqual(manifest.hooks, { preCommit: true, mcpVerifyRead: false, mcpAutoSeal: false });
    } finally { rm(dir); }
  });

  it('no hidden settings: nothing selected installs no hook and enables nothing', async () => {
    const dir = tempRepo();
    try {
      const r = await installHooks({ cwd: dir, ...only() });
      assert.equal(r.hook, null);
      assert.equal(fs.existsSync(hookPath(dir)), false);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.provenance-hooks.json'), 'utf8'));
      assert.deepEqual(manifest.hooks, { preCommit: false, mcpVerifyRead: false, mcpAutoSeal: false });
    } finally { rm(dir); }
  });

  it('mcpAutoSeal is true only when selected', async () => {
    const dir = tempRepo();
    try {
      await installHooks({ cwd: dir, ...only({ mcpVerifyRead: true }) });
      let m = JSON.parse(fs.readFileSync(path.join(dir, '.provenance-hooks.json'), 'utf8'));
      assert.equal(m.hooks.mcpVerifyRead, true);
      assert.equal(m.hooks.mcpAutoSeal, false);
      await installHooks({ cwd: dir, ...only({ mcpAutoSeal: true }) });
      m = JSON.parse(fs.readFileSync(path.join(dir, '.provenance-hooks.json'), 'utf8'));
      assert.equal(m.hooks.mcpAutoSeal, true);
    } finally { rm(dir); }
  });

  it('refuses to overwrite a foreign hook and leaves it untouched', async () => {
    const dir = tempRepo();
    try {
      fs.writeFileSync(hookPath(dir), '#!/bin/sh\necho mine\n');
      await assert.rejects(installHooks({ cwd: dir, ...only({ preCommit: true }) }), HookConflictError);
      assert.equal(fs.readFileSync(hookPath(dir), 'utf8'), '#!/bin/sh\necho mine\n');
      assert.equal(fs.existsSync(path.join(dir, '.provenance-hooks.json')), false, 'no manifest written on refusal');
    } finally { rm(dir); }
  });

  it('--force backs up the foreign hook to <hook>.bak-<UTC timestamp> before replacing', async () => {
    const dir = tempRepo();
    try {
      fs.writeFileSync(hookPath(dir), '#!/bin/sh\necho mine\n');
      const r = await installHooks({ cwd: dir, ...only({ preCommit: true, force: true }) });
      assert.equal(r.hook.action, 'replaced');
      assert.match(path.basename(r.hook.backup), /^pre-commit\.bak-\d{8}T\d{6}Z/);
      assert.equal(fs.readFileSync(r.hook.backup, 'utf8'), '#!/bin/sh\necho mine\n');
      assert.ok(fs.readFileSync(hookPath(dir), 'utf8').includes(HOOK_MARKER));
    } finally { rm(dir); }
  });

  it('re-running with our own unmodified hook is a no-op without force and without a backup', async () => {
    const dir = tempRepo();
    try {
      await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      const before = fs.readFileSync(hookPath(dir), 'utf8');
      const r = await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      assert.equal(r.hook.action, 'unchanged');
      assert.equal(r.hook.backup, undefined);
      assert.equal(fs.readFileSync(hookPath(dir), 'utf8'), before);
      assert.deepEqual(fs.readdirSync(path.dirname(hookPath(dir))).filter(f => f.includes('.bak-')), []);
    } finally { rm(dir); }
  });

  it('works from a linked git worktree (hooks dir comes from git, not a .git directory)', async () => {
    const dir = tempRepo();
    const wt = path.join(os.tmpdir(), 'prov-hooks-wt-' + process.pid + '-' + Date.now());
    try {
      git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
      git(dir, 'worktree', 'add', '-q', wt, '-b', 'wt-branch');
      assert.ok(fs.statSync(path.join(wt, '.git')).isFile(), 'worktree .git is a file');
      const expected = path.join(fs.realpathSync(dir), '.git', 'hooks');
      assert.equal(path.normalize(fs.realpathSync(await resolveHooksDir(wt))), path.normalize(expected));
      const r = await installHooks({ cwd: wt, ...only({ preCommit: true }) });
      assert.equal(r.hook.action, 'created');
      assert.ok(fs.readFileSync(hookPath(dir), 'utf8').includes(HOOK_MARKER));
      assert.ok(fs.existsSync(path.join(wt, '.provenance-hooks.json')), 'manifest goes to the worktree top level');
    } finally { rm(wt); rm(dir); }
  });

  it('honours core.hooksPath', async () => {
    const dir = tempRepo();
    try {
      git(dir, 'config', 'core.hooksPath', '.custom-hooks');
      const r = await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      assert.equal(path.normalize(r.hook.path), path.join(dir, '.custom-hooks', 'pre-commit'));
    } finally { rm(dir); }
  });

  it('requesting a git hook outside a repository fails clearly', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-nogit-'));
    try {
      await assert.rejects(installHooks({ cwd: dir, ...only({ preCommit: true }) }), /git repository/);
    } finally { rm(dir); }
  });
});

describe('install-hooks CLI', () => {
  const run = (cwd, ...args) => spawnSync(process.execPath, [cli, 'install-hooks', ...args], { cwd, encoding: 'utf8', input: '' });

  it('--pre-commit installs non-interactively and exits 0', () => {
    const dir = tempRepo();
    try {
      const r = run(dir, '--pre-commit');
      assert.equal(r.status, 0, r.stderr);
      assert.ok(fs.readFileSync(hookPath(dir), 'utf8').includes(HOOK_MARKER));
    } finally { rm(dir); }
  });

  it('refuses a foreign hook with exit 1 and a message naming --force; --force succeeds', () => {
    const dir = tempRepo();
    try {
      fs.writeFileSync(hookPath(dir), '#!/bin/sh\necho mine\n');
      const bad = run(dir, '--pre-commit');
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /--force/);
      assert.equal(fs.readFileSync(hookPath(dir), 'utf8'), '#!/bin/sh\necho mine\n');
      const ok = run(dir, '--pre-commit', '--force');
      assert.equal(ok.status, 0, ok.stderr);
    } finally { rm(dir); }
  });

  it('with no choice flags and no terminal it exits 2 and changes nothing', () => {
    const dir = tempRepo();
    try {
      const r = run(dir);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /--pre-commit/);
      assert.equal(fs.existsSync(path.join(dir, '.provenance-hooks.json')), false);
    } finally { rm(dir); }
  });

  it('rejects unknown flags and the removed --pre-push', () => {
    const dir = tempRepo();
    try {
      assert.equal(run(dir, '--pre-push').status, 2);
      assert.equal(run(dir, '--bogus').status, 2);
    } finally { rm(dir); }
  });
});
