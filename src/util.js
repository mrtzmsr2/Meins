export const fmtEUR = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

export const fmtNum = (n) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n || 0);

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

export const randomId = (len = 8) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// Strip and lowercase for matching
export const norm = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
