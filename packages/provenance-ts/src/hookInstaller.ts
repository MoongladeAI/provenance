import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { execFile } from 'child_process';

export interface HookSelection {
  preCommit: boolean;
  mcpVerifyRead: boolean;
  mcpAutoSeal: boolean;
}

export interface InstallOptions extends HookSelection {
  cwd?: string;
  /** Replace a hook that was not installed by this tool, after backing it up. */
  force?: boolean;
}

export interface HookResult {
  path: string;
  action: 'created' | 'updated' | 'replaced';
  backup?: string;
}

export interface InstallResult {
  selection: HookSelection;
  hooksDir: string | null;
  hook: HookResult | null;
  manifestPath: string;
}

/** Marker line that identifies a hook as installed by this tool. */
export const HOOK_MARKER = '# moonglade-provenance-hook v1';

export class HookConflictError extends Error {
  constructor(public readonly hookPath: string) {
    super(`${hookPath} already exists and was not installed by Moonglade Provenance. It was left unchanged. Re-run with --force to back it up and replace it.`);
    this.name = 'HookConflictError';
  }
}

function git(cwd: string, args: string[]): Promise<{ ok: boolean; missing: boolean; out: string }> {
  return new Promise(resolve => {
    execFile('git', args, { cwd, windowsHide: true }, (err, stdout) => {
      if (err) resolve({ ok: false, missing: (err as NodeJS.ErrnoException).code === 'ENOENT', out: '' });
      else resolve({ ok: true, missing: false, out: String(stdout).trim() });
    });
  });
}

export async function findGitRoot(startDir: string = process.cwd()): Promise<string | null> {
  let curr = path.resolve(startDir);
  while (true) {
    try {
      const stat = await fs.stat(path.join(curr, '.git'));
      if (stat.isDirectory()) return curr;
    } catch {
      // not in this dir
    }
    const parent = path.dirname(curr);
    if (parent === curr) return null;
    curr = parent;
  }
}

/**
 * Hooks directory as git itself resolves it (`git rev-parse --git-path hooks`), so linked worktrees,
 * submodules and core.hooksPath work. Falls back to a `.git` directory only when git is not installed.
 * Returns null when cwd is not inside a repository.
 */
export async function resolveHooksDir(cwd: string = process.cwd()): Promise<string | null> {
  const r = await git(cwd, ['rev-parse', '--git-path', 'hooks']);
  if (r.ok) return path.resolve(cwd, r.out);
  if (r.missing) {
    const root = await findGitRoot(cwd);
    return root ? path.join(root, '.git', 'hooks') : null;
  }
  return null;
}

async function resolveTopLevel(cwd: string): Promise<string> {
  const r = await git(cwd, ['rev-parse', '--show-toplevel']);
  return r.ok ? path.resolve(cwd, r.out) : path.resolve(cwd);
}

const PRE_COMMIT_SCRIPT = `#!/bin/sh
${HOOK_MARKER}
# Moonglade Provenance - Git Pre-Commit Verification Gate
# Ensures that all staged specification, markdown, and schema files
# that have a provenance sidecar still match it before commit.

echo "Moonglade Provenance: Verifying staged artifacts..."

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(md|csv|json|sql|ya?ml)$' | grep -vE '(\\.provenance\\.json|\\.provenance-registry\\.json)$')

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

FAILED=0
for FILE in $STAGED_FILES; do
  if [ -f "$FILE" ]; then
    # If a sidecar exists, verify it matches the current content
    if [ -f "$FILE.provenance.json" ]; then
      npx --no-install @moonglade/provenance badge "$FILE" --short > /dev/null 2>&1
      STATUS=$?
      if [ $STATUS -ne 0 ]; then
        echo "[PROVENANCE DRIFT] $FILE has mutated or failed verification!"
        FAILED=1
      fi
    fi
  fi
done

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "Commit aborted by Moonglade Provenance Gate."
  echo "Please re-seal mutated artifacts before committing:"
  echo "  npx @moonglade/provenance seal-provisional <file>"
  echo ""
  exit 1
fi

echo "All staged artifacts verified."
exit 0
`;

function backupStamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '');
}

/** Install one hook script. Never overwrites a foreign hook unless force; a forced replace is backed up first. */
export async function installGitHook(hooksDir: string, hookName: string, scriptContent: string, opts: { force?: boolean } = {}): Promise<HookResult> {
  await fs.mkdir(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, hookName);
  let existing: string | null = null;
  try {
    existing = await fs.readFile(hookPath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  let action: HookResult['action'] = 'created';
  let backup: string | undefined;
  if (existing !== null) {
    if (existing.includes(HOOK_MARKER)) {
      action = 'updated';
    } else {
      if (!opts.force) throw new HookConflictError(hookPath);
      action = 'replaced';
      const stamp = backupStamp();
      for (let i = 0; ; i++) {
        const candidate = `${hookPath}.bak-${stamp}${i ? '-' + i : ''}`;
        try {
          await fs.copyFile(hookPath, candidate, 1 /* COPYFILE_EXCL */);
          backup = candidate;
          break;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        }
      }
    }
  }
  await fs.writeFile(hookPath, scriptContent, { mode: 0o755 });
  await fs.chmod(hookPath, 0o755);
  return backup ? { path: hookPath, action, backup } : { path: hookPath, action };
}

export async function writeProvenanceConfig(dir: string, selection: HookSelection): Promise<string> {
  const configPath = path.join(dir, '.provenance-hooks.json');
  const payload: Record<string, unknown> = {
    standard: 'Moonglade Provenance Hook Manifest v1',
    installedAt: new Date().toISOString(),
    hooks: selection
  };
  if (selection.mcpVerifyRead || selection.mcpAutoSeal) {
    payload.mcpServer = { command: 'npx', args: ['-y', '@moonglade/provenance', 'provenance-gate'] };
  }
  await fs.writeFile(configPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return configPath;
}

/** Install exactly the selected gates. Nothing is enabled that was not selected. */
export async function installHooks(opts: InstallOptions): Promise<InstallResult> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const selection: HookSelection = {
    preCommit: opts.preCommit === true,
    mcpVerifyRead: opts.mcpVerifyRead === true,
    mcpAutoSeal: opts.mcpAutoSeal === true
  };
  let hooksDir: string | null = null;
  let hook: HookResult | null = null;
  if (selection.preCommit) {
    hooksDir = await resolveHooksDir(cwd);
    if (!hooksDir) throw new Error(`pre-commit hook requested but ${cwd} is not inside a git repository`);
    hook = await installGitHook(hooksDir, 'pre-commit', PRE_COMMIT_SCRIPT, { force: opts.force });
  }
  const manifestPath = await writeProvenanceConfig(await resolveTopLevel(cwd), selection);
  return { selection, hooksDir, hook, manifestPath };
}

export const HOOK_FLAGS = ['--pre-commit', '--mcp-verify-read', '--mcp-auto-seal', '--force'] as const;

export const HOOK_USAGE = 'usage: provenance install-hooks [--pre-commit] [--mcp-verify-read] [--mcp-auto-seal] [--force]\n' +
  '  --pre-commit        install the git pre-commit verification gate\n' +
  '  --mcp-verify-read   record the fail-closed verify-on-read MCP option\n' +
  '  --mcp-auto-seal     record the provisional auto-seal-on-agent-write MCP option\n' +
  '  --force             replace an existing hook that is not ours, after backing it up to <hook>.bak-<UTC timestamp>\n' +
  'With no choice flag, the command asks about each option when run in a terminal and does nothing otherwise.';

/** CLI entry. Returns the process exit code. */
export async function runInstallHooksCli(args: string[], cwd: string = process.cwd()): Promise<number> {
  const unknown = args.filter(a => !(HOOK_FLAGS as readonly string[]).includes(a));
  if (unknown.length) {
    console.error(`unknown argument: ${unknown.join(' ')}\n${HOOK_USAGE}`);
    return 2;
  }
  const has = (f: string) => args.includes(f);
  let selection: HookSelection = { preCommit: has('--pre-commit'), mcpVerifyRead: has('--mcp-verify-read'), mcpAutoSeal: has('--mcp-auto-seal') };
  if (!selection.preCommit && !selection.mcpVerifyRead && !selection.mcpAutoSeal) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error(`no option selected and no terminal to ask.\n${HOOK_USAGE}`);
      return 2;
    }
    selection = await askInteractively();
  }
  try {
    const r = await installHooks({ cwd, ...selection, force: has('--force') });
    if (r.hook) {
      console.log(`${r.hook.action}: ${r.hook.path}`);
      if (r.hook.backup) console.log(`backup of previous hook: ${r.hook.backup}`);
    }
    console.log(`manifest: ${r.manifestPath}`);
    console.log(`enabled: ${JSON.stringify(r.selection)}`);
    if (selection.mcpVerifyRead || selection.mcpAutoSeal) {
      console.log('MCP configuration snippet:');
      console.log(JSON.stringify({ mcpServers: { 'provenance-gate': { command: 'npx', args: ['-y', '@moonglade/provenance', 'provenance-gate'] } } }, null, 2));
    }
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

async function askInteractively(): Promise<HookSelection> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, def: boolean): Promise<boolean> =>
    new Promise(resolve => rl.question(`${q} (${def ? 'Y/n' : 'y/N'}): `, a => {
      const t = a.trim().toLowerCase();
      resolve(t === '' ? def : t === 'y' || t === 'yes');
    }));
  try {
    return {
      preCommit: await ask('Install the git pre-commit verification gate?', true),
      mcpVerifyRead: await ask('Record the fail-closed verify-on-read MCP option?', false),
      mcpAutoSeal: await ask('Record the provisional auto-seal-on-agent-write MCP option?', false)
    };
  } finally {
    rl.close();
  }
}
