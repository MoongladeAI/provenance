import { VerificationResult, EpistemicTier } from '../types';

export class LiveBannerManager {
  static updateAll(viewEl: HTMLElement, res: VerificationResult, onClick: () => void) {
    this.updatePropertiesPill(viewEl, res, onClick);
    this.updateTopBanner(viewEl, res, onClick);
  }

  static removeAll(viewEl: HTMLElement) {
    const existingBanner = viewEl.querySelector('.provenance-top-banner');
    if (existingBanner) existingBanner.remove();

    const existingPill = viewEl.querySelector('.provenance-live-pill');
    if (existingPill) existingPill.remove();
  }

  /**
   * 1. Dynamic Property Pill in Obsidian's YAML Properties View
   * Attaches directly next to the static `provenance` frontmatter property value
   */
  static updatePropertiesPill(viewEl: HTMLElement, res: VerificationResult, onClick: () => void) {
    const propRow = viewEl.querySelector('.metadata-property[data-property-key="provenance"]');
    if (!propRow) return;

    let pill = propRow.querySelector('.provenance-live-pill') as HTMLElement;
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'provenance-live-pill';
      pill.style.marginLeft = '8px';
      pill.style.padding = '2px 8px';
      pill.style.borderRadius = '12px';
      pill.style.fontSize = '11px';
      pill.style.fontWeight = '600';
      pill.style.cursor = 'pointer';
      pill.style.display = 'inline-flex';
      pill.style.alignItems = 'center';
      pill.style.gap = '4px';
      pill.style.transition = 'all 0.15s ease';

      const valEl = propRow.querySelector('.metadata-property-value') || propRow;
      valEl.appendChild(pill);
    }

    // Always update click handler so it refers to current active note's result
    pill.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };

    pill.style.backgroundColor = res.statusColor + '22';
    pill.style.color = res.statusColor;
    pill.style.border = '1px solid ' + res.statusColor;

    let pillLabel = '';
    if (!res.verified && res.tier === EpistemicTier.TIER_BREACH) {
      pillLabel = '🚨 ' + res.statusLabel;
    } else if (!res.verified) {
      pillLabel = '📝 ' + res.statusLabel;
    } else {
      const timeLvl = res.highestTimeVector ? (
        res.highestTimeVector.tier.includes('L1') ? 'L1' :
        (res.highestTimeVector.tier.includes('L2') ? 'L2' :
        (res.highestTimeVector.tier.includes('L3') ? 'L3' : 'L4'))
      ) : '';
      pillLabel = `${res.statusEmoji} ${res.statusLabel}${timeLvl ? ' (' + timeLvl + ')' : ''}`;
    }

    pill.setText(pillLabel);
    pill.setAttribute('aria-label', `Live Cryptographic Verification: ${res.statusLabel} · Click to inspect`);
  }

  /**
   * 2. Top-of-Note Live Epistemic Banner
   * Renders a thin, full-width status card directly below the metadata header
   */
  static updateTopBanner(viewEl: HTMLElement, res: VerificationResult, onClick: () => void) {
    let banner = viewEl.querySelector('.provenance-top-banner') as HTMLElement;
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'provenance-top-banner';
      banner.style.margin = '10px 16px 14px 16px';
      banner.style.padding = '8px 14px';
      banner.style.borderRadius = '6px';
      banner.style.display = 'flex';
      banner.style.alignItems = 'center';
      banner.style.justifyContent = 'space-between';
      banner.style.fontSize = '12px';
      banner.style.cursor = 'pointer';
      banner.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.15)';
      banner.style.transition = 'all 0.15s ease';

      // Locate insertion point: after .metadata-container or at the beginning of the view
      const meta = viewEl.querySelector('.metadata-container');
      if (meta && meta.parentElement) {
        meta.parentElement.insertBefore(banner, meta.nextSibling);
      } else {
        const sView = viewEl.querySelector('.markdown-source-view') || viewEl.querySelector('.markdown-reading-view') || viewEl;
        sView.prepend(banner);
      }
    }

    // Always update click handler so it refers to current active note's result
    banner.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };

    banner.style.backgroundColor = res.statusColor + '15';
    banner.style.border = '1px solid ' + res.statusColor + '55';
    banner.style.borderLeft = '5px solid ' + res.statusColor;

    banner.empty();

    // Left side: Emoji + Status Label + Attested Time
    const left = banner.createDiv({ cls: 'provenance-banner-left' });
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';

    const iconSpan = left.createSpan();
    iconSpan.setText(res.statusEmoji);
    iconSpan.style.fontSize = '14px';

    const labelSpan = left.createSpan();
    labelSpan.setText(res.statusLabel);
    labelSpan.style.fontWeight = 'bold';
    labelSpan.style.color = res.statusColor;

    if (res.highestTimeVector && res.highestTimeVector.timestamp) {
      const sep = left.createSpan({ text: '·' });
      sep.style.opacity = '0.5';

      const timeLvl = res.highestTimeVector.tier.includes('L1') ? 'L1' : (
        res.highestTimeVector.tier.includes('L2') ? 'L2' : (
        res.highestTimeVector.tier.includes('L3') ? 'L3' : 'L4')
      );
      const isLocked = !res.highestTimeVector.fallbackFrom &&
                       (res.highestTimeVector.tier.includes('L1') || res.highestTimeVector.tier.includes('L2')) &&
                       res.highestTimeVector.status === 'SUCCESS';
      const icon = res.highestTimeVector.status === 'CORRUPTED' ? '⏱️❌' : (isLocked ? '⏱️🔒' : '⏱️🔓');
      const dateOnly = res.highestTimeVector.timestamp.split(' ')[0];
      const fallbackTag = res.highestTimeVector.fallbackFrom ? ' · Fallback' : '';

      const timeSpan = left.createSpan();
      timeSpan.setText(`${icon} ${dateOnly} (${timeLvl}${fallbackTag})`);
      timeSpan.style.fontFamily = 'var(--font-monospace)';
      timeSpan.style.fontSize = '11px';
      timeSpan.style.opacity = '0.9';
    }

    // Right side: SHA Digest + Action Button
    const right = banner.createDiv({ cls: 'provenance-banner-right' });
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '10px';

    const hashSpan = right.createSpan();
    hashSpan.setText('SHA: ' + res.currentHash.slice(0, 8));
    hashSpan.style.fontFamily = 'var(--font-monospace)';
    hashSpan.style.fontSize = '11px';
    hashSpan.style.opacity = '0.7';

    const actionBtn = right.createSpan({ text: 'Inspect ➔' });
    actionBtn.style.padding = '2px 8px';
    actionBtn.style.borderRadius = '4px';
    actionBtn.style.backgroundColor = res.statusColor + '28';
    actionBtn.style.color = res.statusColor;
    actionBtn.style.fontWeight = '600';
    actionBtn.style.fontSize = '11px';
    actionBtn.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
  }
}
