// Spieler-Avatare: Auto/Tier-Emojis aus einem festen Pool.
// Jeder Spieler bekommt automatisch ein freies Avatar; manuell wechselbar.

export const AVATAR_POOL = [
  '🏎️', '🚗', '🚙', '🚕', '🚐', '🚓', '🚜', '🏁',
  '🦊', '🦁', '🐯', '🐺', '🐼', '🐸', '🦅', '🐉',
  '⚡', '🔥', '💎', '🚀', '🏆', '⭐', '🎯', '👑',
];

export function nextAvatar(used = []) {
  const taken = new Set((used || []).filter(Boolean));
  for (const a of AVATAR_POOL) if (!taken.has(a)) return a;
  // alle vergeben → einfach random
  return AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)];
}

export function avatarHTML(av, size = 'md') {
  const ch = av || '🚗';
  return `<span class="avatar avatar--${size}" aria-hidden="true">${ch}</span>`;
}
