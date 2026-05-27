// Modal: car search with autocomplete + manual entry fallback.
import { CARS, MIN_CAR_PRICE } from './data/cars.js';
import { store } from './store.js';
import { fmtEUR, escapeHtml, norm } from './util.js';
import { brandBadgeHTML } from './brands.js';

const $ = (sel, root = document) => root.querySelector(sel);

function allCars() {
  // user-added customs first → so they appear ranked higher in matches
  return [...store.getCustomCars(), ...CARS];
}

function search(q) {
  const nq = norm(q);
  if (!nq) return [];
  const tokens = nq.split(' ').filter(Boolean);
  const all = allCars();
  const scored = [];
  for (const c of all) {
    const hay = norm(`${c.brand} ${c.model}`);
    if (!tokens.every(t => hay.includes(t))) continue;
    // simple score: prefix-match on brand wins
    let score = 0;
    if (hay.startsWith(nq)) score += 50;
    if (norm(c.brand).startsWith(tokens[0])) score += 20;
    score += hay.length - nq.length; // prefer shorter matches
    scored.push({ car: c, score });
  }
  scored.sort((a, b) => a.score - b.score);
  // de-dupe by brand|model (custom takes priority because it comes first)
  const seen = new Set();
  const out = [];
  for (const { car } of scored) {
    const k = `${norm(car.brand)}|${norm(car.model)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(car);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Open the car search modal.
 * @param {string} title  e.g. "Auto für Moritz eintragen"
 * @returns {Promise<{brand,model,price,emoji}|null>}
 */
export function openCarSearch(title) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    root.hidden = false;
    root.innerHTML = '';
    const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div'); modal.className = 'modal';
    modal.innerHTML = `
      <button class="icon-btn modal-close" aria-label="Schließen">✕</button>
      <h2>${escapeHtml(title)}</h2>
      <div class="car-search">
        <input class="text-input" id="cs-q" type="text" placeholder="Marke + Modell (z. B. „BMW M3“)" autocomplete="off" autofocus />
        <div class="search-results" id="cs-results"></div>
        <div class="manual-block" id="cs-manual" hidden>
          <h3>Nicht in der Liste? Manuell eintragen</h3>
          <div class="manual-row">
            <input class="text-input" id="cs-brand" placeholder="Marke" maxlength="30" />
            <input class="text-input" id="cs-model" placeholder="Modell" maxlength="40" />
          </div>
          <div class="price-input-wrap">
            <input class="text-input" id="cs-price" inputmode="numeric" placeholder="Preis (mind. 50.000 €)" />
            <span class="euro">€</span>
          </div>
          <div class="price-hint" id="cs-price-hint" hidden>Mindestpreis 50.000 € — bei MEINS! zählen nur teure Autos.</div>
          <button class="primary" id="cs-save">Eintragen</button>
        </div>
        <button class="secondary" id="cs-toggle-manual">Anderes Auto eintragen</button>
      </div>
    `;
    root.append(backdrop, modal);

    const close = (val) => {
      root.hidden = true; root.innerHTML = '';
      document.removeEventListener('keydown', escHandler);
      resolve(val);
    };
    const escHandler = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', escHandler);
    backdrop.addEventListener('click', () => close(null));
    $('.modal-close', modal).addEventListener('click', () => close(null));

    const q = $('#cs-q', modal);
    const results = $('#cs-results', modal);
    const manual = $('#cs-manual', modal);
    const toggle = $('#cs-toggle-manual', modal);

    function renderResults(list) {
      if (!list.length) {
        results.innerHTML = q.value
          ? `<div class="search-empty">Kein Treffer. Du kannst das Auto manuell eintragen.</div>`
          : '';
        return;
      }
      results.innerHTML = '';
      list.forEach(c => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'search-row';
        row.innerHTML = `
          ${brandBadgeHTML(c.brand, 'sm')}
          <div>
            <div class="nm">${escapeHtml(c.brand)} ${escapeHtml(c.model)}</div>
            ${c.custom ? `<div class="meta">Eigenes Auto</div>` : ''}
          </div>
          <div class="pr">${fmtEUR(c.price)}</div>
        `;
        row.addEventListener('click', () => close({
          brand: c.brand, model: c.model, price: Number(c.price) || 0,
          emoji: c.emoji || '🚗', custom: !!c.custom,
        }));
        results.appendChild(row);
      });
    }

    q.addEventListener('input', () => renderResults(search(q.value)));
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const list = search(q.value);
        if (list[0]) {
          const c = list[0];
          close({ brand: c.brand, model: c.model, price: Number(c.price) || 0, emoji: c.emoji || '🚗', custom: !!c.custom });
        }
      }
    });

    toggle.addEventListener('click', () => {
      const show = manual.hidden;
      manual.hidden = !show;
      toggle.textContent = show ? '🔍 Zurück zur Suche' : 'Anderes Auto eintragen';
      if (show) {
        // pre-fill from query
        const parts = (q.value || '').trim().split(/\s+/);
        if (parts.length) {
          $('#cs-brand', modal).value = parts[0] || '';
          $('#cs-model', modal).value = parts.slice(1).join(' ');
        }
        $('#cs-brand', modal).focus();
      }
    });

    $('#cs-save', modal).addEventListener('click', () => {
      const brand = $('#cs-brand', modal).value.trim();
      const model = $('#cs-model', modal).value.trim();
      const priceRaw = $('#cs-price', modal).value.replace(/[^\d]/g, '');
      const price = parseInt(priceRaw, 10);
      if (!brand || !model) { $('#cs-brand', modal).focus(); return; }
      if (!price || price < MIN_CAR_PRICE) {
        const hint = $('#cs-price-hint', modal);
        if (hint) hint.hidden = false;
        $('#cs-price', modal).focus();
        return;
      }
      const car = { brand, model, price, emoji: '🚗', custom: true };
      // Save to local DB so it shows up next time
      store.addCustomCar(car);
      close(car);
    });

    // Initial focus + show suggestions empty
    setTimeout(() => q.focus(), 50);
  });
}
