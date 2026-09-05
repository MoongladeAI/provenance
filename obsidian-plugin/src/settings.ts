import { App, PluginSettingTab, Setting } from 'obsidian';
import { ProvenanceSettings, DEFAULT_SETTINGS } from './types';

export class ProvenanceSettingTab extends PluginSettingTab {
  plugin: any;

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Epistemic Provenance Gate Settings' });

    new Setting(containerEl)
      .setName('Canonical Signer Registry Path')
      .setDesc('Path to trust/moonglade-signers.json with authorized Architect and Agent keys.')
      .addText(text =>
        text
          .setPlaceholder('<vault>/trust/moonglade-signers.json')
          .setValue(this.plugin.settings.canonicalTrustRegistry)
          .onChange(async value => {
            this.plugin.settings.canonicalTrustRegistry = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default Agent Identity')
      .setDesc('Signer email identity used for autonomous agent attestations.')
      .addText(text =>
        text
          .setPlaceholder('moongladeai+agy@gmail.com')
          .setValue(this.plugin.settings.defaultAgentIdentity)
          .onChange(async value => {
            this.plugin.settings.defaultAgentIdentity = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Auto-Verify Active Notes')
      .setDesc('Automatically verify file cryptographic hash against disk sidecar upon switching notes.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableAutoVerify)
          .onChange(async value => {
            this.plugin.settings.enableAutoVerify = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Multi-Vault Federation Registry' });
    const vaultList = containerEl.createEl('ul');
    for (const v of this.plugin.settings.registeredVaults) {
      const li = vaultList.createEl('li');
      li.setText(v.vaultName + " (" + v.vaultId + ") — " + v.vaultPath + (v.isCanonicalRoot ? ' [CANONICAL ROOT]' : ''));
    }
  }
}
