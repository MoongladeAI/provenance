import { Plugin, TFile, Notice, MarkdownView } from 'obsidian';
import * as path from 'path';
import { ProvenanceSettings, DEFAULT_SETTINGS, VerificationResult } from './types';
import { ProvenanceEngine } from './engine';
import { ProvenanceStatusBar } from './ui/StatusBar';
import { ProvenanceModal } from './ui/ProvenanceModal';
import { LiveBannerManager } from './ui/LiveBanner';
import { ProvenanceSettingTab } from './settings';
import { runArchitectCommand } from './commands/architect';
import { runDecideCommand } from './commands/decide';
import { runLogCommand } from './commands/log';
import { runReconcileCommand } from './commands/reconcile';
import { runHealthCommand } from './commands/health';

export default class ProvenanceGatePlugin extends Plugin {
  settings: ProvenanceSettings = DEFAULT_SETTINGS;
  statusBar!: ProvenanceStatusBar;
  lastVerificationResult: VerificationResult | null = null;

  async onload() {
    console.log('[Provenance Gate] Initializing Epistemic Provenance Plugin...');
    await this.loadSettings();

    // 1. Initialize Status Bar
    const statusBarEl = this.addStatusBarItem();
    this.statusBar = new ProvenanceStatusBar(this, statusBarEl);

    // 2. Add Ribbon Icon
    this.addRibbonIcon('shield-alert', 'Epistemic Provenance Inspector', () => {
      if (this.lastVerificationResult) {
        new ProvenanceModal(this.app, this, this.lastVerificationResult).open();
      } else {
        new Notice('Open a markdown note to inspect provenance.');
      }
    });

    // 3. Register Event Listeners
    this.registerEvent(
      this.app.workspace.on('file-open', (file: TFile | null) => {
        if (file && this.settings.enableAutoVerify) {
          this.verifyFile(file);
        } else {
          this.statusBar.reset();
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && this.settings.enableAutoVerify) {
          this.verifyFile(activeFile);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md' && this.settings.enableAutoVerify) {
          const current = this.app.workspace.getActiveFile();
          if (current && current.path === file.path) {
            this.verifyFile(file);
          }
        }
      })
    );

    // 4. Register Commands
    this.addCommand({
      id: 'verify-active-note',
      name: 'Verify Active Note Cryptographic Provenance',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            this.verifyFile(activeFile, true);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'seal-agent-note',
      name: 'Seal Active Note (Agent Attestation Key)',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            this.sealActiveNote(activeFile);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'map-codebase-architecture',
      name: 'Core 1: Map Codebase Architecture (Architect)',
      callback: () => runArchitectCommand(this.app)
    });

    this.addCommand({
      id: 'record-decision-adr',
      name: 'Core 2: Record Architecture Decision (Decide/ADR)',
      callback: () => runDecideCommand(this.app)
    });

    this.addCommand({
      id: 'log-session-progress',
      name: 'Core 3: Log Session Progress & Sync Tasks (Log)',
      callback: () => runLogCommand(this.app)
    });

    this.addCommand({
      id: 'reconcile-vault-contradictions',
      name: 'Core 4: Reconcile Vault Contradictions (Reconcile)',
      callback: () => runReconcileCommand(this.app)
    });

    this.addCommand({
      id: 'audit-vault-health-merkle',
      name: 'Core 5: Audit Vault Health & Merkle Root (Health)',
      callback: () => runHealthCommand(this.app)
    });

    // 5. Register Settings Tab
    this.addSettingTab(new ProvenanceSettingTab(this.app, this));

    // Initial check on active file if already open
    const current = this.app.workspace.getActiveFile();
    if (current) {
      this.verifyFile(current);
    }
  }

  async verifyFile(file: TFile, notify = false) {
    if (file.extension !== 'md') {
      this.statusBar.reset();
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const vaultPath = (this.app.vault.adapter as any).getBasePath ? (this.app.vault.adapter as any).getBasePath() : '';
      const fullPath = path.join(vaultPath, file.path);

      const res = ProvenanceEngine.verifyFile(fullPath, content, this.settings);
      this.lastVerificationResult = res;
      this.statusBar.update(res);

      // Render both Frontmatter Property Pill and Top-of-Note Banner
      const renderUi = () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file && activeView.file.path === file.path) {
          LiveBannerManager.updateAll(activeView.contentEl, res, () => {
            new ProvenanceModal(this.app, this, res).open();
          });
        }
      };
      renderUi();
      setTimeout(renderUi, 80);
      setTimeout(renderUi, 250);

      if (notify) {
        // timestampInfo was renamed to highestTimeVector; this call site was missed.
        const tsNotice = res.highestTimeVector ? (" · " + res.highestTimeVector.timestamp.split(" ")[0]) : "";
        new Notice(res.statusEmoji + " " + res.statusLabel + tsNotice + " (" + file.name + ")");
      }
    } catch (e: any) {
      console.error('[Provenance Gate] Verification failed:', e);
    }
  }

  async sealActiveNote(file: TFile) {
    try {
      const content = await this.app.vault.read(file);
      const vaultPath = (this.app.vault.adapter as any).getBasePath ? (this.app.vault.adapter as any).getBasePath() : '';
      const fullPath = path.join(vaultPath, file.path);

      const res = ProvenanceEngine.sealAgentNote(
        fullPath,
        content,
        vaultPath,
        this.settings.defaultAgentIdentity
      );
      this.lastVerificationResult = res;
      this.statusBar.update(res);
      new Notice("✅ Sealed & Attested: " + file.name + " [" + res.statusLabel + "]");
    } catch (e: any) {
      new Notice("❌ Failed to seal note: " + e.message);
    }
  }

  onunload() {
    console.log('[Provenance Gate] Unloading Epistemic Provenance Plugin...');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
