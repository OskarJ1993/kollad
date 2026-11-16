# Kollad 🛡️

**Kollad** är en modern säkerhetsapp som hjälper dig att upptäcka bedrägerier, analysera misstänkta meddelanden och länkar med hjälp av AI, samt kontrollera om dina personliga uppgifter förekommer i kända dataläckor.

---

## 🚀 Huvudfunktioner

*   **AI-driven Riskanalys:** Klistra in SMS, chattmeddelanden, e-post eller webbadresser för att omedelbart få en bedömning av risknivå (låg/hög) och en tydlig motivering som genereras via Gemini AI.
*   **Guard Live (Realtidsskydd):** Ett övervakningsläge med live-status, räknare för blockerade hot och stöd för lokala push-notiser via Capacitor.
*   **ID-skydd & Dataläcka:** Sök och kontrollera om din e-postadress förekommer i kända dataläckor.
*   **Sökhistorik:** Sparar dina senaste kontroller lokalt i webbläsaren med klickbara genvägar (chips) för snabb åtkomst.
*   **Kvothantering & Säkerhet:** Inbyggd rate-limiting och spårning av gratiskvoter för att skydda API:et mot missbruk.

---

## 🛠️ Teknikstack

*   **Frontend:** HTML5, CSS3, JavaScript (ES6+ Moduler)
*   **Mobilintegration:** Capacitor (för lokala notiser)
*   **Backend:** Node.js, Express
*   **AI-motor:** Google GenAI SDK (`@google/genai`)
*   **Hosting:** Render (för backend-API:et)

---

## 📁 Projektstruktur

```text
kollad/
├── app.js             # Huvudlogik för gränssnitt, API-anrop och lokal lagring
├── server.js          # Express-backend med rate limiting och AI-integration
├── index.html         # Användargränssnitt (UI)
├── database.json      # Lokal databas för användarkvoter (genereras automatiskt)
└── www/
    └── style.css      # Stilmallar och design
```

---

## ⚙️ Kom igång / Installation

### 1. Klona repositoryt
```bash
git clone https://github.com/OskarJ1993/kollad.git
cd kollad
```

### 2. Installera beroenden
```bash
npm install
```

### 3. Konfigurera API-nyckel
Säkerställ att du har satt din Gemini API-nyckel i miljövariablerna på din server eller via en `.env`-fil:
```env
GEMINI_API_KEY=din_api_nyckel_här
```

### 4. Starta servern
```bash
node server.js
```

### 5. Köra klienten
Öppna `index.html` via en lokal utvecklingsserver (som *Live Server* i VS Code) för att testa gränssnittet i webbläsaren.
