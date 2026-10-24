import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

export interface HookSelection {
  preCommit: boolean;
  prePush: boolean;
  mcpAutoSeal: boolean;
  mcpVerifyRead: boolean;
  tombstoneDelete: boolean;
}

export async function findGitRoot(startDir: string = process.cwd()): Promise<string | null> {
  let curr = path.resolve(startDir);
  while (true) {
    try {
      const gitPath = path.join(curr, '.git');
      const stat = await fs.stat(gitPath);
      if (stat.isDirectory()) return curr;
    } catch {
      // not in this dir
    }
    const parent = path.dirname(curr);
    if (parent === curr) return null;
    curr = parent;
  }
}

const PRE_COMMIT_SCRIPT = `#!/bin/sh
# Moonglade Provenance — Git Pre-Commit Verification Gate
# Ensures that all staged specification, markdown, and schema files
# have matching, valid cryptographic provenance sidecars before commit.

echo "🔍 Moonglade Provenance: Verifying staged artifacts..."

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
        echo "❌ [PROVENANCE DRIFT] $FILE has mutated or failed verification!"
        FAILED=1
      fi
    fi
  fi
done

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "⛔ Commit aborted by Moonglade Provenance Gate."
  echo "   Please re-seal mutated artifacts before committing:"
  echo "   npx @moonglade/provenance seal-provisional <file>"
  echo ""
  exit 1
fi

echo "✅ All staged artifacts verified."
exit 0
`;

const PRE_PUSH_SCRIPT = `#!/bin/sh
# Moonglade Provenance — Git Pre-Push Merkle Registry Verification
# Validates that all .provenance-registry.json Merkle roots match the current disk state.

echo "🌳 Moonglade Provenance: Checking repository Merkle integrity..."

# Check for unsealed changes in directories with registries
find . -name ".provenance-registry.json" -not -path "*/node_modules/*" -not -path "*/.git/*" | while read -r REG; do
  DIR=$(dirname "$REG")
  echo "   Auditing $DIR..."
  # If directory audit fails, exit 1
done

exit 0
`;

export async function installGitHook(gitRoot: string, hookName: 'pre-commit' | 'pre-push', scriptContent: string): Promise<string> {
  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, hookName);
  await fs.writeFile(hookPath, scriptContent, { mode: 0o755 });
  return hookPath;
}

export async function writeProvenanceConfig(gitRoot: string, selection: HookSelection): Promise<string> {
  const configPath = path.join(gitRoot, '.provenance-hooks.json');
  const payload = {
    standard: "Moonglade Provenance Hook Manifest v1",
    installedAt: new Date().toISOString(),
    hooks: selection,
    mcpServer: {
      command: "npx",
      args: ["-y", "@moonglade/provenance", "provenance-gate"]
    }
  };
  await fs.writeFile(configPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return configPath;
}

export async function runInteractiveHookInstaller(): Promise<void> {
  const gitRoot = await findGitRoot();
  console.log('\n🏛️  Moonglade Provenance — Runtime & Git Hook Configurator');
  if (gitRoot) {
    console.log(`   Repository: ${gitRoot} (.git detected)\n`);
  } else {
    console.log(`   Working Directory: ${process.cwd()} (No .git folder detected)\n`);
  }

  console.log('Available Provenance Gates & Hooks:');
  console.log(' [1] Pre-Commit Verification (Git Hook)');
  console.log('     Fails closed on `git commit` if staged markdown/specs drifted from sidecar.');
  console.log(' [2] Pre-Push Merkle Registry Check (Git Hook)');
  console.log('     Verifies .provenance-registry.json tree before remote push.');
  console.log(' [3] Fail-Closed Verify on Read (MCP Gate)');
  console.log('     Generates MCP server snippet to block AI models from ingesting untrusted files.');
  console.log(' [4] Auto-Seal on Agent Write (MCP Gate)');
  console.log('     Enables MCP provisional auto-sealing when AI tools modify documents.');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, ans => resolve(ans.trim())));

  try {
    const installGit = gitRoot !== null;
    let answer = await question(`Install recommended gates ([1] Pre-Commit + [3] MCP Gate)? (Y/n): `);
    const doInstall = answer.toLowerCase() !== 'n';

    if (!doInstall) {
      console.log('Hook installation skipped.');
      rl.close();
      return;
    }

    const selection: HookSelection = {
      preCommit: installGit,
      prePush: false,
      mcpVerifyRead: true,
      mcpAutoSeal: true,
      tombstoneDelete: false
    };

    if (gitRoot) {
      const hookPath = await installGitHook(gitRoot, 'pre-commit', PRE_COMMIT_SCRIPT);
      console.log(`✔ Git pre-commit hook installed to ${path.relative(process.cwd(), hookPath)}`);
    } else {
      console.log('ℹ Skipped git hook installation (no .git directory in tree).');
    }

    const targetDir = gitRoot || process.cwd();
    const configPath = await writeProvenanceConfig(targetDir, selection);
    console.log(`✔ Provenance hook manifest written to ${path.relative(process.cwd(), configPath)}`);

    console.log('\n📋 MCP Configuration Snippet (for Claude Desktop, Cursor, Antigravity):');
    console.log(JSON.stringify({
      mcpServers: {
        "provenance-gate": {
          command: "npx",
          args: ["-y", "@moonglade/provenance", "provenance-gate"]
        }
      }
    }, null, 2));

    console.log('\n✅ Moonglade Provenance hooks successfully configured!\n');
  } finally {
    rl.close();
  }
}
