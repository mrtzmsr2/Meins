// MEINS! — stilisierte Marken-Badges in Originalfarben.
// Hinweis: Echte Marken-Logos sind geschuetzt. Wir nutzen Initialen / Kurzformen
// in den charakteristischen Marken-Farben. Das ist rechtlich unbedenklich
// und sieht trotzdem klar nach Auto-Marke aus.

const STYLES = {
  'Volkswagen':       { label: 'VW',  bg: '#001E50', fg: '#ffffff', accent: '#00B0F0' },
  'Skoda':            { label: 'ŠK',  bg: '#0E3A2F', fg: '#ffffff', accent: '#4BA82E' },
  'Cupra':            { label: 'CU',  bg: '#1A1A1A', fg: '#D4A574', accent: '#D4A574' },
  'BMW':              { label: 'BMW', bg: '#0066B1', fg: '#ffffff', accent: '#ED1C24' },
  'Mercedes-Benz':    { label: 'MB',  bg: '#1F1F1F', fg: '#ffffff', accent: '#9FB6CD' },
  'Mercedes-AMG':     { label: 'AMG', bg: '#1F1F1F', fg: '#000000', accent: '#000000', bgGrad: 'linear-gradient(135deg,#1f1f1f 0%,#1f1f1f 50%,#000 50%,#000 100%)', altFg: '#A6E22E' },
  'Mercedes-Maybach': { label: 'M·M', bg: '#0d2240', fg: '#E8C76A', accent: '#E8C76A' },
  'Audi':             { label: 'AUDI', bg: '#000000', fg: '#ffffff', accent: '#BB0A30' },
  'Porsche':          { label: 'P',   bg: '#FFD500', fg: '#000000', accent: '#D5001C' },
  'Ferrari':          { label: 'F',   bg: '#FF2800', fg: '#FFEC00', accent: '#FFEC00' },
  'Lamborghini':      { label: 'L',   bg: '#000000', fg: '#FFD200', accent: '#FFD200' },
  'McLaren':          { label: 'McL', bg: '#FF8000', fg: '#000000', accent: '#000000' },
  'Aston Martin':     { label: 'AM',  bg: '#0E3A2F', fg: '#ffffff', accent: '#ffffff' },
  'Bentley':          { label: 'B',   bg: '#163E2D', fg: '#E1C56F', accent: '#E1C56F' },
  'Rolls-Royce':      { label: 'RR',  bg: '#1A1F33', fg: '#C8A35B', accent: '#C8A35B' },
  'Maserati':         { label: 'M',   bg: '#1F2C5C', fg: '#ffffff', accent: '#C32026' },
  'Pagani':           { label: 'PG',  bg: '#0c0c0c', fg: '#C9A55B', accent: '#C9A55B' },
  'Alfa Romeo':       { label: 'AR',  bg: '#9F1B32', fg: '#ffffff', accent: '#ffffff' },
  'Lotus':            { label: 'LO',  bg: '#005C2E', fg: '#FFD500', accent: '#FFD500' },
  'Jaguar':           { label: 'J',   bg: '#9E1B32', fg: '#ffffff', accent: '#000000' },
  'Land Rover':       { label: 'LR',  bg: '#005A30', fg: '#ffffff', accent: '#ffffff' },
  'Bugatti':          { label: 'BU',  bg: '#16213E', fg: '#E2090F', accent: '#E2090F' },
  'Koenigsegg':       { label: 'KS',  bg: '#000000', fg: '#ffffff', accent: '#ED1C24' },
  'Rimac':            { label: 'RI',  bg: '#000000', fg: '#FF4500', accent: '#FF4500' },
  'Gordon Murray':    { label: 'GMA', bg: '#0d0d0d', fg: '#9CC2D7', accent: '#9CC2D7' },
  'Hennessey':        { label: 'HE',  bg: '#1a1a1a', fg: '#FFC72C', accent: '#FFC72C' },
  'Tesla':            { label: 'T',   bg: '#000000', fg: '#E31937', accent: '#E31937' },
  'Polestar':         { label: '★',   bg: '#0E0E0E', fg: '#ffffff', accent: '#ffffff' },
  'Lucid':            { label: 'LU',  bg: '#0E1B2C', fg: '#9DD9F3', accent: '#9DD9F3' },
  'Chevrolet':        { label: 'CHE', bg: '#FFC72C', fg: '#000000', accent: '#000000' },
  'Dodge':            { label: 'DO',  bg: '#000000', fg: '#E31837', accent: '#E31837' },
  'Ford':             { label: 'F',   bg: '#003478', fg: '#ffffff', accent: '#ffffff' },
  'Cadillac':         { label: 'CA',  bg: '#000000', fg: '#9C8C5C', accent: '#9C8C5C' },
  'GMC':              { label: 'GMC', bg: '#CC0000', fg: '#ffffff', accent: '#ffffff' },
  'Jeep':             { label: 'JEEP', bg: '#0B5E37', fg: '#ffffff', accent: '#ffffff' },
  'Toyota':           { label: 'TO',  bg: '#EB0A1E', fg: '#ffffff', accent: '#ffffff' },
  'Lexus':            { label: 'L',   bg: '#1A1A1A', fg: '#C0C0C0', accent: '#C0C0C0' },
  'Nissan':           { label: 'N',   bg: '#C3002F', fg: '#ffffff', accent: '#000000' },
  'Honda':            { label: 'H',   bg: '#CC0000', fg: '#ffffff', accent: '#ffffff' },
  'Acura':            { label: 'A',   bg: '#000000', fg: '#C0C0C0', accent: '#C0C0C0' },
  'Hyundai':          { label: 'H',   bg: '#002C5F', fg: '#ffffff', accent: '#ffffff' },
  'Kia':              { label: 'KIA', bg: '#05141F', fg: '#BB1E10', accent: '#BB1E10' },
  'Genesis':          { label: 'G',   bg: '#0a0a0a', fg: '#C8A35B', accent: '#C8A35B' },
  'BYD':              { label: 'BYD', bg: '#003D7A', fg: '#ED1C24', accent: '#ED1C24' },
  'NIO':              { label: 'NIO', bg: '#0a0a0a', fg: '#00BAB3', accent: '#00BAB3' },
  'Zeekr':            { label: 'Z',   bg: '#000000', fg: '#82AAFF', accent: '#82AAFF' },
  'Lancia':           { label: 'LA',  bg: '#003B73', fg: '#ffffff', accent: '#ffffff' },
  'Datsun':           { label: 'DS',  bg: '#003478', fg: '#ED1C24', accent: '#ED1C24' },
  // --- Erweiterung 2026: zusaetzliche Marken (Klassiker + Sport) ---
  'Mazda':            { label: 'MA',  bg: '#101010', fg: '#A50034', accent: '#A50034' },
  'Mitsubishi':       { label: 'MI',  bg: '#000000', fg: '#E60012', accent: '#E60012' },
  'Subaru':           { label: 'SU',  bg: '#003876', fg: '#ffffff', accent: '#A5A5A5' },
  'Volvo':            { label: 'VO',  bg: '#003057', fg: '#ffffff', accent: '#FAA61A' },
  'Saab':             { label: 'SA',  bg: '#0A2342', fg: '#ffffff', accent: '#7BAFD4' },
  'Shelby':           { label: 'SH',  bg: '#0033A0', fg: '#ffffff', accent: '#ED1C24' },
  'AC':               { label: 'AC',  bg: '#0a0a0a', fg: '#ffffff', accent: '#ED1C24' },
  'DeLorean':         { label: 'DMC', bg: '#1a1a1a', fg: '#C0C0C0', accent: '#C0C0C0' },
  'Plymouth':         { label: 'PL',  bg: '#000000', fg: '#FFD700', accent: '#FFD700' },
  'Pontiac':          { label: 'PO',  bg: '#000000', fg: '#FF6F00', accent: '#FF6F00' },
  'Buick':            { label: 'BU',  bg: '#1a1a1a', fg: '#C0C0C0', accent: '#ED1C24' },
  'Hummer':           { label: 'HU',  bg: '#1a1a1a', fg: '#FFD700', accent: '#FFD700' },
  'Spyker':           { label: 'SP',  bg: '#0a0a0a', fg: '#FF6600', accent: '#FF6600' },
  'Apollo':           { label: 'AP',  bg: '#0a0a0a', fg: '#FFB000', accent: '#FFB000' },
  'Czinger':          { label: 'CZ',  bg: '#000000', fg: '#FFFFFF', accent: '#00BFFF' },
  'Saleen':           { label: 'SL',  bg: '#0a0a0a', fg: '#FFD700', accent: '#FFD700' },
  'Ascari':           { label: 'AS',  bg: '#000000', fg: '#FFD700', accent: '#FFD700' },
  'Singer':           { label: 'SI',  bg: '#FFD500', fg: '#000000', accent: '#000000' },
  'Alpina':           { label: 'AL',  bg: '#0A1B3D', fg: '#0072CE', accent: '#0072CE' },
  'TVR':              { label: 'TVR', bg: '#000000', fg: '#ffffff', accent: '#ED1C24' },
  'Morgan':           { label: 'MO',  bg: '#0a3d2d', fg: '#C0C0C0', accent: '#C0C0C0' },
  'Lister':           { label: 'LI',  bg: '#0a0a0a', fg: '#ffffff', accent: '#ED1C24' },
  'Noble':            { label: 'NO',  bg: '#0a0a0a', fg: '#C0C0C0', accent: '#C0C0C0' },
  'De Tomaso':        { label: 'DT',  bg: '#001D5E', fg: '#FFD700', accent: '#FFD700' },
  'Iso':              { label: 'IS',  bg: '#0a0a0a', fg: '#ffffff', accent: '#ffffff' },
  'Xiaomi':           { label: 'XI',  bg: '#FF6900', fg: '#ffffff', accent: '#ffffff' },
};

const FALLBACK = { label: '?', bg: '#2a2f38', fg: '#ffffff', accent: '#ffffff' };

export function brandStyle(brand) {
  return STYLES[brand] || FALLBACK;
}

/** Render-Markup fuer ein Marken-Badge. Groesse via CSS-Klasse "logo-badge" + Modifier. */
export function brandBadgeHTML(brand, size = 'md', extraClass = '') {
  const s = brandStyle(brand);
  const bgStyle = s.bgGrad ? `background:${s.bgGrad}` : `background:${s.bg}`;
  const sizeClass = `logo-badge--${size}`;
  return `<span class="logo-badge ${sizeClass} ${extraClass}" style="${bgStyle};color:${s.fg}" aria-hidden="true">${s.label}</span>`;
}
