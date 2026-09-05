import { App, Notice } from 'obsidian';
import * as crypto from 'crypto';

export async function runHealthCommand(app: App): Promise<void> {
  new Notice('🩺 [Vault Health & Merkle Audit] Running whole-vault integrity check...');

  const files = app.vault.getMarkdownFiles();
  let dataZoningBreaches = 0;
  const leaves: string[] = [];

  for (const file of files) {
    if (file.path.toLowerCase().includes('quarantine')) {
      continue;
    }
    const content = await app.vault.read(file);
    if (content.includes('Quarantine/') || content.includes('00-Raw') || content.includes('10-Derived')) {
      dataZoningBreaches++;
      console.warn("[Data Zoning Violation] File cites quarantined corpus: " + file.path);
    }

    const hash = crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n').normalize('NFC')).digest('hex');
    leaves.push(hash);
  }

  leaves.sort();
  let currentLayer = leaves.map(h => crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0x00]), Buffer.from(h, 'hex')])).digest('hex'));

  while (currentLayer.length > 1) {
    const nextLayer: string[] = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      if (i + 1 < currentLayer.length) {
        const combined = Buffer.concat([
          Buffer.from([0x01]),
          Buffer.from(currentLayer[i], 'hex'),
          Buffer.from(currentLayer[i + 1], 'hex')
        ]);
        nextLayer.push(crypto.createHash('sha256').update(combined).digest('hex'));
      } else {
        nextLayer.push(currentLayer[i]);
      }
    }
    currentLayer = nextLayer;
  }

  const merkleRoot = currentLayer[0] || 'EMPTY';

  new Notice(
    "🩺 Vault Health Audit Complete!\nFiles: " + files.length + "\nData Zoning Defects: " + dataZoningBreaches + "\nMerkle Root: " + merkleRoot.slice(0, 16) + "...",
    8000
  );
  console.log('[Provenance Health] RFC 6962 Vault Merkle Root:', merkleRoot);
}
