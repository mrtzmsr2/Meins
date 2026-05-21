// MEINS! — Text-Pools für Toasts, Confirms und Spruch-Variationen.
// Bewusst handgeschrieben mit Charakter, ein paar Optionen, damit es nicht
// jedes Mal gleich klingt.

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const TEXT = {
  caught: () => pick([
    'Geschnappt!',
    'Gehört dir!',
    'Eingesackt.',
    'Boom — meins.',
    'Zack, weg.',
    'Schwein gehabt.',
  ]),
  removed: () => pick([
    'Weg damit.',
    'Aus der Liste gestrichen.',
    'Schade drum.',
    'Befreit.',
  ]),
  cooldown: () => pick([
    'Zu langsam.',
    'Noch im Cooldown.',
    'Kurz durchatmen.',
    'Geduld, mein Freund.',
  ]),
  collectionAdded: () => pick([
    'In der Sammlung gelandet.',
    'Foto sitzt — ab in die Sammlung.',
    'Gespeichert. Trophäe wartet.',
    'Ein Stück Garage mehr.',
  ]),
  photoMissing: () => 'Kein Foto aufgenommen.',
  saveError: () => 'Konnte nicht gespeichert werden.',
  nameTaken: () => 'Name ist schon vergeben.',
  needName: () => 'Sag uns deinen Namen.',
  maxPlayers: () => 'Mehr als 8 Spieler? Nicht mit uns.',
  minPlayers: () => 'Mindestens zwei müssen mitspielen.',
  groupSaved: (name) => `Gruppe „${name}" gemerkt.`,
  codeCopied: () => 'Code in der Zwischenablage.',
  connectionEnded: () => 'Verbindung beendet.',
  hostOnly: () => 'Nur der Rundenmeister kann ein neues Spiel starten.',
  codeIncomplete: () => 'Code unvollständig.',
};

export const CONFIRM = {
  resumeDelete: {
    title: 'Gespeichertes Spiel löschen?',
    body: 'Der laufende Spielstand wird verworfen.',
    ok: 'Verwerfen',
    danger: true,
  },
  groupDelete: (name) => ({
    title: `Gruppe „${name}" löschen?`,
    body: 'Die Gruppe wird aus deiner Liste entfernt.',
    ok: 'Löschen',
    danger: true,
  }),
  endGame: {
    title: 'Spiel beenden?',
    body: 'Das laufende Spiel wird abgebrochen — der aktuelle Stand bleibt aber gemerkt.',
    ok: 'Beenden',
  },
  leaveMulti: {
    title: 'Spiel verlassen?',
    body: 'Du gehst zurück zum Hauptmenü.',
    ok: 'Verlassen',
  },
  collectionDelete: {
    title: 'Aus Sammlung entfernen?',
    body: 'Eintrag und Foto sind danach weg — endgültig.',
    ok: 'Weg damit',
    danger: true,
  },
  slotDelete: ({ playerName, brand, model, cooldownSec, factor }) => {
    const carLine = `„${brand} ${model}"`;
    let body;
    if (!cooldownSec) body = `${playerName} verliert das Auto wieder.`;
    else if (factor > 1) body = `Mehrfach-Strafe: ${cooldownSec}s Cooldown (×${factor}).`;
    else body = `Danach ${cooldownSec}s Pause.`;
    return {
      title: `${carLine} löschen?`,
      body,
      ok: 'Löschen',
      danger: true,
    };
  },
};
