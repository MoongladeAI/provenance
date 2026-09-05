import { App, Notice, Modal, Setting } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import { ProvenanceEngine } from '../engine';

export class DecisionModal extends Modal {
  titleText = '';
  decisionText = '';
  contextText = '';
  rationaleText = '';

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '⚖️ Record Architecture Decision (ADR)' });

    new Setting(contentEl)
      .setName('Decision Title')
      .addText(text => text.onChange(v => (this.titleText = v)));

    new Setting(contentEl)
      .setName('The Decision')
      .setDesc('One-line summary of what was chosen')
      .addTextArea(text => text.onChange(v => (this.decisionText = v)));

    new Setting(contentEl)
      .setName('Context')
      .setDesc('What prompted this choice?')
      .addTextArea(text => text.onChange(v => (this.contextText = v)));

    new Setting(contentEl)
      .setName('Rationale & Consequences')
      .setDesc('Why this option and what changes?')
      .addTextArea(text => text.onChange(v => (this.rationaleText = v)));

    new Setting(contentEl).addButton(btn => {
      btn.setButtonText('Seal Decision Record')
        .setCta()
        .onClick(() => {
          if (!this.titleText) {
            new Notice('Please provide a decision title.');
            return;
          }
          this.saveDecision();
          this.close();
        });
    });
  }

  saveDecision() {
    const vaultPath = (this.app.vault.adapter as any).getBasePath ? (this.app.vault.adapter as any).getBasePath() : '';
    const outDir = path.join(vaultPath, 'Projects', 'Decisions');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const now = new Date().toISOString().split('T')[0];
    const safeTitle = this.titleText.replace(/[^a-zA-Z0-9_-]/g, '-');
    const notePath = path.join(outDir, "ADR-" + now + "-" + safeTitle + ".md");

    const content = "---\n" +
      "type: adr\n" +
      "date: " + now + "\n" +
      "status: accepted\n" +
      "tags: [adr, decision, provenanced]\n" +
      "ai-first: true\n" +
      "---\n\n" +
      "# ADR: " + this.titleText + "\n\n" +
      "## Decision\n" +
      (this.decisionText || 'Decision accepted.') + "\n\n" +
      "## Context\n" +
      (this.contextText || 'Operational context recorded during session.') + "\n\n" +
      "## Rationale & Consequences\n" +
      (this.rationaleText || 'Ratified by human architect.') + "\n";

    fs.writeFileSync(notePath, content, 'utf8');
    const sealRes = ProvenanceEngine.sealAgentNote(notePath, content, vaultPath);
    new Notice("⚖️ Decision recorded & sealed: " + sealRes.statusLabel);
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function runDecideCommand(app: App): void {
  new DecisionModal(app).open();
}
