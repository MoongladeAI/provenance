import { App, Notice } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import { ProvenanceEngine } from '../engine';

export async function runArchitectCommand(app: App, defaultRepoPath = ''): Promise<void> {
  new Notice('🏛️ [Provenance Architect] Scanning workspace codebases...');

  let repos: string[] = [];
  try {
    if (fs.existsSync(defaultRepoPath)) {
      repos = fs.readdirSync(defaultRepoPath).filter(f => {
        return fs.statSync(path.join(defaultRepoPath, f)).isDirectory() && !f.startsWith('.');
      });
    }
  } catch (e) {
    console.error(e);
  }

  const vaultPath = (app.vault.adapter as any).getBasePath ? (app.vault.adapter as any).getBasePath() : '';
  const outDir = path.join(vaultPath, 'Projects', 'Architecture');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const notePath = path.join(outDir, 'Studio Architecture Map.md');
  const now = new Date().toISOString().split('T')[0];

  let repoListMarkdown = '';
  for (const r of repos) {
    repoListMarkdown += "### 📦 " + r + "\n- Path: `" + defaultRepoPath + "/" + r + "`\n- Role: Studio Service\n\n";
  }

  const content = "---\n" +
    "type: architecture-overview\n" +
    "date: " + now + "\n" +
    "tags: [architecture, studio, provenanced]\n" +
    "ai-first: true\n" +
    "---\n\n" +
    "# Studio Architecture Map\n\n" +
    "> Generated automatically by the Epistemic Provenance Gate Architect Engine.\n" +
    "> Living map of all active repositories in the Moonglade Studio ecosystem.\n\n" +
    "```mermaid\n" +
    "graph TD\n" +
    "    Client[Web & Client Surface] --> moongladeai[moongladeai.net (Astro)]\n" +
    "    Client --> oddball[oddball.net (Flask/Fly.io)]\n" +
    "    Client --> bajan[bajan-genius (Worker + Pages)]\n" +
    "    oddball --> anime[anime.oddball.net (Astro Archive)]\n" +
    "    Client --> provenance[Provenance Gate (Obsidian Plugin)]\n" +
    "```\n\n" +
    "## Active Studio Repositories\n\n" +
    "<!-- @generated:start -->\n" +
    repoListMarkdown +
    "<!-- @generated:end -->\n\n" +
    "## Invariant Governance Rules\n" +
    "1. **Origin Fidelity:** Sovereign Caribbean baseline.\n" +
    "2. **Epistemic Authority:** Human Architect Root overrides autonomous agent assertions.\n";

  fs.writeFileSync(notePath, content, 'utf8');

  const sealRes = ProvenanceEngine.sealAgentNote(notePath, content, vaultPath);
  new Notice("✅ Architecture map generated & sealed: " + sealRes.statusLabel);
}
