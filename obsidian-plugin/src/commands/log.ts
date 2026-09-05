import { App, Notice, Modal, Setting } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import { ProvenanceEngine } from '../engine';

export class LogModal extends Modal {
  entryText = '';

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '📝 Log Session & Update Tasks' });

    new Setting(contentEl)
      .setName('Session Entry')
      .setDesc('What was accomplished in this sprint?')
      .addTextArea(text => text.onChange(v => (this.entryText = v)));

    new Setting(contentEl).addButton(btn => {
      btn.setButtonText('Append to Daily Log')
        .setCta()
        .onClick(() => {
          if (!this.entryText) {
            new Notice('Please write a log entry.');
            return;
          }
          this.appendLog();
          this.close();
        });
    });
  }

  appendLog() {
    const vaultPath = (this.app.vault.adapter as any).getBasePath ? (this.app.vault.adapter as any).getBasePath() : '';
    const logDir = path.join(vaultPath, 'Sessions');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];
    const notePath = path.join(logDir, dateStr + ".md");

    let existingContent = '';
    if (fs.existsSync(notePath)) {
      existingContent = fs.readFileSync(notePath, 'utf8');
    } else {
      existingContent = "---\ntype: session-log\ndate: " + dateStr + "\ntags: [session, log]\n---\n\n# Session Log: " + dateStr + "\n\n";
    }

    const newEntry = "\n### [" + timeStr + "] Studio Sprint Update\n" + this.entryText + "\n";
    const updatedContent = existingContent + newEntry;
    fs.writeFileSync(notePath, updatedContent, 'utf8');

    const sealRes = ProvenanceEngine.sealAgentNote(notePath, updatedContent, vaultPath);
    new Notice("📝 Daily log updated & attested: " + sealRes.statusLabel);
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function runLogCommand(app: App): void {
  new LogModal(app).open();
}
