// Foto-Aufnahme via versteckten <input type="file" capture="environment">,
// Resize/Compress per Canvas zu JPEG dataURL.

const MAX_DIM = 1280;     // groesste Kante
const QUALITY = 0.78;

let inputEl = null;
function getInput() {
  if (inputEl) return inputEl;
  inputEl = document.createElement('input');
  inputEl.type = 'file';
  inputEl.accept = 'image/*';
  inputEl.setAttribute('capture', 'environment');
  inputEl.style.position = 'fixed';
  inputEl.style.left = '-9999px';
  inputEl.style.top = '-9999px';
  document.body.appendChild(inputEl);
  return inputEl;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = dataUrl;
  });
}

function resizeToDataUrl(img) {
  const { width: w, height: h } = img;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = tw; canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, tw, th);
  drawWatermark(ctx, tw, th);
  return canvas.toDataURL('image/jpeg', QUALITY);
}

/** Ultra-dezenter Foto-Stempel: "MEINS · DD.MM.YY" unten rechts, kaum sichtbar. */
function drawWatermark(ctx, w, h) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
  const text = `MEINS \u00b7 ${dateStr}`;
  // Schriftgr\u00f6\u00dfe relativ zur Bildkante (ca. 1.6%)
  const fontSize = Math.max(11, Math.round(Math.min(w, h) * 0.018));
  ctx.save();
  ctx.font = `500 ${fontSize}px ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'right';
  const margin = Math.round(fontSize * 0.9);
  // Ganz feiner Schatten f\u00fcr Lesbarkeit auf hellen Hintergr\u00fcnden
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(text, w - margin, h - margin);
  ctx.restore();
}

/**
 * Opens the native camera/gallery picker and returns a compressed JPEG dataURL,
 * or null if the user cancels.
 */
export function pickAndCompressPhoto() {
  return new Promise((resolve) => {
    const input = getInput();
    let done = false;
    const cleanup = () => {
      input.removeEventListener('change', onChange);
      window.removeEventListener('focus', onFocus);
    };
    const onChange = async () => {
      if (done) return;
      done = true;
      const file = input.files && input.files[0];
      input.value = '';
      cleanup();
      if (!file) return resolve(null);
      try {
        const raw = await readFileAsDataURL(file);
        const img = await loadImage(raw);
        const out = resizeToDataUrl(img);
        resolve(out);
      } catch (e) {
        console.warn('[photo-capture]', e);
        resolve(null);
      }
    };
    // Falls User Dialog abbricht: focus-Event nach kurzer Wartezeit
    const onFocus = () => {
      setTimeout(() => {
        if (done) return;
        if (!input.files || input.files.length === 0) {
          done = true;
          cleanup();
          resolve(null);
        }
      }, 600);
    };
    input.addEventListener('change', onChange);
    window.addEventListener('focus', onFocus);
    input.click();
  });
}
