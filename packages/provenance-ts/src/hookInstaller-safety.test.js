// Hook installer safety: F1 (no silent overwrite of modified or look-alike hooks, manifest backup and merge)
// and F2 (the pre-commit gate must not skip file names with spaces or non-ASCII characters).
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installHooks, installGitHook, HOOK_MARKER, HookConflictError, PRE_COMMIT_SCRIPT } = require('../dist/hookInstaller.js');

const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false'];
function git(cwd, args, env) {
  return spawnSync('git', [...GIT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}
function tempRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prov-hooks2-')));
  assert.equal(git(dir, ['init', '-q']).status, 0);
  return dir;
}
const rm = d => fs.rmSync(d, { recursive: true, force: true });
const only = (o = {}) => ({ preCommit: false, mcpVerifyRead: false, mcpAutoSeal: false, force: false, ...o });
const hookPath = dir => path.join(dir, '.git', 'hooks', 'pre-commit');
const manifestPath = dir => path.join(dir, '.provenance-hooks.json');
const baks = (dir, prefix) => fs.readdirSync(dir).filter(f => f.startsWith(prefix + '.bak-'));

describe('F1: never overwrite a hook or manifest that is not byte-for-byte ours', () => {
  it('F1: our hook with a user-appended line is refused and left untouched', async () => {
    const dir = tempRepo();
    try {
      await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      fs.appendFileSync(hookPath(dir), 'echo MY-CUSTOM-LINE\n');
      const edited = fs.readFileSync(hookPath(dir), 'utf8');
      await assert.rejects(installHooks({ cwd: dir, ...only({ preCommit: true }) }), HookConflictError);
      assert.equal(fs.readFileSync(hookPath(dir), 'utf8'), edited);
      assert.deepEqual(baks(path.dirname(hookPath(dir)), 'pre-commit'), []);
    } finally { rm(dir); }
  });

  it('F1: our hook with a user-appended line is backed up by --force', async () => {
    const dir = tempRepo();
    try {
      await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      fs.appendFileSync(hookPath(dir), 'echo MY-CUSTOM-LINE\n');
      const edited = fs.readFileSync(hookPath(dir), 'utf8');
      const r = await installHooks({ cwd: dir, ...only({ preCommit: true, force: true }) });
      assert.equal(r.hook.action, 'replaced');
      assert.equal(fs.readFileSync(r.hook.backup, 'utf8'), edited);
      assert.equal(fs.readFileSync(hookPath(dir), 'utf8'), PRE_COMMIT_SCRIPT);
    } finally { rm(dir); }
  });

  it('F1: a foreign hook that only mentions the marker in a comment is refused and untouched', async () => {
    const dir = tempRepo();
    try {
      const body = `#!/bin/sh\n# note: see ${HOOK_MARKER} docs\necho precious\n`;
      fs.writeFileSync(hookPath(dir), body);
      await assert.rejects(installHooks({ cwd: dir, ...only({ preCommit: true }) }), HookConflictError);
      assert.equal(fs.readFileSync(hookPath(dir), 'utf8'), body);
    } finally { rm(dir); }
  });

  it('F1: a foreign hook that mentions the marker is backed up by --force', async () => {
    const dir = tempRepo();
    try {
      const body = `#!/bin/sh\n# note: see ${HOOK_MARKER} docs\necho precious\n`;
      fs.writeFileSync(hookPath(dir), body);
      const r = await installHooks({ cwd: dir, ...only({ preCommit: true, force: true }) });
      assert.equal(fs.readFileSync(r.hook.backup, 'utf8'), body);
    } finally { rm(dir); }
  });

  it('F1: a hook that is a known earlier generated version is updated in place, without a backup', async () => {
    const dir = tempRepo();
    try {
      const hooks = path.join(dir, '.git', 'hooks');
      const v1 = `#!/bin/sh\n${HOOK_MARKER}\necho v1\n`;
      const v2 = `#!/bin/sh\n${HOOK_MARKER}\necho v2\n`;
      assert.equal((await installGitHook(hooks, 'pre-commit', v1)).action, 'created');
      const r = await installGitHook(hooks, 'pre-commit', v2, { known: [v1] });
      assert.equal(r.action, 'updated');
      assert.equal(r.backup, undefined);
      assert.equal(fs.readFileSync(hookPath(dir), 'utf8'), v2);
      assert.deepEqual(baks(hooks, 'pre-commit'), []);
      // Without v1 declared as known, the same replacement is a conflict.
      await assert.rejects(installGitHook(hooks, 'pre-commit', v1, { known: [] }), HookConflictError);
    } finally { rm(dir); }
  });

  it('F1: an existing manifest with user content is backed up before it is rewritten', async () => {
    const dir = tempRepo();
    try {
      const mine = JSON.stringify({ standard: 'mine', notes: 'keep me' }, null, 2) + '\n';
      fs.writeFileSync(manifestPath(dir), mine);
      const r = await installHooks({ cwd: dir, ...only({ mcpVerifyRead: true }) });
      assert.ok(r.manifestBackup, 'manifestBackup reported');
      assert.match(path.basename(r.manifestBackup), /^\.provenance-hooks\.json\.bak-\d{8}T\d{6}Z/);
      assert.equal(fs.readFileSync(r.manifestBackup, 'utf8'), mine);
      assert.equal(JSON.parse(fs.readFileSync(manifestPath(dir), 'utf8')).hooks.mcpVerifyRead, true);
    } finally { rm(dir); }
  });

  it('F1: an unparseable manifest is backed up too', async () => {
    const dir = tempRepo();
    try {
      fs.writeFileSync(manifestPath(dir), '{not json');
      const r = await installHooks({ cwd: dir, ...only({ mcpVerifyRead: true }) });
      assert.equal(fs.readFileSync(r.manifestBackup, 'utf8'), '{not json');
    } finally { rm(dir); }
  });

  it('F1: re-running with the same choices rewrites our manifest without a backup', async () => {
    const dir = tempRepo();
    try {
      await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      const r = await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      assert.equal(r.manifestBackup, undefined);
      assert.deepEqual(baks(dir, '.provenance-hooks.json'), []);
    } finally { rm(dir); }
  });

  it('F1: the manifest does not say preCommit:false while our pre-commit hook is installed', async () => {
    const dir = tempRepo();
    try {
      await installHooks({ cwd: dir, ...only({ preCommit: true }) });
      await installHooks({ cwd: dir, ...only({ mcpVerifyRead: true }) });
      const m = JSON.parse(fs.readFileSync(manifestPath(dir), 'utf8'));
      assert.deepEqual(m.hooks, { preCommit: true, mcpVerifyRead: true, mcpAutoSeal: false });
    } finally { rm(dir); }
  });

  it('F1: previously recorded MCP choices are kept, never silently switched off', async () => {
    const dir = tempRepo();
    try {
      await installHooks({ cwd: dir, ...only({ mcpVerifyRead: true }) });
      await installHooks({ cwd: dir, ...only({ mcpAutoSeal: true }) });
      const m = JSON.parse(fs.readFileSync(manifestPath(dir), 'utf8'));
      assert.deepEqual(m.hooks, { preCommit: false, mcpVerifyRead: true, mcpAutoSeal: true });
    } finally { rm(dir); }
  });

  it('F1: preCommit stays false in the manifest when the pre-commit hook on disk is a foreign one', async () => {
    const dir = tempRepo();
    try {
      fs.writeFileSync(hookPath(dir), '#!/bin/sh\necho mine\n');
      await installHooks({ cwd: dir, ...only({ mcpVerifyRead: true }) });
      assert.equal(JSON.parse(fs.readFileSync(manifestPath(dir), 'utf8')).hooks.preCommit, false);
      assert.equal(fs.readFileSync(hookPath(dir), 'utf8'), '#!/bin/sh\necho mine\n');
    } finally { rm(dir); }
  });
});

describe('F2: the pre-commit gate checks every staged file, whatever its name', () => {
  const NAMES = ['plain.md', 'b c.md', 'café.md', 'tab\there.md', '-dash.md', 'quote"d.md'];

  function setup() {
    const dir = tempRepo();
    const stub = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-stub-'));
    fs.writeFileSync(path.join(stub, 'npx'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STUB_LOG"\nexit "$STUB_EXIT"\n', { mode: 0o755 });
    return { dir, stub, log: path.join(stub, 'calls.log') };
  }
  function commit(ctx, exit) {
    return git(ctx.dir, ['commit', '-q', '-m', 'x'], {
      PATH: ctx.stub + path.delimiter + process.env.PATH,
      STUB_LOG: ctx.log,
      STUB_EXIT: String(exit)
    });
  }
  function stage(ctx, names) {
    for (const n of names) {
      fs.writeFileSync(path.join(ctx.dir, n), 'content of ' + n + '\n');
      fs.writeFileSync(path.join(ctx.dir, n + '.provenance.json'), '{}\n');
    }
    assert.equal(git(ctx.dir, ['add', '-A']).status, 0);
  }

  it('F2: with a stub verifier that fails, a commit containing any of these names is blocked and each is verified', async () => {
    for (const name of NAMES) {
      if (process.platform === 'win32' && /["\t]/.test(name)) continue; // not valid Windows file names
      const ctx = setup();
      try {
        await installHooks({ cwd: ctx.dir, ...only({ preCommit: true }) });
        stage(ctx, [name]);
        const r = commit(ctx, 1);
        assert.notEqual(r.status, 0, `commit with ${JSON.stringify(name)} should be blocked: ${r.stdout}${r.stderr}`);
        assert.match(r.stdout + r.stderr, /PROVENANCE DRIFT/);
        const calls = fs.readFileSync(ctx.log, 'utf8');
        assert.ok(calls.includes(name.startsWith('-') ? './' + name : name), `verifier called with ${JSON.stringify(name)}: ${calls}`);
        assert.equal(git(ctx.dir, ['rev-parse', '--verify', '-q', 'HEAD']).status !== 0, true, 'no commit was created');
      } finally { rm(ctx.dir); rm(ctx.stub); }
    }
  });

  it('F2: one bad file among several is enough to block, and every file is still checked', async () => {
    const ctx = setup();
    try {
      await installHooks({ cwd: ctx.dir, ...only({ preCommit: true }) });
      stage(ctx, ['plain.md', 'b c.md', 'café.md']);
      const r = commit(ctx, 1);
      assert.notEqual(r.status, 0);
      const calls = fs.readFileSync(ctx.log, 'utf8').split('\n').filter(Boolean);
      assert.equal(calls.length, 3, calls.join('|'));
    } finally { rm(ctx.dir); rm(ctx.stub); }
  });

  it('F2: with a stub verifier that passes, the same commit succeeds', async () => {
    const ctx = setup();
    try {
      await installHooks({ cwd: ctx.dir, ...only({ preCommit: true }) });
      stage(ctx, ['plain.md', 'b c.md', 'café.md']);
      const r = commit(ctx, 0);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout + r.stderr, /All staged artifacts verified/);
    } finally { rm(ctx.dir); rm(ctx.stub); }
  });

  it('F2: files without a sidecar and sidecar-only changes are not sent to the verifier', async () => {
    const ctx = setup();
    try {
      await installHooks({ cwd: ctx.dir, ...only({ preCommit: true }) });
      fs.writeFileSync(path.join(ctx.dir, 'nosidecar.md'), 'x\n');
      fs.writeFileSync(path.join(ctx.dir, 'a.md.provenance.json'), '{}\n');
      assert.equal(git(ctx.dir, ['add', '-A']).status, 0);
      const r = commit(ctx, 1);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.equal(fs.existsSync(ctx.log), false);
    } finally { rm(ctx.dir); rm(ctx.stub); }
  });

  it('F2: the hook declares bash and is valid bash syntax', () => {
    assert.match(PRE_COMMIT_SCRIPT, /^#!\/usr\/bin\/env bash\n/);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-syn-'));
    try {
      const f = path.join(tmp, 'hook.sh');
      fs.writeFileSync(f, PRE_COMMIT_SCRIPT);
      const r = spawnSync('bash', ['-n', f], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
    } finally { rm(tmp); }
  });
});

describe('N4: cancelling an interactive prompt', () => {
  const { PassThrough } = require('node:stream');
  const { runInstallHooksCli } = require('../dist/hookInstaller.js');

  async function runWith(inputWrites, dir) {
    const input = new PassThrough();
    const output = new PassThrough();
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      const p = runInstallHooksCli([], dir, { input, output, interactive: true });
      for (const w of inputWrites) input.write(w);
      input.end();
      const code = await p;
      return { code, errors: errors.join('\n') };
    } finally { console.error = orig; }
  }

  it('N4: EOF (Ctrl-D) at the first prompt exits non-zero, says nothing changed, and changes nothing', async () => {
    const dir = tempRepo();
    try {
      const { code, errors } = await runWith([], dir);
      assert.notEqual(code, 0);
      assert.match(errors, /cancelled, nothing changed/);
      assert.equal(fs.existsSync(manifestPath(dir)), false);
      assert.equal(fs.existsSync(hookPath(dir)), false);
    } finally { rm(dir); }
  });

  it('N4: EOF after some answers also changes nothing', async () => {
    const dir = tempRepo();
    try {
      const { code, errors } = await runWith(['y\n', 'y\n'], dir);
      assert.notEqual(code, 0);
      assert.match(errors, /cancelled, nothing changed/);
      assert.equal(fs.existsSync(manifestPath(dir)), false);
      assert.equal(fs.existsSync(hookPath(dir)), false);
    } finally { rm(dir); }
  });

  it('N4: answering all three prompts still works through the same path', async () => {
    const dir = tempRepo();
    try {
      const { code } = await runWith(['y\n', 'n\n', 'n\n'], dir);
      assert.equal(code, 0);
      assert.ok(fs.readFileSync(hookPath(dir), 'utf8').includes(HOOK_MARKER));
    } finally { rm(dir); }
  });
});
