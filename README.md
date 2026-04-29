# MMEINS! v3 — Wer kennt die teuersten Autos?

Nachfolger von [meiner.netlify.app](https://meiner.netlify.app/). Komplett neu aufgebaut, ohne Build-Schritt: einfach hosten oder lokal öffnen.

## Features

- **5 Spielmodi**
  - 🏁 Klassisch — 10 Runden, Punkte je nach Genauigkeit
  - ⏱️ Zeitrennen — 60 s, so viele Treffer wie möglich
  - 🔥 Streak — 3 Fehler = Game Over
  - ⚔️ Duell — Welches Auto ist teurer?
  - 📱 **Multiplayer** — mehrere Handys in einer Sitzung, ein Rundenmeister steuert
- **3 Schwierigkeitsgrade** (Easy / Normal / Hard) — filtert die Auto-Datenbank nach Preis-Tier
- **Highscore-Bestenliste** je Spielmodus (Top 10, lokal gespeichert)
- **Stats** — Spiele, Punkte, Trefferquote, Volltreffer
- **Mobile-first**, modernes Dark-UI mit Verlauf, Slider mit logarithmischer Skala (für Preise von 10.000 € bis 100 Mio. €)
- **~85 kuratierte Autos** quer durch alle Klassen (Mainstream → Hypercar → Klassiker)
- **Keine Build-Tools** — reine ES-Module + PeerJS via CDN

## Multiplayer

- **Wie es funktioniert:** Ein Spieler tippt auf „Multiplayer → Raum erstellen" und wird Rundenmeister. Die anderen öffnen die Seite und tippen auf „Raum beitreten" → 4-stelligen Code eingeben (oder Link `?room=ABCD` öffnen).
- **Rollen:** Der **Rundenmeister** wählt Modus (Klassisch oder Duell), startet das Spiel, deckt Runden auf und schaltet weiter. Alle anderen sehen das Auto und geben ihren Tipp ab.
- **Technik:** WebRTC peer-to-peer über [PeerJS](https://peerjs.com/) — kein eigener Server, kein Backend. Funktioniert also direkt auf Netlify.
- **Voraussetzung:** Alle Geräte brauchen Internet. Das öffentliche PeerJS-Cloud-Signaling (kostenfrei) wird zum initialen Verbindungsaufbau genutzt.


## Lokal öffnen

Browser-Sicherheit blockiert ES-Module über `file://`. Daher einen kleinen lokalen Server starten:

```powershell
# Variante 1: Python (falls installiert)
python -m http.server 8080

# Variante 2: VS Code Live Server Extension → "Open with Live Server"
```

Dann <http://localhost:8080> öffnen.

## Auf Netlify deployen

Drag & Drop des Projektordners auf <https://app.netlify.com/drop> – fertig. Es ist kein Build nötig (`netlify.toml` enthält nur das Publish-Verzeichnis).

## GitHub-Setup & Continuous Deployment

```powershell
# 1) Bei GitHub ein leeres Repo erstellen (z. B. mmeins-v3) – ohne README/.gitignore
# 2) Hier im Projekt:
git init
git add -A
git commit -m "feat: MMEINS v3 – multiplayer car price game"
git branch -M main
git remote add origin https://github.com/<dein-user>/mmeins-v3.git
git push -u origin main
```

**Auto-Deploy auf Netlify einrichten (einmalig):**

1. Netlify → "Add new site" → "Import an existing project" → GitHub → das Repo auswählen.
2. Build command leer lassen, Publish directory `.` (Punkt). → Deploy.
3. Site-Name unter „Site settings" auf z. B. `mmeins` setzen → URL `https://mmeins.netlify.app`.

Danach: jeder `git push origin main` löst automatisch ein neues Deploy aus.

**Optional – GitHub Actions statt Netlify-Git-Integration:** Workflow liegt schon unter [.github/workflows/deploy.yml](.github/workflows/deploy.yml). In den Repo-Secrets nur setzen: `NETLIFY_AUTH_TOKEN` (User → Applications → Personal access tokens) und `NETLIFY_SITE_ID` (Site settings → General → Site ID).

## Auto-Datenbank pflegen

Datei: `src/data/cars.js`. Jeder Eintrag:

```js
{
  id: 'eindeutig',
  brand: 'Ferrari',
  model: 'F40',
  year: 1989,
  price: 2_500_000,    // EUR
  hp: 478,
  category: 'Klassiker',
  tier: 'hyper',       // 'mainstream' | 'premium' | 'super' | 'hyper'
  emoji: '🏛️',
}
```

`tier` steuert, in welchen Schwierigkeitsgraden das Auto auftaucht.

## Projektstruktur

```
index.html
styles.css
netlify.toml
src/
  main.js          # Views, Routing, Game-Engine
  store.js         # localStorage (Stats + Bestenliste)
  util.js          # Score-Modell, Formatter, Skalen
  data/
    cars.js        # Auto-Datenbank
```
