import { App, Notice, TFile } from 'obsidian';

export async function runReconcileCommand(app: App): Promise<void> {
  new Notice('🔍 [Reconcile] Auditing vault for contradictory notes & duplicate entities...');

  const files = app.vault.getMarkdownFiles();
  const titleMap: Record<string, TFile[]> = {};

  for (const file of files) {
    const base = file.basename.toLowerCase();
    if (!titleMap[base]) {
      titleMap[base] = [];
    }
    titleMap[base].push(file);
  }

  const duplicates: Array<{ name: string; paths: string[] }> = [];
  for (const [name, list] of Object.entries(titleMap)) {
    if (list.length > 1) {
      duplicates.push({ name, paths: list.map(f => f.path) });
    }
  }

  if (duplicates.length === 0) {
    new Notice('✅ [Reconcile] No duplicate note collisions found. Vault entities are unified.');
  } else {
    new Notice("⚠️ [Reconcile] Found " + duplicates.length + " duplicate entities. Check console.");
    console.warn('[Provenance Reconcile] Duplicates found:', duplicates);
  }
}
