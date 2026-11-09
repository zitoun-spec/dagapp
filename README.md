# Dagritme

Een persoonlijke iPhone-webapp voor routines, weekdoelen, agenda, taken, notities en inzicht. De app begint leeg. Je gegevens en foto's worden op je toestel bewaard, niet in deze repository.

Deze repository bevat de statische frontend voor **https://zitoun-spec.github.io/dagapp/**. Een build of serveraccount is niet nodig voor de lokale appfuncties. De Cloudflare-backend en geheime configuratie worden apart gehouden; echte pushmeldingen zijn pas beschikbaar nadat die afzonderlijk zijn ingesteld.

## GitHub Pages inschakelen

Open in deze repository **Settings → Pages**. Kies bij Source **Deploy from a branch**, bij Branch **main** en bij Folder **/ (root)**. Bewaar met **Save**. Wacht tot GitHub de publicatie als geslaagd meldt. Upload geen privé-JSON, foto's of servercodes naar GitHub.

## Installeren op iPhone

1. Maak in je oude Dagritme-app via Instellingen eerst een JSON-export en bewaar die privé in Bestanden. Laat de oude app staan.
2. Open **https://zitoun-spec.github.io/dagapp/** in Safari nadat GitHub Pages gereed is.
3. Kies **Delen → Zet op beginscherm** en open de nieuwe app via dat icoon.
4. Kies **JSON-back-up importeren** en selecteer je privé-export. Controleer de aantallen voordat je de vervanging bevestigt.
5. Controleer oude datums, vinkjes, taken, notities en foto's. Maak ook vanuit de nieuwe app een back-up.

De nieuwe app gebruikt eigen opslagsleutels. Ook wanneer de browser beide Pages-paden onder dezelfde origin bewaart, worden de oude appgegevens niet overschreven. iPhone-beginschermapps kunnen daarnaast aparte opslag hebben; gebruik daarom JSON-export/import om over te stappen.

## Privacy en updates

- Er worden geen persoonlijke startgegevens meegeleverd en er is geen automatische upload van je notities, foto's of historie.
- JSON-exports bevatten persoonlijke informatie. Bewaar ze buiten deze openbare repository.
- De kernapp werkt na de eerste succesvolle installatie ook offline. Lokale opslag is geen externe back-up; exporteer regelmatig.
- Een app-update wacht op **Opnieuw laden** en wist IndexedDB niet. Rond een open formulier eerst af.
- Voor een volgende release moeten de versies in `app.js` en `sw.js` worden bijgewerkt.

Versie 4.0.0. De frontend is gecontroleerd met 30 mobiele Chromium-browsertests, waaronder JSON-overdracht, historie, offline gebruik en service-worker-updates. Een fysieke Safari/iPhone-test blijft nodig, vooral voor touchbediening, toetsenbord en eventuele latere pushmeldingen.
