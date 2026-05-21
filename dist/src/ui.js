// MEINS! — UI-Helfer: Custom Confirm-Dialog, Konfetti, Cooldown-Ring.

/**
 * Custom Confirm-Dialog im Markenstil. Ersetzt window.confirm.
 * @param {{title:string, body?:string, ok?:string, cancel?:string, danger?:boolean}} opts
 * @returns {Promise<boolean>}
 */
export function customConfirm(opts) {
  const { title, body = '', ok = 'OK', cancel = 'Abbrechen', danger = false } = opts || {};
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'mc-confirm-backdrop';
    wrap.innerHTML = `
      <div class="mc-confirm" role="dialog" aria-modal="true" aria-labelledby="mc-title">
        <div class="mc-confirm-flag" aria-hidden="true"></div>
        <div class="mc-confirm-body">
          <h3 id="mc-title" class="mc-confirm-title">${escapeHtml(title)}</h3>
          ${body ? `<p class="mc-confirm-text">${escapeHtml(body)}</p>` : ''}
          <div class="mc-confirm-actions">
            <button type="button" class="mc-btn mc-btn--ghost" data-act="cancel">${escapeHtml(cancel)}</button>
            <button type="button" class="mc-btn ${danger ? 'mc-btn--danger' : 'mc-btn--primary'}" data-act="ok">${escapeHtml(ok)}</button>
          </div>
        </div>
      </div>
    `;
    if (root.id === 'modal-root') {
      root.hidden = false;
      root.appendChild(wrap);
    } else {
      document.body.appendChild(wrap);
    }

    const close = (val) => {
      wrap.classList.add('mc-confirm-leave');
      setTimeout(() => {
        wrap.remove();
        if (root.id === 'modal-root' && !root.children.length) root.hidden = true;
        resolve(val);
      }, 120);
    };

    wrap.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
    wrap.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(false); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(false); }
      if (e.key === 'Enter')  { document.removeEventListener('keydown', onKey); close(true); }
    });

    // Fokus auf primären Button
    setTimeout(() => wrap.querySelector('[data-act="ok"]')?.focus(), 30);
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Konfetti-Burst aus einem Element heraus (z. B. der gerade gefüllte Slot).
 * Kurz, performant — pure DOM, kein Canvas.
 */
export function spawnConfetti(targetEl, count = 14) {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const palette = ['#ff4d4d', '#c81e1e', '#ffd24a', '#ffffff', '#1f1f1f'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-piece';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 60 + Math.random() * 60;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 20;
    const rot = (Math.random() * 360) | 0;
    p.style.setProperty('--cx', `${cx}px`);
    p.style.setProperty('--cy', `${cy}px`);
    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--dy', `${dy}px`);
    p.style.setProperty('--rot', `${rot}deg`);
    p.style.background = palette[i % palette.length];
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

/**
 * Liefert das HTML für einen animierten Cooldown-Ring im Slot.
 * Animation läuft per CSS @keyframes mit dynamischer Dauer (remainingMs).
 */
export function cooldownRingHTML(remainingMs, totalMs) {
  const sec = Math.ceil(remainingMs / 1000);
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 1;
  const C = 226.19; // 2 * PI * 36
  const dashStart = (ratio * C).toFixed(2);
  return `
    <span class="cd-ring" style="--cd-dur:${remainingMs}ms; --cd-start:${dashStart}; --cd-circ:${C};">
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle class="cd-ring-track" cx="40" cy="40" r="36"></circle>
        <circle class="cd-ring-fill"  cx="40" cy="40" r="36"
                stroke-dasharray="${dashStart} ${C}"></circle>
      </svg>
      <span class="cd-ring-text">${sec}s</span>
    </span>
  `;
}
