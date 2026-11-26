<div align="center">
  <img src="./assets/bilder/kollad-icon.png" alt="Kollad Logotyp" width="84" />
  <h1>Kollad</h1>
  <p><strong>Din digitala säkerhetsvakt mot bedrägerier – byggd för iOS och Android</strong></p>

  ![Version](https://img.shields.io/badge/version-1.8.0-00d2ff?style=flat-square)
  ![Platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android%20%7C%20Web-2563eb?style=flat-square)
  ![Language](https://img.shields.io/badge/språk-Svenska-10b981?style=flat-square)
</div>

---

## Om Kollad

**Kollad** är en säkerhetsapp och ett tillhörande backend-API utvecklat för att ge ett enkelt, snabbt och tryggt skydd mot digitala bedrägerier i vardagen. Appen byggs med **Capacitor** för både **iOS** och **Android** och är utformad för att hjälpa användare – inte minst äldre och anhöriga – att kontrollera misstänkta länkar, SMS, mejl och e-postadresser innan de klickar eller lämnar ut uppgifter.

---

## Funktioner (`v1.8.0`)

### Snabbkoll av länk, SMS & mejl
* **Omedelbar riskanalys (`POST /api/check`):** Bedömer misstänkta länkar, SMS och mejl och presenterar tydlig risknivå samt motivering på svenska.
* **Lokal förkontroll & AI-analys:** Kända bluffdomäner och vanliga BankID-fällor fångas direkt i en snabb förkontroll, medan övriga texter analyseras av AI med 1-timmes servercache.
* **Smidig inmatning:** Stöd för inklistring med ett tryck, inbyggda testexempel, sökhistorik (senaste 5 kontrollerna) samt förberedd delningsmottagning (`handleIncomingShare`) inför iOS/Android Share Target.

### Guard Live & Varningshistorik
* **Realtidsskydd:** Tydlig statuspanel med på/av-reglage för Guard Live och automatisk dygnsräknare för blockerade hot.
* **Varningslogg & aviseringar:** Sparar upptäckta högriskförsök med datum och orsak, med stöd för ljud, vibration och lokala mobilnotiser (`@capacitor/local-notifications`).

### Dataläckagekoll (E-post)
* **Kontroll mot kända dataläckor (`POST /api/check-email`):** Hopfällbar kontroll på startskärmen som söker efter om en e-postadress förekommit i kända dataläckor (via XposedOrNot med servercache och skydd mot överbelastning).

### Bluff-radarn i Sverige
* **Aktuella hot (`GET /api/radar`):** Visar pågående bluffteman i Sverige (leveransbluffar, BankID-kapningar, falska fakturor och myndighetsbluffar) och låter användaren fylla i och testa exempel direkt med ett tryck.

### Anhörig & Familjegrupp
* **Trygghetskontakt:** Spara namn och nummer till en anhörig för att snabbt kunna ringa eller skicka iväg ett misstänkt meddelande (inklusive Kollads analys) via SMS eller delningsmenyn.
* **Delad familjegrupp (`GET /api/group/:code`, `POST /api/group/event`):** Skapa eller gå med i en trygghetsgrupp med en enkel kod (`KOLLAD-XXXX`), dela varningar automatiskt och håll flödet uppdaterat var 15:e sekund när fliken är öppen.

### Akut-hjälpen
* **Steg-för-steg vid misstag:** Lugn och tydlig åtgärdslista om någon råkat klicka på en länk eller signera med BankID – med snabbknapp för att ringa sparad anhörig, direktuppringning till Polisen (`114 14`) och länk till `polisen.se`.

### Tillgänglighet & Kollad PRO
* **Anpassad läsbarhet:** Inställningsvy med läge för **större och tydligare text**, val för ljud och vibration samt rensning av historik.
* **Kollad PRO:** Översikt över PRO-funktioner och 7 dagars kostnadsfri testperiod.

---

## Teknikstack & Arkitektur

| Del | Teknik | Beskrivning |
| :--- | :--- | :--- |
| **Mobilappar (iOS & Android)** | HTML5, CSS3, JavaScript, Capacitor | Cross-platform-gränssnitt med native-stöd för notiser, vibration och delningsflöden |
| **Backend & API** | Node.js, Express | REST-API för bedrägerianalys, e-postläckor, bluff-radar och familjegrupper |
| **AI-analys** | Google GenAI (`@google/genai`) | Kontextuell bedömning av misstänkta SMS, länkar och mejl |
| **Säkerhet & Skydd** | `express-rate-limit`, Cache & Cooldown | Rate limiting per IP, användarcooldown, 500-teckensgräns och TTL-cache |

---

## Projektstruktur

```text
kollad/
├── index.html          # Huvudvy med 5 flikar samt inställnings- och PRO-modaler
├── app.js              # Klientlogik, fliknavigering, delningsmottagning och API-anrop
├── server.js           # Express-server med endpoints, caching och missbruksskydd
├── www/
│   └── style.css       # Mörkt tema, safe-area-anpassning och läge för större text
└── assets/
    └── bilder/         # Appikoner och grafiska resurser
