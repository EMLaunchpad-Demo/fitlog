# Fitlog

Persoonlijke fitness-app voor iOS en Android, gebouwd met Expo (SDK 58) en Expo Router.
Alles wordt lokaal op je telefoon opgeslagen: geen account, geen server. De ingebouwde
AI-coach draait op Claude met je eigen Anthropic API-key.

## Wat zit erin

**Coach (AI)**
- Chat met een coach die je echte gegevens kan bekijken: trainingen, voortgang per oefening,
  voeding, gewicht, je schema, slaap, cardio, stappen, check-ins en je fase
- Eten loggen in gewone taal ("2 boterhammen met pindakaas en een banaan") of met een foto
  van je bord; de coach schat porties en macro's en zet het in de juiste maaltijd
- Kan alles in de app voor je aanpassen:
  - schema's: maken, aanpassen ("vervang bankdrukken door halters"), activeren, verwijderen
  - voeding: loggen, gelogde items corrigeren of verwijderen, water, doelen
  - gewicht: wegingen toevoegen (ook vanaf een weegschaal-screenshot, met alle waarden) of verwijderen
  - trainingen: achteraf vastleggen ("gisteren 5 km gelopen") of verwijderen
  - slaap, cardio, stappen en je dagelijkse check-in ("ik sliep van half elf tot kwart voor
    zeven", "uur gefietst, rustig tempo"), ook vanaf een screenshot van je gezondheids-app
  - je instellingen: slaapschema, vaste rustdagen, stappen- en cardiodoel, deload, gewoontes
    en je fase (cut, onderhoud, bulk)
  - je profiel ("onthoud dat ik last heb van mijn knie")
- Weekreview op verzoek: wat ging goed, wat kan beter, en één aanpassing voor volgende week
- **Analyse en plan:** de coach analyseert je lichaam en je gegevens (gewicht en trend,
  lichaamssamenstelling, taille, kracht per kilo lichaamsgewicht, sets per spiergroep, voeding
  tegenover verbruik, slaap en herstel), kiest zelf je fase en je voedingsdoelen, stuurt je
  schema bij en bewaart het plan met focuspunten. Na de termijn die hij kiest (meestal twee
  weken) herziet hij het
- Weekmenu met boodschappenlijst dat op je doelen uitkomt; elke maaltijd log je met één tik
- **Ochtendbriefing** (optioneel, Coach-instellingen): elke dag één korte briefing op Vandaag,
  met het goedkoopste model
- Elke actie verschijnt als kaartje in de chat; tik erop om het resultaat te zien
- **Ongedaan maken:** elke wijziging van de coach draai je met één tik terug, zolang je die
  gegevens daarna niet zelf hebt aangepast. De coach krijgt bij je volgende bericht te horen
  wat je hebt teruggedraaid. Bij verwijderen of grote schemawijzigingen vraagt hij eerst
  bevestiging
- **Over mij:** vertel de coach wie je bent (doelen, schema, voeding, slaap, hoe hij je moet
  aanspreken). Dat gaat mee met elk gesprek; een aangepast profiel geldt vanaf het volgende gesprek
- Te openen via het sterretje op Vandaag, de kaart "Vraag je coach", of "Foto maken" bij
  Voeding

**Vandaag**
- Je volgende training uit je actieve schema, met één tik starten; op een rustdag hersteltips
  in plaats van een training
- Vier tegels: herstelscore, slaap van afgelopen nacht, stappen en cardio deze week
- 's Avonds een aftelling naar schermen uit en licht uit
- Je dagelijkse gewoontes om af te vinken
- Weekoverzicht (ma–zo) en een streak van weken op rij
- Calorieën en macro's van vandaag, water, en je lichaamsgewicht met trendlijn
- Weekgemiddelde gewicht met het verschil ten opzichte van vorige week
- Lichaamssamenstelling van een slimme weegschaal (vet%, spiermassa, lichaamswater, visceraal
  vet, BMR, …): stuur een screenshot uit bijvoorbeeld Fitdays naar de coach of vul de waarden
  zelf in; met weekgemiddelden en een grafiek per waarde

**Trainen**
- Sets loggen per oefening: kg × reps, lichaamsgewicht (+kg), tijd (plank) of cardio (km/min)
- Kolom "Vorige" met wat je de vorige keer deed; lege velden worden bij afvinken automatisch
  ingevuld met je vorige gewicht of het doel uit je schema
- Rusttimer na elke set (−15 / +15 / skip), met trilling als de rust voorbij is
- Scherm blijft aan tijdens de training; een lopende training overleeft het afsluiten van de app
- Na afloop: duur, sets, volume en automatische detectie van persoonlijke records
- Per oefening: grafiek van je geschatte 1RM (Epley), zwaarste set en volledige geschiedenis
- 57 ingebouwde oefeningen + eigen oefeningen toevoegen
- **Dubbele progressie:** bij elke oefening staat wat je vandaag moet halen op basis van je
  vorige training ("blijf op 60 kg, mik op een rep extra" of "alle sets op 10: ga naar 62,5 kg")
- **Cardio & stappen:** sessies loggen (soort, minuten, intensiteit, afstand, hartslag) met
  geschat verbruik, je weekdoel in minuten (zware minuten tellen dubbel) en stappen per dag
- **Deloadweek:** met één tik aan; je schema start dan met de helft van de sets
- **Schijven en opwarmen:** bij stangoefeningen welke schijven er per kant op moeten en een
  opbouw naar je eerste zware set

**Schema's**
- Vier startschema's: PPL + Upper/Lower (5×, standaard actief), Full body (A/B),
  Push/Pull/Legs en Upper/Lower
- Eigen schema's maken: dagen, oefeningen, sets, reps-doel en rusttijd per oefening
- De app onthoudt welke dag de volgende is

**Herstel**
- Dagelijkse check-in (energie, spieren, stress, humeur) en een herstelscore die je met je
  eigen gemiddelde vergelijkt, met advies voor de training van vandaag
- Slaap loggen (tijden en kwaliteit), je slaapschema, gemiddelde, regelmaat en slaaptekort
- Vaste rustdagen kiezen, deload-status en gewoontes

**Voortgang**
- Fase (cut, onderhoud, bulk) met start, einde en doeltempo: de app vergelijkt de trend van je
  wegingen met het plan en stelt kleine stappen van 50-200 kcal voor
- Weekrapport: trainingen, calorieën en eiwit met dagen op doel, slaap, stappen, cardio, gewicht
- Harde sets per spiergroep per week naast de richtlijn van 10-20
- Geschat dagelijks verbruik uit je voedingslog en gewichtstrend
- **Mijn plan:** de analyse en de focuspunten van je coach, met de datum van de volgende analyse
- **Stagnatie:** oefeningen die drie trainingen of langer niet vooruitgaan
- **Lichaamsmaten:** taille en andere maten, met je taille ten opzichte van je lengte
- **Onderbouwing:** per onderwerp wat het onderzoek zegt, hoe sterk het bewijs is en de bron,
  naast je eigen cijfers. Zie `src/lib/guidelines.ts`

**Voeding**
- Dagelijks overzicht per maaltijd (ontbijt, lunch, diner, snacks), terugbladeren per dag
- Database met 80 veelgegeten Nederlandse producten (per 100 g, met handige eenheden zoals
  "1 snee" of "1 bakje"), recent gebruikte producten bovenaan
- Snel invoeren van eigen producten (per portie), optioneel bewaren
- **Barcodescanner:** scan een verpakking met de camera (of typ de code) en haal de
  voedingswaarden op uit Open Food Facts; het product staat daarna ook bij Zoeken
- **Maaltijden:** bewaar een maaltijd of recept en log hem later in één tik, of neem
  dezelfde maaltijd als gisteren over
- Waterteller
- Doelen instellen, of laten berekenen (Mifflin-St Jeor) op basis van lengte, gewicht,
  leeftijd, activiteit en doel

**Persoonlijke setup**
- Persoonlijke cijfers (doelen, slaapschema, rustdagen, fase, schema's) staan niet in de code.
  Je laadt ze in één keer met een setup-code via Instellingen → Persoonlijke setup laden, of
  je vraagt de coach om alles volgens je profiel in te stellen. Het formaat staat in
  `src/lib/setup.ts`. Een setup wijzigt alleen instellingen; wat je gelogd hebt blijft staan.

> De voedingswaarden zijn afgeronde gemiddelden. Check het etiket voor exacte cijfers.

## Op je iPhone zetten (gratis, als web-app)

Fitlog werkt ook als web-app die je op je beginscherm zet: volledig scherm, eigen icoon, start
ook zonder internet. Je hebt geen Apple Developer-account of Mac nodig.

1. Hosting gebeurt gratis op **Cloudflare Workers**, gekoppeld aan deze GitHub-repo. Elke push
   naar `main` bouwt en publiceert de app automatisch. De instellingen staan in `wrangler.jsonc`:
   - `build.command` bouwt de web-app naar `dist/` (`npx expo export --platform web`);
   - `assets.not_found_handling: "single-page-application"` serveert `index.html` voor
     app-pagina's zoals `/coach`.

   Eenmalig in Cloudflare: Workers & Pages → Create → koppel de GitHub-repo. De naam in
   `wrangler.jsonc` moet gelijk zijn aan de naam van de Worker.
2. Open het adres van je Worker (`….workers.dev`) op je iPhone in **Safari** → deelknop →
   **Zet op beginscherm**.
3. Open Fitlog vanaf je beginscherm en vul bij de coach je API-key en profiel in.

Lokaal testen zoals op Cloudflare: `npx wrangler dev`, en dan de web-app-test met
`BASE_URL=http://localhost:8787 node e2e/web-build.e2e.js`.

Goed om te weten:
- Je gegevens staan in de opslag van de web-app op je iPhone. Maak af en toe een back-up via
  Instellingen (tandwiel op Vandaag) → **Back-up maken** en bewaar hem in Bestanden.
- In de web-app bewaart iOS de API-key in de app-opslag, niet in de sleutelhanger.
- Trillen bij afvinken werkt niet in de web-versie; de rest wel, ook camera en coach.
- Een nieuwe versie komt online zodra hij op `main` staat; open de app daarna een keer met
  internet, dan laadt hij de nieuwe versie.
- Verhuis je naar een ander adres, dan begint de app daar leeg: zet je gegevens over met een
  back-up (Instellingen → Back-up maken / Back-up terugzetten).

## Ontwikkelen op je telefoon

- **Android:** installeer Expo Go uit de Play Store, draai `npx expo start` en scan de QR-code.
- **iPhone:** Expo Go uit de App Store ondersteunt maar tot SDK 54; deze app gebruikt SDK 58.
  Test op een iPhone dus via de web-app hierboven, of via een eigen build (zie onderaan).
- In de browser: `npx expo start --web`.

## De coach instellen

1. Maak een API-key aan in de [Anthropic Console](https://console.anthropic.com/settings/keys).
2. Open in de app de coach (sterretje op Vandaag) → tandwiel → plak de key → **Opslaan en testen**.
   De app controleert de key met een gratis call (`GET /v1/models`) voordat hij hem bewaart.
3. Vul in hetzelfde scherm **Over mij** in, zodat de coach je kent.
4. Kies eventueel een ander model: Opus 5.5 (standaard, slimst), Sonnet 5.5 (sneller, ongeveer
   de helft goedkoper) of Haiku 5.5 (snelst, veruit het goedkoopst).

**Kosten.** Een gewone vraag kost met Opus 5.5 grofweg 1 tot 5 cent, een foto iets meer. De app
toont een schatting per gesprek en in totaal; je echte saldo zie je in de Console. Start af en
toe een nieuw gesprek (pennetje rechtsboven): de hele geschiedenis gaat bij elke vraag mee.

**Privacy en veiligheid.**
- De key staat versleuteld op je toestel (iOS-sleutelhanger / Android Keystore via
  `expo-secure-store`), nooit in de broncode of het app-bundle, en gaat alleen naar
  `api.anthropic.com`.
- Je trainings- en voedingsgegevens gaan alleen naar Anthropic als je de coach iets vraagt, en
  dan alleen wat de coach via zijn tools opvraagt.
- Deze opzet (key op het toestel) is bedoeld voor persoonlijk gebruik. Wil je de app ooit aan
  anderen geven, zet de API-calls dan achter een eigen server, zodat niemand je key nodig heeft.

**Technisch.**
- `src/ai/api.ts` praat rechtstreeks met de Messages API via `fetch`. De officiële
  `@anthropic-ai/sdk` ondersteunt React Native niet; het pakket wordt alleen gebruikt voor de
  TypeScript-types.
- De agent-loop (`src/ai/coach.ts`) voert de tools uit (`src/ai/tools.ts`) tegen de lokale data.
  De systeemprompt en tools zijn vast (prompt caching), de datum gaat mee in elk bericht, en de
  geschiedenis wordt alleen aangevuld, nooit bewerkt.
- Verandert een app-update de systeemprompt of de tools, dan start het volgende bericht
  automatisch een nieuw gesprek (een lopend gesprek moet byte-identiek dezelfde prompt en tools
  houden).
- Server-side fallback staat aan (`fallbacks: "default"`): als het model een verzoek weigert, probeert
  de API het automatisch met een ander model.
- Foto's worden verkleind tot max. 1024 px JPEG en apart bewaard; het gesprek bevat alleen een
  verwijzing. Bij een nieuw gesprek worden de foto's verwijderd.

## Als echte app installeren

Een echte native app bouw je met Expo Build. Voor Android is dat gratis (APK); voor een iPhone
heb je een Apple Developer-account nodig (€99 per jaar):

```bash
npx eas-cli@latest build --profile preview --platform android   # .apk om te installeren
npx eas-cli@latest build --profile preview --platform ios       # vereist Apple Developer-account
```

## Projectstructuur

```
src/
  app/                 schermen (Expo Router, elk bestand is een route)
    (tabs)/            Vandaag, Trainen, Voeding, Herstel, Voortgang
    workout.tsx        actieve training
    exercises.tsx      oefeningen kiezen / bladeren
    history/[id].tsx   afgeronde training
    exercise/[id].tsx  voortgang per oefening
    plan/[id].tsx      schema bekijken en bewerken
    food-add.tsx       voeding toevoegen
    goals.tsx          doelen en calorieberekening
    weight.tsx         lichaamsgewicht
    sleep.tsx          slaap loggen en slaapschema
    cardio.tsx         cardio en stappen
    checkin.tsx        dagelijkse check-in
    phase.tsx          fase (cut, onderhoud, bulk)
    plans.tsx          schema's
    guide.tsx          onderbouwing met bronnen
    setup.tsx          persoonlijke setup laden
    body.tsx           lichaamsmaten
    menu.tsx           weekmenu van de coach
    scan.tsx           barcodescanner
    coach.tsx          AI-coach (chat)
    coach-settings.tsx API-key, model en verbruik
  ai/                  Claude-client, agent-loop, tools, systeemprompt, foto's, key-opslag,
                       ochtendbriefing
  components/          UI-bouwstenen, grafieken, tab bar, achtergrond (groen glass-thema)
  data/                ingebouwde oefeningen, voedingsmiddelen en schema's
  lib/                 types, formattering (NL), statistieken, thema (kleuren + glass()),
                       herstel, cardio, fase, weekrapport, richtlijnen met bronnen
  store/store.ts       alle data en acties (zustand, bewaard in AsyncStorage)
```

## Ontwikkelen

```bash
npm run typecheck
npm run lint
npm run test:e2e        # met `npx expo start --web` in een tweede terminal
npm run test:web-build  # bouwt en test de web-app
```

Zie `e2e/README.md` voor de end-to-end tests.
