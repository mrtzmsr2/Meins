# MEINS! 🏎️

Das klassische Autospiel als Web-App. Wer zuerst „**Meins!**" ruft, sichert sich das vorbeifahrende Auto. Jeder Spieler hat **3 Slots**. Wenn alle voll sind, gewinnt die teuerste Sammlung.

**Repo:** <https://github.com/mrtzmsr2/Meins>

## So funktioniert's

1. **Neues Spiel** → Spielmodus wählen:
   - **📱 Ein Gerät** — alle Spieler sehen dasselbe Display, jeder klickt seine Slots
   - **📡 Mehrere Geräte** — ein Spieler erstellt einen Raum, die anderen treten mit dem 4-stelligen Code bei (oder per geteiltem Link)
2. Auto fährt vorbei → laut **„Meins!"** rufen.
3. Wer zuerst war, tippt einen freien Slot an → **Marke + Modell** eingeben → Preis wird automatisch gesucht (oder manuell eintragen).
4. Wenn alle 3 × N Slots voll sind: **Auswertung** mit Ranking und Gewinner-Banner.
5. „Nochmal" startet sofort eine neue Runde mit derselben Gruppe.

## Cross-Plattform (iPhone, Android, Desktop)

Die App ist eine reine **Web-App** — läuft im Browser auf jedem Gerät. Multiplayer nutzt **WebRTC peer-to-peer** über [PeerJS](https://peerjs.com/). Kein eigener Server nötig, keine Anmeldung, kein App-Store.

> **Tipp:** Auf dem Handy im Browser auf „Zum Home-Bildschirm hinzufügen" → wirkt wie eine native App.

## Auto-Datenbank

- ~200 vorgepflegte Modelle vom Dacia Sandero bis zur Bugatti Tourbillon
- **Autocomplete** beim Tippen (Marke + Modell)
- **Manuelle Eingabe** für alles, was nicht in der Liste ist — wird lokal gespeichert und erscheint beim nächsten Mal in der Suche
- Datei: [src/data/cars.js](src/data/cars.js) — Erweitern ist trivial:
  ```js
  { brand: 'Marke', model: 'Modell', price: 12345, emoji: '🚗' }
  ```

## Technik

- **Vanilla HTML / CSS / ES-Module** — kein Build-Schritt, kein Node erforderlich
- **PeerJS** über CDN — WebRTC-Signaling kostenlos
- **Mobile-first**, modernes Dark-UI
- **localStorage** für letzte Gruppe + selbst eingetragene Autos

## Lokal entwickeln

ES-Module brauchen einen lokalen Server:

```powershell
# Variante A – Python
python -m http.server 8080

# Variante B – VS Code Live-Server-Extension
```

Dann <http://localhost:8080> öffnen. Für Multi-Device-Tests im selben WLAN: PC-IP statt `localhost`.

## Deployment (Netlify)

1. <https://app.netlify.com> → "Add new site" → "Import an existing project" → GitHub → Repo `mrtzmsr2/Meins`
2. Build command: leer · Publish directory: `.` → Deploy
3. Site settings → Change site name → permanente URL wählen

Jeder `git push origin main` deployt danach automatisch.

## Projektstruktur

```
index.html
styles.css
netlify.toml
src/
  main.js            # Routing + Views (Home, Setup, Game, Summary, Room)
  game.js            # Spielzustand: Spieler, Slots, Ranking
  car-search.js      # Auto-Such-Modal (Autocomplete + manuell)
  multiplayer.js     # PeerJS-Wrapper (Host & Peer)
  store.js           # localStorage (letzte Gruppe, eigene Autos)
  util.js            # fmtEUR, escapeHtml, etc.
  data/cars.js       # Auto-Datenbank
```

## Lizenz

MIT — siehe [LICENSE](LICENSE).
