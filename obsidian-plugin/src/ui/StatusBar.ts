import { Plugin } from 'obsidian';
import { VerificationResult, TimeVector } from '../types';
import { ProvenanceModal } from './ProvenanceModal';

export class ProvenanceStatusBar {
  private statusBarEl: HTMLElement;
  private plugin: Plugin;
  private currentResult: VerificationResult | null = null;

  constructor(plugin: Plugin, statusBarEl: HTMLElement) {
    this.plugin = plugin;
    this.statusBarEl = statusBarEl;
    this.statusBarEl.addClass('provenance-status-bar-item');
    this.statusBarEl.style.cursor = 'pointer';
    this.statusBarEl.addEventListener('click', () => {
      if (this.currentResult) {
        new ProvenanceModal(this.plugin.app, this.plugin, this.currentResult).open();
      }
    });
    this.reset();
  }

  reset() {
    this.currentResult = null;
    this.statusBarEl.empty();
    this.statusBarEl.setText('🛡️ Provenance: Ready');
    this.statusBarEl.setAttribute('aria-label', 'Epistemic Provenance Gate — Click to inspect');
  }

  getTimeTierColor(vec?: TimeVector): string {
    if (!vec || !vec.tier) return 'var(--text-muted)';
    if (vec.fallbackFrom) return '#f59e0b'; // Amber for degraded fallback
    if (vec.status === 'CORRUPTED' || vec.status === 'ERROR') return '#ef4444'; // Red
    if (vec.tier.includes('L1') || vec.tier.includes('L2')) return '#10b981'; // Green
    if (vec.tier.includes('L3')) return '#f59e0b'; // Amber
    return '#94a3b8'; // L4 Slate / Muted
  }

  getTimeLevel(vec?: TimeVector): string {
    if (!vec || !vec.tier) return 'L4';
    if (vec.tier.includes('L1')) return 'L1';
    if (vec.tier.includes('L2')) return 'L2';
    if (vec.tier.includes('L3')) return 'L3';
    return 'L4';
  }

  update(res: VerificationResult) {
    this.currentResult = res;
    this.statusBarEl.empty();

    // 1. Status Span (Signer status: Green for Human, Cyan for Agent, etc.)
    const statusSpan = this.statusBarEl.createSpan({ cls: 'provenance-status-text' });
    // [role emoji] [lock] [signer]. The lock states whether this document is
    // sealed and intact, which is a different question from the timestamp lock
    // further along the bar - that one is about how well the TIME is attested.
    const sealLock = res.verified ? "\u{1F512}" : "\u{1F513}";
    statusSpan.setText(res.statusEmoji + " " + sealLock + " " + res.statusLabel);
    statusSpan.style.color = res.statusColor;
    statusSpan.style.fontWeight = '500';

    if (res.error) {
      statusSpan.setAttribute('aria-label', res.statusLabel + " · Click to inspect error");
    } else {
      const signerDesc = res.signers.length > 0 ? res.signers.join(', ') : 'Unsealed Draft';
      statusSpan.setAttribute('aria-label', signerDesc + " · SHA: " + res.currentHash.slice(0, 8) + " · Click to expand");
    }

    // 2. Timestamp Span (Color matched to the tier of the used time: Green L1/L2, Amber L3, Slate L4)
    if (res.highestTimeVector && res.highestTimeVector.timestamp) {
      const sep = this.statusBarEl.createSpan({ text: ' · ' });
      sep.style.opacity = '0.6';

      const isLocked = !res.highestTimeVector.fallbackFrom &&
                       (res.highestTimeVector.tier.includes('L1') || res.highestTimeVector.tier.includes('L2')) &&
                       res.highestTimeVector.status === 'SUCCESS';
      const icon = res.highestTimeVector.status === 'CORRUPTED' ? '⏱️❌' : (isLocked ? '⏱️🔒' : '⏱️🔓');
      const level = this.getTimeLevel(res.highestTimeVector);

      const dateOnly = res.highestTimeVector.timestamp.split(' ')[0];
      const fullTime = res.highestTimeVector.timestamp;

      const timeSpan = this.statusBarEl.createSpan({ cls: 'provenance-time-text' });
      timeSpan.setText(icon + ' ' + dateOnly + ' (' + level + ')');
      timeSpan.style.color = this.getTimeTierColor(res.highestTimeVector);
      timeSpan.style.fontFamily = 'var(--font-monospace)';
      timeSpan.style.fontSize = '11px';

      const timeParts: string[] = [fullTime];
      if (res.highestTimeVector.source) {
        timeParts.push(res.highestTimeVector.source);
      }
      if (res.allTimeVectors.length > 1) {
        timeParts.push(res.allTimeVectors.length + " vectors");
      }
      timeParts.push("Click for details");
      timeSpan.setAttribute('aria-label', timeParts.join(' · '));
    }
  }
}
