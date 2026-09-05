import { Plugin, Modal, App, Setting } from 'obsidian';
import { VerificationResult, EpistemicTier, TimeVector, CheckResult } from '../types';

export class ProvenanceModal extends Modal {
  result: VerificationResult;
  plugin: Plugin;

  constructor(app: App, plugin: Plugin, result: VerificationResult) {
    super(app);
    this.plugin = plugin;
    this.result = result;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('provenance-inspector-modal');

    contentEl.createEl('h2', { text: this.result.statusEmoji + " Provenance Epistemic Inspector" });

    // Status Banner (Green for Human Signed #10b981)
    const badgeContainer = contentEl.createDiv({ cls: 'provenance-tier-badge' });
    badgeContainer.style.backgroundColor = this.result.statusColor + '22';
    badgeContainer.style.border = '1px solid ' + this.result.statusColor;
    badgeContainer.style.color = this.result.statusColor;
    badgeContainer.style.padding = '6px 12px';
    badgeContainer.style.borderRadius = '6px';
    badgeContainer.style.fontWeight = 'bold';
    badgeContainer.style.marginBottom = '12px';
    badgeContainer.setText("[STATUS: " + this.result.statusLabel.toUpperCase() + "]");

    new Setting(contentEl)
      .setName('Epistemic Tier')
      .setDesc(this.getTierDescription(this.result.tier));

    // ---------------------------------------------------------------- SIGNATURE
    const r = this.result;

    const scopeCheck: CheckResult | undefined = r.scope
      ? ((r.tier === EpistemicTier.TIER_BREACH && /scope/i.test(r.statusLabel))
          ? { outcome: 'INVALID', reason: 'this signature was made for another artifact' }
          : { outcome: 'VALID' })
      : undefined;

    const sigBody = this.section(
      contentEl, 'Signature',
      (r.signerDetails && r.signerDetails.length)
        ? r.signerDetails.length + (r.signerDetails.length === 1 ? ' signer' : ' signers')
        : 'no signers',
      this.rollup([
        ...(r.signerDetails || []).map(s => s.validAtSigning),
        scopeCheck,
        (r.signerDetails && r.signerDetails.length)
          ? { outcome: 'VALID' as const }
          : { outcome: 'INVALID' as const, reason: 'no signatures recorded' }
      ])
    );

    if (r.payloadVersion || r.attestationCount !== undefined) {
      const bits: string[] = [];
      if (r.payloadVersion) bits.push('Bundle ' + r.payloadVersion);
      if (r.attestationCount !== undefined) {
        bits.push(r.attestationCount + (r.attestationCount === 1 ? ' attestation' : ' attestations'));
      }
      this.row(sigBody, 'Format', bits.join(' · '));
    }

    if (r.signerDetails && r.signerDetails.length) {
      for (const s of r.signerDetails) {
        // Each signer collapses to identity + verdict; keys and dates on demand.
        const holder = sigBody.createEl('details', { cls: 'provenance-signer' });
        holder.style.padding = '6px 0';
        holder.style.borderTop = '1px solid var(--background-modifier-border)';
        const head = holder.createEl('summary');
        head.style.cursor = 'pointer';
        head.style.display = 'flex';
        head.style.alignItems = 'center';
        head.style.gap = '8px';
        head.style.flexWrap = 'wrap';
        head.style.listStyle = 'none';
        const who = head.createSpan({ text: s.identity });
        who.style.fontWeight = '600';
        head.createSpan({ text: s.method }).style.opacity = '0.65';
        const sv = this.outcomeStyle((s.validAtSigning || { outcome: 'VALID' }).outcome);
        const sb = head.createSpan({ text: sv.mark });
        sb.style.color = sv.colour;
        sb.style.fontWeight = '700';
        const card = holder.createDiv();
        card.style.marginTop = '6px';
        if (s.role) this.tag(head, s.role);
        // The human-in-the-loop question, which the panel could not previously answer.
        this.tag(head, s.unattended ? 'unattended key' : 'human-held key', s.unattended ? '#f59e0b' : '#10b981');

        // An identity is a claim; the fingerprint is what was checked.
        this.row(card, 'Fingerprint', s.fingerprint || 'not recorded in bundle or registry', true);
        if (s.expires) {
          this.row(card, 'Key valid until', s.expires);
          if (s.validAtSigning) this.check(card, 'Valid when signed', s.validAtSigning);
        }
      }
    } else {
      this.row(sigBody, 'Signers', 'none recorded');
    }

    if (r.scope) {
      this.row(sigBody, 'Signed scope', r.scope, true);
      // A signature can be authentic and still be for a different document.
      if (scopeCheck) this.check(sigBody, 'Scope matches location', scopeCheck);
    }

    // --------------------------------------------------------------------- FILE
    const digestCheck: CheckResult = r.sealedHash
      ? (r.sealedHash === r.currentHash
          ? { outcome: 'VALID' }
          : { outcome: 'INVALID', reason: 'content has changed since it was sealed' })
      : { outcome: 'INDETERMINATE', reason: 'no sealed digest recorded to compare against' };

    const fileBody = this.section(
      contentEl, 'File',
      r.sealedHash ? (r.sealedHash === r.currentHash ? 'digest matches' : 'digest differs') : 'no sealed digest',
      digestCheck
    );
    this.row(fileBody, 'Target', this.formatDisplayPath(r.filePath));

    /*
     * Digest comparison, made readable at a glance.
     *
     * Two 64-character hex strings stacked in identical grey ask the reader to
     * diff them by eye, which nobody does - so the single most important fact in
     * this panel, whether the content still matches what was sealed, was the
     * hardest thing on screen to see. Colour and a verdict line carry it now;
     * the digests remain in full underneath for anyone who wants to check.
     */
    const sealed = this.result.sealedHash;
    const current = this.result.currentHash;
    const matches = !!sealed && sealed === current;

    if (sealed) {
      const verdict = fileBody.createDiv({ cls: 'provenance-digest-verdict' });
      verdict.style.margin = '12px 0 4px';
      verdict.style.padding = '8px 12px';
      verdict.style.borderRadius = '6px';
      verdict.style.fontWeight = '600';
      verdict.style.fontFamily = 'var(--font-monospace)';
      verdict.style.fontSize = '13px';
      verdict.style.border = '1px solid ' + (matches ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)');
      verdict.style.background = matches ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)';
      verdict.style.color = matches ? '#10b981' : '#ef4444';
      verdict.setText(matches
        ? '\u2713  DIGEST MATCH \u00b7 content is byte-identical to what was sealed'
        : '\u2717  DIGEST MISMATCH \u00b7 content has changed since it was sealed');
    }

    const digestColor = sealed ? (matches ? '#10b981' : '#ef4444') : '';

    const cur = new Setting(fileBody)
      .setName('Current SHA-256 Digest')
      .setDesc(current);
    if (digestColor) {
      (cur.descEl as HTMLElement).style.color = digestColor;
      (cur.descEl as HTMLElement).style.fontFamily = 'var(--font-monospace)';
    }

    if (sealed) {
      const sld = new Setting(fileBody)
        .setName('Sealed SHA-256 Digest')
        .setDesc(sealed);
      (sld.descEl as HTMLElement).style.color = digestColor;
      (sld.descEl as HTMLElement).style.fontFamily = 'var(--font-monospace)';
    }

    /*
     * Without this line a reader runs sha256sum, gets a different number, and
     * reports a bug. The digest is over canonical bytes, not file bytes.
     */
    const note = fileBody.createDiv({
      text: 'Digests are taken over canonical bytes — CRLF normalised to LF and Unicode NFC — so they will not match a raw sha256sum of the file on Windows.'
    });
    note.style.fontSize = '11px';
    note.style.opacity = '0.7';
    note.style.marginTop = '6px';
    note.style.lineHeight = '1.5';

    if (this.result.sidecarPath) {
      // Sidecar deletion is an undetected threat; showing the path makes absence legible.
      this.row(fileBody, 'Sidecar', this.formatDisplayPath(this.result.sidecarPath), true);
    }

    // ---------------------------------------------------------------- TIMESTAMP
    const tsBody = this.section(
      contentEl, 'Timestamp',
      this.result.highestTimeVector
        ? (this.result.highestTimeVector.tier.replace('_', ' ') + ' · ' + this.result.highestTimeVector.timestamp)
        : 'no timestamp',
      this.rollup([
        this.result.tokenVerification,
        this.result.highestTimeVector
          ? (this.result.highestTimeVector.status === 'SUCCESS'
              ? { outcome: 'VALID' as const }
              : { outcome: 'INVALID' as const, reason: 'highest timestamp vector did not verify' })
          : { outcome: 'INDETERMINATE' as const, reason: 'no timestamp vectors recorded' }
      ])
    );

    // ⏱️ Highest Assurance Timestamp Card (Styled by Level: Green L1/L2, Amber L3, Slate L4)
    const highest = this.result.highestTimeVector;
    const cardStyle = this.getTimestampCardStyle(highest);

    const timeCard = tsBody.createDiv({ cls: 'provenance-time-card' });
    timeCard.style.marginTop = '12px';
    timeCard.style.padding = '10px 14px';
    timeCard.style.borderRadius = '6px';
    timeCard.style.backgroundColor = cardStyle.bg;
    timeCard.style.border = cardStyle.border;
    timeCard.style.lineHeight = '1.6';
    timeCard.style.fontSize = '12px';

    const title = timeCard.createEl('div', { text: cardStyle.icon + ' ' + cardStyle.titleText, cls: 'provenance-time-title' });
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    title.style.fontSize = '13px';
    title.style.color = cardStyle.titleColor;

    if (highest) {
      const infoBox = timeCard.createDiv({ cls: 'provenance-time-lines' });
      infoBox.style.display = 'flex';
      infoBox.style.flexDirection = 'column';
      infoBox.style.gap = '2px';

      const line1 = infoBox.createDiv();
      line1.createSpan({ text: 'Timestamp: ' }).style.fontWeight = 'bold';
      line1.createSpan({ text: highest.timestamp }).style.fontFamily = 'var(--font-monospace)';

      const line2 = infoBox.createDiv();
      line2.createSpan({ text: 'Source Authority: ' }).style.fontWeight = 'bold';
      line2.createSpan({ text: highest.source + ' (' + highest.method + ')' });

      const line3 = infoBox.createDiv();
      line3.createSpan({ text: 'Security Level: ' }).style.fontWeight = 'bold';
      line3.createSpan({ text: highest.securityLevel });

      if (highest.fallbackFrom) {
        const fbAlert = timeCard.createDiv({ cls: 'provenance-fallback-alert' });
        fbAlert.style.marginTop = '8px';
        fbAlert.style.padding = '6px 10px';
        fbAlert.style.borderRadius = '4px';
        fbAlert.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        fbAlert.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        fbAlert.style.color = '#fca5a5';
        fbAlert.style.fontSize = '11px';
        fbAlert.style.lineHeight = '1.4';
        fbAlert.setText(`⚠️ Degraded from L1 Primary: ${highest.fallbackReason || 'Primary L1 token corrupted'}`);
      }
    } else {
      timeCard.createEl('p', { text: 'No timestamp vectors recorded.' });
    }

    // 📋 Expandable Multi-Vector Timestamp Audit (<details>)
    /*
     * The distinction the timestamp card cannot make on its own. A green tier badge
     * means a token was obtained and its digest matched - not that the TSA's
     * signature over it was verified. Saying so here is the difference between
     * reporting a check and implying one.
     */
    if (this.result.tokenVerification) {
      const tv = tsBody.createDiv();
      tv.style.marginTop = '8px';
      this.check(tv, 'Token signature verified', this.result.tokenVerification);
    }

    if (this.result.allTimeVectors.length > 0) {
      const details = tsBody.createEl('details', { cls: 'provenance-vectors-accordion' });
      details.style.marginTop = '14px';
      details.style.border = '1px solid var(--background-modifier-border)';
      details.style.borderRadius = '6px';
      details.style.overflow = 'hidden';

      const summary = details.createEl('summary');
      summary.style.cursor = 'pointer';
      summary.style.padding = '8px 12px';
      summary.style.backgroundColor = 'var(--background-secondary)';
      summary.style.fontWeight = 'bold';
      summary.style.fontSize = '12px';
      summary.setText("▶ Multi-Vector Timestamp Audit (" + this.result.allTimeVectors.length + " Vectors · Click to Expand)");

      const container = details.createDiv({ cls: 'provenance-table-container' });
      container.style.padding = '8px';
      container.style.fontSize = '11px';

      const table = container.createEl('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.fontSize = '11px';
      table.style.fontFamily = 'var(--font-monospace)';

      const thead = table.createEl('thead');
      const headerRow = thead.createEl('tr');
      headerRow.style.borderBottom = '2px solid var(--background-modifier-border)';
      headerRow.style.fontSize = '10px';
      headerRow.style.textTransform = 'uppercase';
      headerRow.createEl('th', { text: 'Tier' });
      headerRow.createEl('th', { text: 'Authority / Server' });
      headerRow.createEl('th', { text: 'Method' });
      headerRow.createEl('th', { text: 'Time (YYYY-MM-DD HH:mm:ss)' });
      headerRow.createEl('th', { text: 'Status' });

      const tbody = table.createEl('tbody');
      for (const vec of this.result.allTimeVectors) {
        const row = tbody.createEl('tr');
        row.style.borderBottom = '1px solid var(--background-modifier-border)';

        // Color coding by tier: Green (L1), Yellow (L2), Amber (L3), Black/Slate (L4)
        const tierStyle = this.getTierRowStyle(vec.tier, vec);
        const isError = vec.status !== 'SUCCESS';

        if (isError) {
          row.style.backgroundColor = 'rgba(39, 39, 42, 0.4)';
          row.style.borderLeft = '4px solid #52525b';
          row.style.opacity = '0.55';
        } else {
          row.style.backgroundColor = tierStyle.bg;
          row.style.borderLeft = tierStyle.borderLeft;
        }

        // Replace the badge with the star for whichever timestamp is being used as highest
        let tierBadgeText = tierStyle.badge;
        if (vec.isHighest) {
          tierBadgeText = tierBadgeText.replace(/^[^\s]+/, '⭐');
        }

        const tierCell = row.createEl('td', { text: tierBadgeText });
        tierCell.style.padding = '4px 6px';
        tierCell.style.fontWeight = 'bold';
        tierCell.style.color = isError ? '#71717a' : (vec.isHighest ? '#fbbf24' : tierStyle.color);

        const srcCell = row.createEl('td', { text: vec.source });
        srcCell.style.padding = '4px 6px';
        srcCell.style.fontWeight = vec.isHighest ? 'bold' : 'normal';
        if (isError) srcCell.style.color = '#71717a';

        const methodCell = row.createEl('td', { text: vec.method });
        methodCell.style.padding = '4px 6px';
        if (isError) methodCell.style.color = '#71717a';

        const timeCell = row.createEl('td', { text: vec.timestamp });
        timeCell.style.padding = '4px 6px';
        timeCell.style.whiteSpace = 'nowrap';
        if (isError) timeCell.style.color = '#71717a';

        const statusCell = row.createEl('td');
        statusCell.style.padding = '4px 6px';
        if (vec.status === 'SUCCESS') {
          statusCell.setText('✅ OK');
          statusCell.style.color = '#10b981';
        } else if (vec.status === 'CORRUPTED') {
          statusCell.setText('🚨 BAD');
          statusCell.style.color = '#ef4444';
        } else {
          statusCell.setText('❌ ERR');
          statusCell.style.color = '#71717a';
        }
      }
    }

    // ---------------------------------------------------------------- AUTHORITY
    // Signature, File and Timestamp all answer "what is here". None answers why the
    // signer should be trusted at all, which is a separate question with its own
    // failure mode: a registry nobody signed authorises nothing.
    const authBody = this.section(
      contentEl, 'Authority', 'Why this signer counts as authorised',
      this.rollup([this.result.registryAttested, this.result.revocation])
    );
    if (this.result.registryAttested) {
      this.check(authBody, 'Signer registry attested by root', this.result.registryAttested);
    }
    if (this.result.trustAnchorPath) {
      this.row(authBody, 'Trust anchor', this.formatDisplayPath(this.result.trustAnchorPath), true);
    }
    if (this.result.revocation) {
      // Silence on revocation reads as "checked and fine". It is not checked at all.
      this.check(authBody, 'Revocation', this.result.revocation);
    }

    const caveat = contentEl.createDiv({
      text: 'A valid seal establishes authorship, integrity and time. It does not establish that the content is correct — a false statement, signed, is a verified false statement.'
    });
    caveat.style.marginTop = '14px';
    caveat.style.paddingTop = '10px';
    caveat.style.borderTop = '1px solid var(--background-modifier-border)';
    caveat.style.fontSize = '11px';
    caveat.style.opacity = '0.7';
    caveat.style.lineHeight = '1.5';

    if (this.result.error) {
      const errEl = contentEl.createDiv({ cls: 'provenance-error-box' });
      errEl.style.color = '#ef4444';
      errEl.style.backgroundColor = '#fee2e222';
      errEl.style.padding = '8px 12px';
      errEl.style.borderRadius = '6px';
      errEl.style.marginTop = '14px';
      errEl.setText("⚠️ Error / Breach Detail: " + this.result.error);
    }

    const actions = contentEl.createDiv({ cls: 'provenance-modal-actions' });
    actions.style.marginTop = '16px';
    actions.style.display = 'flex';
    actions.style.gap = '10px';

    const copyBtn = actions.createEl('button', { text: 'Copy SHA-256' });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.result.currentHash);
      copyBtn.setText('Copied!');
      setTimeout(() => copyBtn.setText('Copy SHA-256'), 1500);
    });
  }

  /*
   * Aggregate several checks into one headline, per section 7.3 of the draft.
   *
   * Any INVALID makes the whole thing INVALID. Otherwise an unevaluated check keeps
   * the section INDETERMINATE rather than letting it read as clean - a summary that
   * says VALID while a check underneath it was never made is the failure this whole
   * vocabulary exists to prevent.
   */
  rollup(checks: (CheckResult | undefined)[]): CheckResult {
    const present = checks.filter((c): c is CheckResult => !!c);
    if (!present.length) return { outcome: 'INDETERMINATE', reason: 'nothing to check' };
    const bad = present.find(c => c.outcome === 'INVALID');
    if (bad) return bad;
    const unknown = present.find(c => c.outcome === 'INDETERMINATE' || c.outcome === 'UNSUPPORTED');
    if (unknown) return { outcome: unknown.outcome, reason: unknown.reason };
    return { outcome: 'VALID' };
  }

  /*
   * A collapsible group carrying its own verdict.
   *
   * The headline is the point: closed, the panel still answers every question it can
   * answer, because each summary states its section's outcome. Detail is one click
   * away per section rather than all-or-nothing, so inspecting one thing does not
   * mean scrolling past three others.
   */
  section(parent: HTMLElement, title: string, subtitle?: string, verdict?: CheckResult, open = false): HTMLElement {
    const wrap = parent.createEl('details', { cls: 'provenance-section' });
    wrap.style.marginTop = '12px';
    wrap.style.border = '1px solid var(--background-modifier-border)';
    wrap.style.borderRadius = '6px';
    wrap.style.padding = '8px 12px';
    if (open) wrap.setAttr('open', 'true');

    const sum = wrap.createEl('summary');
    sum.style.cursor = 'pointer';
    sum.style.display = 'flex';
    sum.style.alignItems = 'baseline';
    sum.style.gap = '10px';
    sum.style.listStyle = 'none';
    sum.style.outline = 'none';

    const h = sum.createSpan({ text: title.toUpperCase() });
    h.style.fontSize = '11px';
    h.style.fontWeight = '700';
    h.style.letterSpacing = '0.12em';
    h.style.flex = '0 0 auto';

    if (verdict) {
      const style = this.outcomeStyle(verdict.outcome);
      const badge = sum.createSpan({ text: style.mark + ' ' + verdict.outcome });
      badge.style.color = style.colour;
      badge.style.fontWeight = '600';
      badge.style.fontFamily = 'var(--font-monospace)';
      badge.style.fontSize = '11px';
    }

    if (subtitle) {
      const s = sum.createSpan({ text: subtitle });
      s.style.fontSize = '11px';
      s.style.opacity = '0.5';
      s.style.marginLeft = 'auto';
      s.style.textAlign = 'right';
    }

    const body = wrap.createDiv();
    body.style.marginTop = '8px';
    body.style.paddingTop = '8px';
    body.style.borderTop = '1px solid var(--background-modifier-border)';
    return body;
  }

  outcomeStyle(outcome: string): { colour: string; mark: string } {
    const palette: Record<string, { colour: string; mark: string }> = {
      VALID:         { colour: '#10b981', mark: '✓' },
      INVALID:       { colour: '#ef4444', mark: '✗' },
      INDETERMINATE: { colour: '#94a3b8', mark: '?' },
      UNSUPPORTED:   { colour: '#94a3b8', mark: '—' }
    };
    return palette[outcome] || palette.INDETERMINATE;
  }

  row(parent: HTMLElement, name: string, value: string, mono = false): void {
    const line = parent.createDiv();
    line.style.display = 'flex';
    line.style.gap = '10px';
    line.style.padding = '3px 0';
    line.style.fontSize = '12px';
    line.style.alignItems = 'baseline';
    const k = line.createSpan({ text: name });
    k.style.opacity = '0.65';
    k.style.flex = '0 0 132px';
    const v = line.createSpan({ text: value });
    v.style.flex = '1';
    v.style.wordBreak = 'break-all';
    if (mono) v.style.fontFamily = 'var(--font-monospace)';
  }

  tag(parent: HTMLElement, text: string, color?: string): void {
    const t = parent.createSpan({ text });
    t.style.fontSize = '10px';
    t.style.textTransform = 'uppercase';
    t.style.letterSpacing = '0.06em';
    t.style.padding = '1px 6px';
    t.style.borderRadius = '3px';
    t.style.border = '1px solid ' + (color || 'var(--background-modifier-border)');
    if (color) t.style.color = color;
    t.style.opacity = '0.9';
  }

  /*
   * One check, rendered in its own outcome state.
   *
   * INDETERMINATE is deliberately not red and not green. It means the verifier did
   * not look, which is neither a pass nor a finding, and colouring it as either is
   * the defect this vocabulary exists to remove.
   */
  check(parent: HTMLElement, name: string, res: CheckResult): void {
    const style = this.outcomeStyle(res.outcome);

    const line = parent.createDiv();
    line.style.padding = '4px 0';
    line.style.fontSize = '12px';

    const head = line.createDiv();
    head.style.display = 'flex';
    head.style.gap = '8px';
    head.style.alignItems = 'baseline';
    const k = head.createSpan({ text: name });
    k.style.opacity = '0.65';
    k.style.flex = '0 0 132px';
    const badge = head.createSpan({ text: style.mark + ' ' + res.outcome });
    badge.style.color = style.colour;
    badge.style.fontWeight = '600';
    badge.style.fontFamily = 'var(--font-monospace)';
    badge.style.fontSize = '11px';

    // Requirement 2 of section 7: an unevaluated check must say why.
    if (res.reason) {
      const why = line.createDiv({ text: res.reason });
      why.style.marginLeft = '142px';
      why.style.fontSize = '11px';
      why.style.opacity = '0.6';
      why.style.lineHeight = '1.45';
    }
  }

  getTierRowStyle(tier: string, vec?: TimeVector): { bg: string; borderLeft: string; color: string; badge: string } {
    if (vec && vec.status === 'CORRUPTED') {
      return {
        bg: 'rgba(239, 68, 68, 0.14)',
        borderLeft: '4px solid #ef4444',
        color: '#ef4444',
        badge: '🚨 ' + (tier.includes('L1') ? 'L1 Corrupted' : 'Token Corrupted')
      };
    }
    if (tier.includes('L1')) {
      return {
        bg: 'rgba(16, 185, 129, 0.12)',
        borderLeft: '4px solid #10b981',
        color: '#10b981',
        badge: '🥇 L1 Primary'
      };
    } else if (tier.includes('L2')) {
      return {
        bg: 'rgba(234, 179, 8, 0.12)',
        borderLeft: '4px solid #eab308',
        color: '#eab308',
        badge: '🥈 L2 Fallback'
      };
    } else if (tier.includes('L3')) {
      return {
        bg: 'rgba(245, 158, 11, 0.14)',
        borderLeft: '4px solid #f59e0b',
        color: '#f59e0b',
        badge: '🥉 L3 Network'
      };
    } else {
      // L4 Host / Front Matter / Local File Time
      let badge = '🖥️ L4 Host';
      if (vec && vec.source === 'Front Matter Date') {
        badge = '📝 L4 Front Matter';
      } else if (vec && vec.source === 'Local File Time') {
        badge = '📄 L4 File Time';
      }

      return {
        bg: 'rgba(15, 23, 42, 0.70)',
        borderLeft: '4px solid #475569',
        color: '#94a3b8',
        badge
      };
    }
  }

  getTimestampCardStyle(highest?: TimeVector): {
    bg: string;
    border: string;
    titleColor: string;
    icon: string;
    titleText: string;
  } {
    if (!highest) {
      return {
        bg: 'var(--background-secondary)',
        border: '1px solid var(--background-modifier-border)',
        titleColor: 'var(--text-muted)',
        icon: '⏱️🔓',
        titleText: 'No Certified Timestamp'
      };
    }

    if (highest.fallbackFrom) {
      const isL2 = highest.tier.includes('L2');
      const isL3 = highest.tier.includes('L3');
      return {
        bg: isL2 ? 'rgba(234, 179, 8, 0.12)' : (isL3 ? 'rgba(245, 158, 11, 0.14)' : 'rgba(15, 23, 42, 0.70)'),
        border: isL2 ? '1px solid #eab308' : (isL3 ? '1px solid #f59e0b' : '1px solid #475569'),
        titleColor: isL2 ? '#eab308' : (isL3 ? '#f59e0b' : '#94a3b8'),
        icon: '⏱️🔓',
        titleText: isL2
          ? 'Degraded Fallback Timestamp (L2 Cryptographic Fallback)'
          : (isL3
            ? 'Degraded Fallback Timestamp (L3 TLS Authenticated)'
            : 'Degraded Fallback Timestamp (L4 Host Time)')
      };
    }

    if (highest.status === 'CORRUPTED') {
      return {
        bg: 'rgba(239, 68, 68, 0.12)',
        border: '1px solid #ef4444',
        titleColor: '#ef4444',
        icon: '⏱️❌',
        titleText: 'Corrupted Timestamp Token (Cryptographic Check Failed)'
      };
    }

    if (highest.status !== 'SUCCESS') {
      return {
        bg: 'rgba(239, 68, 68, 0.12)',
        border: '1px solid #ef4444',
        titleColor: '#ef4444',
        icon: '⏱️❌',
        titleText: 'Timestamp Verification Failed'
      };
    }

    const tier = highest.tier;
    if (tier.includes('L1') || tier.includes('L2')) {
      return {
        bg: 'rgba(16, 185, 129, 0.12)',
        border: '1px solid #10b981',
        titleColor: '#10b981',
        icon: '⏱️🔒',
        titleText: tier.includes('L1')
          ? 'Certified Timestamp (L1 Cryptographic Primary)'
          : 'Certified Timestamp (L2 Cryptographic Fallback)'
      };
    } else if (tier.includes('L3')) {
      return {
        bg: 'rgba(245, 158, 11, 0.14)',
        border: '1px solid #f59e0b',
        titleColor: '#f59e0b',
        icon: '⏱️🔓',
        titleText: 'Network Consensus Timestamp (L3 TLS Authenticated)'
      };
    } else {
      let title = 'Host / Unauthenticated Timestamp (L4 Metadata)';
      if (highest.source === 'Front Matter Date') {
        title = 'Author Front Matter Date (Declared in YAML)';
      } else if (highest.source === 'Local File Time') {
        title = 'Local Filesystem Time (stat.mtime)';
      }

      return {
        bg: 'rgba(15, 23, 42, 0.70)',
        border: '1px solid #475569',
        titleColor: '#94a3b8',
        icon: '⏱️🔓',
        titleText: title
      };
    }
  }

  getTierDescription(tier: EpistemicTier): string {
    switch (tier) {
      case EpistemicTier.TIER_1_HUMAN_SOVEREIGN:
        return 'Tier 1: Sovereign Human Root (Passphrase required. Invariant ground truth; agents hard-blocked from overriding).';
      case EpistemicTier.TIER_2_AGENT_ATTESTED:
        return 'Tier 2: Delegated Agent Attestation (Proves machine origin, temporal recency, and zero post-generation drift).';
      case EpistemicTier.TIER_DUAL_RATIFIED:
        return 'Tier 1+2: Dual-Attested (Collaborative milestone: proposed by agent, ratified by human architect root).';
      case EpistemicTier.TIER_3_WORKING_DRAFT:
        return 'Tier 3: Working Draft (Unsealed scratch work. No epistemic authority).';
      case EpistemicTier.TIER_BREACH:
        return 'DEFECT: Integrity Breach (Live disk content has mutated since sealing or token is corrupted).';
    }
  }

  formatDisplayPath(fullPath: string): string {
    if (!fullPath) return '';
    const normalized = fullPath.replace(/\\/g, '/');

    // If file is inside Demo folder, always render starting from ./Demo/
    const demoIdx = normalized.indexOf('/Demo/');
    if (demoIdx !== -1) {
      return '.' + normalized.slice(demoIdx);
    }
    if (normalized.startsWith('Demo/')) {
      return './' + normalized;
    }

    let vaultBase = '';
    try {
      vaultBase = ((this.app.vault.adapter as any).getBasePath ? (this.app.vault.adapter as any).getBasePath() : '').replace(/\\/g, '/');
    } catch (e) {}

    if (vaultBase && normalized.startsWith(vaultBase)) {
      let rel = normalized.slice(vaultBase.length);
      if (!rel.startsWith('/')) rel = '/' + rel;
      if (vaultBase.endsWith('/Demo')) {
        return './Demo' + rel;
      }
      return '.' + rel;
    }

    const vIdx = normalized.lastIndexOf('/Vault/');
    if (vIdx !== -1) {
      return '.' + normalized.slice(vIdx + '/Vault'.length);
    }

    const dIdx = normalized.indexOf(':/');
    if (dIdx !== -1) {
      const parts = normalized.slice(dIdx + 2).split('/').filter(Boolean);
      const demoIdx2 = parts.findIndex(p => p.toLowerCase() === 'demo');
      if (demoIdx2 !== -1) {
        return './' + parts.slice(demoIdx2).join('/');
      }
      return './' + (parts.length > 1 ? parts.slice(1).join('/') : parts[0]);
    }

    if (!normalized.startsWith('.')) {
      return normalized.startsWith('/') ? '.' + normalized : './' + normalized;
    }

    return normalized;
  }

  onClose() {
    this.contentEl.empty();
  }
}
