<div align="center">
  <img src="./assets/bilder/kollad-icon.png" alt="Kollad Logotyp" width="84" />
  <h1>Kollad</h1>
  <p><strong>Din digitala säkerhetsvakt mot bedrägerier – byggd för iOS och Android</strong></p>

  ![Version](https://img.shields.io/badge/version-1.9.2-00d2ff?style=flat-square)
  ![Platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android-2563eb?style=flat-square)
  ![Language](https://img.shields.io/badge/språk-Svenska-10b981?style=flat-square)
</div>

---

## Om Kollad

**Kollad** är en mobilapp och ett tillhörande backend-API utvecklat för att ge ett enkelt, snabbt och tryggt skydd mot digitala bedrägerier i vardagen. Appen byggs med **Capacitor** för både **iOS** och **Android** och är utformad för att hjälpa användare – inte minst äldre och anhöriga – att kontrollera misstänkta länkar, SMS, mejl, telefonnummer, skärmdumpar och e-postadresser innan de klickar eller lämnar ut uppgifter.

---

## Funktioner (`v1.9.2`)

### Snabbkoll av länk, SMS, mejl & nummer
- **Omedelbar riskanalys (`POST /api/check`):** Bedömer misstänkta länkar, SMS, mejl och telefonnummer och presenterar tydlig risknivå samt motivering och råd på svenska.
- **Lokal förkontroll & AI-analys:** Kända bluffdomäner, betalnummer, utlandsnummer och vanliga BankID-fällor fångas direkt i en snabb förkontroll, medan övriga texter analyseras av AI med 1-timmes servercache.
- **Smidig inmatning:** Stöd för inklistring med ett tryck, inbyggda testexempel, sökhistorik (senaste 5 kontrollerna), delning av varningar samt förberedd delningsmottagning (`handleIncomingShare`) inför iOS/Android Share Target.
- **Dagens säkerhetstips:** Roterande vardagstips direkt på startskärmen med möjlighet att bläddra fram nya råd.

### Skärmdumps-skanner (OCR / Bildanalys)
- **Granska skärmdumpar & foton (`POST /api/check-image`):** Ladda upp en skärmdump av ett misstänkt SMS eller mejl direkt från enheten. Bilden skalas om automatiskt på klienten, texten läses av och riskbedöms av AI.

### Guard Live & Varningshistorik
- **Realtidsskydd:** Tydlig statuspanel med på/av-reglage för Guard Live och automatisk dygnsräknare för blockerade hot.
- **Varningslogg & aviseringar:** Sparar upptäckta medel- och högriskförsök under en egen **Varningar**-flik med datum och orsak, med stöd för ljud, vibration och lokala mobilnotiser.

### Dataläckagekoll (E-post)
- **Kontroll mot kända dataläckor (`POST /api/check-email`):** Egen **E-post**-flik som söker efter om en e-postadress förekommit i kända dataläckor (med servercache och skydd mot överbelastning) samt ger konkreta säkerhetstips.

### Bluff-radarn & Bluff-träning
- **Aktuella hot (`GET /api/radar`):** Visar pågående bluffteman i Sverige (leveransbluffar, BankID-kapningar, falska fakturor och myndighetsbluffar) och låter användaren fylla i och testa exempel direkt i snabbkollen.
- **Bluff-träning:** Interaktivt veckotest med 3 verklighetstrogna scenarier, omedelbar förklaring och poängräkning.

### Anhörig & Familjegrupp
- **Trygghetskontakt:** Spara namn och nummer till en anhörig för att snabbt kunna ringa eller skicka iväg ett misstänkt meddelande (inklusive Kollads analys) via SMS.
- **Delad familjegrupp (`GET /api/group/:code`, `POST /api/group/event`, `POST /api/group/reply`):** Skapa eller gå med i en trygghetsgrupp med en enkel kod (`KOLLAD-XXXX`), ställ frågor direkt från ett sökresultat, svara varandra med *"Ser säkert ut"* eller *"Rör ej – bluff!"* och håll flödet uppdaterat var 15:e sekund när fliken är öppen.

### Akut-hjälpen
- **Steg-för-steg vid misstag:** Lugn och tydlig åtgärdslista om någon råkat klicka på en länk eller signera med BankID – med snabbknapp för att ringa sparad anhörig, direktuppringning till Polisen (`114 14`) och länk till `polisen.se`.

### Tillgänglighet & Kollad PRO
- **Anpassad läsbarhet:** Inställningsvy med läge för **större och tydligare text**, val för ljud och vibration samt rensning av lokal historik.
- **Kollad PRO:** Visar aktiv status (`PRO ✓`) i toppmenyn samt anpassar cooldown och bildskalning för PRO-användare.

---

## Teknikstack & Arkitektur

| Del | Teknik | Beskrivning |
| :--- | :--- | :--- |
| **Mobilappar (iOS & Android)** | HTML5, CSS3, JavaScript, Capacitor | Cross-platform-gränssnitt med 6 flikar, native-stöd för notiser, vibration, bildhantering och delningsflöden |
| **Backend & API** | Node.js, Express | REST-API på Render för bedrägerianalys, bildgranskning, e-postläckor, bluff-radar och familjegrupper |
| **AI-analys** | Google GenAI (`@google/genai`) | Kontextuell bedömning av misstänkta SMS, länkar, mejl och skärmdumpar |
| **Säkerhet & Skydd** | `x-app-key`, `express-rate-limit`, Cache & Cooldown | API-nyckelverifiering, rate limiting per IP, användarcooldown, 500-teckensgräns och TTL-cache |

---

## Projektstruktur

```text
kollad/
├── server.js               # Express-server med endpoints, x-app-key-skydd, caching och rate limiting
├── www/
│   ├── index.html          # Huvudvy med 6 flikar samt inställnings- och PRO-modaler
│   ├── style.css           # Mörkt tema, linjerad bottenmeny, safe-area-anpassning och stor text
│   ├── app.js              # Klientlogik, fliknavigering, bildskanner, PRO-status och API-anrop
│   └── assets/
│       └── bilder/         # Appikoner (kollad-icon.png) och grafiska resurser
├── ios/                    # Capacitor-projekt för iOS (Xcode)
└── android/                # Capacitor-projekt för Android (Android Studio)
