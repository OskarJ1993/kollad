const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_API_KEY = process.env.APP_API_KEY || 'kollad-mobile-secret-2026';

// Initiera Gemini (kräver GEMINI_API_KEY i miljövariabler)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-2.5-flash';

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '4mb' }));

// ==========================================
// 1. APP-NYCKELSKYDD (Stoppar obehörig åtkomst)
// ==========================================
app.use('/api', (req, res, next) => {
  const clientKey = req.header('x-app-key');
  if (!clientKey || clientKey !== APP_API_KEY) {
    return res.status(401).json({ error: 'Obehörigt anrop. Endast Kollad-appen har åtkomst.' });
  }
  next();
});

// ==========================================
// 2. RATE LIMITING & CACHE
// ==========================================
const checkBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  message: { error: 'För många kontroller på kort tid. Vänta en minut.' }
});

const checkHourlyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Maxgräns för kontroller uppnådd. Försök igen om en stund.' }
});

const imageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: 'För många skärmdumpsskanningar. Försök igen om 15 minuter.' }
});

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'För många e-postkontroller. Försök igen om 15 minuter.' }
});

const analysisCache = new Map();
const emailCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 timme

function getCached(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(map, key, value) {
  map.set(key, { ts: Date.now(), value });
}

// ==========================================
// 3. LOKAL FÖRKONTROLL (LÄNKAR & TELEFONNUMMER)
// ==========================================
function runLocalPrecheck(rawText) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // Kontrollera om hela inmatningen är ett telefonnummer
  const cleanedPhone = text.replace(/[\s\-().]/g, '');
  if (/^(\+|00)?\d{6,15}$/.test(cleanedPhone)) {
    if (/^(0900|0939|0944|\+46900|\+46939|\+46944)/.test(cleanedPhone)) {
      return {
        riskLevel: 'high',
        riskLabel: '🚨 HÖG RISK (Betalnummer)',
        summary: 'Detta är ett dyrt betalnummer (0900/0939/0944).',
        advice: 'Ring inte upp numret om du inte vet exakt vem mottagaren är och vad samtalet kostar.',
        source: 'Nummerkontroll'
      };
    }
    if (/^(\+|00)(?!46)/.test(cleanedPhone)) {
      return {
        riskLevel: 'medium',
        riskLabel: '⚠️ VARNING (Utlandsnummer)',
        summary: 'Numret går till utlandet. Vanligt vid så kallade "wangiri"- eller bluffsamtal.',
        advice: 'Ring inte tillbaka på okända utlandsnummer. Väntar du inget samtal från utlandet kan du blockera numret.',
        source: 'Nummerkontroll'
      };
    }
    return {
      riskLevel: 'low',
      riskLabel: 'ℹ️ SVENSKT NUMMER',
      summary: 'Ser ut som ett svenskt telefonnummer, men bedragare kan ibland förfalska nummervisning (spoofing).',
      advice: 'Om någon påstår sig ringa från bank, polis eller myndighet: lägg på och ring upp via organisationens officiella växelnummer.',
      source: 'Nummerkontroll'
    };
  }

  // Kända bluffmönster i SMS/länkar
  const highRiskPatterns = [
    /bankid[-.]?(sakerhet|verify|login|kontroll|sparr)/i,
    /postnord[-.]?(leverans|ombud|tull|paket)/i,
    /skatteverket[-.]?(aterbaring|utbetalning|login)/i,
    /1177[-.]?(vard|meddelande|logga)/i,
    /swish[-.]?(mottag|betalning|aterbetalning)/i
  ];

  if (highRiskPatterns.some((rx) => rx.test(lower))) {
    return {
      riskLevel: 'high',
      riskLabel: '🚨 HÖG RISK (Bluffmönster)',
      summary: 'Texten innehåller en känd bluffdomän eller ett klassiskt BankID-/leveransbedrägeri.',
      advice: 'Klicka inte på länken och legitimera dig inte med BankID. Radera meddelandet.',
      source: 'Snabbfilter'
    };
  }

  return null;
}

// ==========================================
// 4. ENDPOINT: SNABBKOLL (TEXT / LÄNK / NUMMER)
// ==========================================
app.post('/api/check', checkBurstLimiter, checkHourlyLimiter, async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Ingen text angiven.' });
    if (text.length > 500) return res.status(400).json({ error: 'Texten får vara max 500 tecken.' });

    const normKey = text.toLowerCase().replace(/\s+/g, ' ');
    const cached = getCached(analysisCache, normKey);
    if (cached) return res.json({ ...cached, source: 'Cache' });

    const precheck = runLocalPrecheck(text);
    if (precheck) {
      setCached(analysisCache, normKey, precheck);
      return res.json(precheck);
    }

    const prompt = `Du är en svensk säkerhetsexpert i appen Kollad som hjälper vanliga människor och äldre att upptäcka bedrägerier.
Analysera följande text, länk, mejl eller telefonnummer och svara ENDAST med giltig JSON i exakt detta format:
{
  "riskLevel": "high" | "medium" | "low",
  "riskLabel": "🚨 HÖG RISK" | "⚠️ VARNING" | "✅ SER SÄKERT UT",
  "summary": "Kort tydlig förklaring på svenska (max 2 meningar).",
  "advice": "Konkret råd om vad användaren ska göra nu (max 2 meningar)."
}

Innehåll att bedöma:
"""${text}"""`;

    const aiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const parsed = JSON.parse(aiResponse.text);
    const result = {
      riskLevel: ['high', 'medium', 'low'].includes(parsed.riskLevel) ? parsed.riskLevel : 'medium',
      riskLabel: parsed.riskLabel || '⚠️ VARNING',
      summary: parsed.summary || 'Kunde inte fastställa säkerheten helt.',
      advice: parsed.advice || 'Var försiktig och klicka inte på okända länkar.',
      source: 'AI-analys'
    };

    setCached(analysisCache, normKey, result);
    res.json(result);
  } catch (err) {
    console.error('Fel i /api/check:', err);
    res.status(500).json({ error: 'Tekniskt fel vid analysen.' });
  }
});

// ==========================================
// 5. ENDPOINT: SKÄRMDUMPS-SKANNER (BILD-OCR + ANALYS)
// ==========================================
app.post('/api/check-image', imageLimiter, async (req, res) => {
  try {
    const imageBase64 = String(req.body?.imageBase64 || '');
    const match = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Ogiltig bilddata.' });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const prompt = `Du är en svensk säkerhetsexpert i appen Kollad.
1. Läs av all text, länkar, telefonnummer eller QR-innehåll i denna skärmdump.
2. Bedöm om innehållet är ett bedrägeriförsök (t.ex. bluff-SMS, falsk faktura, BankID-fälla, falsk annons eller bluffsamtal).
Svara ENDAST med giltig JSON i exakt detta format:
{
  "extractedText": "Kort utdrag av texten du läste av i bilden (max 300 tecken).",
  "riskLevel": "high" | "medium" | "low",
  "riskLabel": "🚨 HÖG RISK" | "⚠️ VARNING" | "✅ SER SÄKERT UT",
  "summary": "Tydlig förklaring på svenska av vad bilden visar och om det är en bluff (max 2 meningar).",
  "advice": "Konkret råd till användaren (max 2 meningar)."
}`;

    const aiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        { inlineData: { mimeType, data: base64Data } },
        prompt
      ],
      config: { responseMimeType: 'application/json' }
    });

    const parsed = JSON.parse(aiResponse.text);
    res.json({
      extractedText: parsed.extractedText || '',
      riskLevel: ['high', 'medium', 'low'].includes(parsed.riskLevel) ? parsed.riskLevel : 'medium',
      riskLabel: parsed.riskLabel || '⚠️ VARNING',
      summary: parsed.summary || 'Skärmdumpen har granskats.',
      advice: parsed.advice || 'Kontrollera alltid avsändaren noggrant innan du agerar.'
    });
  } catch (err) {
    console.error('Fel i /api/check-image:', err);
    res.status(500).json({ error: 'Kunde inte analysera skärmdumpen.' });
  }
});

// ==========================================
// 6. ENDPOINT: DATALÄCKAGEKOLL (E-POST)
// ==========================================
app.post('/api/check-email', emailLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Ogiltig e-postadress.' });
    }

    const cached = getCached(emailCache, email);
    if (cached) return res.json(cached);

    const apiRes = await fetch(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(email)}`);
    if (apiRes.status === 404) {
      const cleanResult = { breached: false, count: 0 };
      setCached(emailCache, email, cleanResult);
      return res.json(cleanResult);
    }

    const data = await apiRes.json().catch(() => ({}));
    const breaches = Array.isArray(data.breaches?.[0]) ? data.breaches[0] : [];
    const result = {
      breached: breaches.length > 0,
      count: breaches.length
    };

    setCached(emailCache, email, result);
    res.json(result);
  } catch (err) {
    console.error('Fel i /api/check-email:', err);
    res.status(500).json({ error: 'Kunde inte nå dataläckagetjänsten.' });
  }
});

// ==========================================
// 7. ENDPOINT: BLUFF-RADARN
// ==========================================
app.get('/api/radar', (req, res) => {
  res.json({
    items: [
      {
        title: 'Falska paket- och tull-SMS',
        trend: 'Mycket vanlig',
        description: 'Bedragare utger sig för att vara PostNord eller DHL och ber om 15–29 kr i tullavgift.',
        sample: 'PostNord: Ditt paket har pausats pga obetald frakt (19 kr). Bekräfta på postnord-leverans-se.info'
      },
      {
        title: 'Samtal från "Bankens säkerhetsavdelning"',
        trend: 'Hög varning',
        description: 'Uppringaren påstår att ett lån håller på att tas i ditt namn och ber dig öppna BankID.',
        sample: 'Hej, vi ringer från bankens bedrägeriavdelning. Logga in med BankID för att stoppa en överföring på 48 000 kr.'
      },
      {
        title: 'Falska myndighets- och 1177-meddelanden',
        trend: 'Ökande',
        description: 'SMS med länk om "nytt viktigt meddelande" eller skatteåterbäring som leder till falska inloggningssidor.',
        sample: 'Du har ett nytt meddelande hos 1177. Läs det direkt via 1177-vard-meddelande.com'
      }
    ]
  });
});

// ==========================================
// 8. ENDPOINTS: FAMILJEGRUPP & SVARSFLÖDE
// ==========================================
const familyGroups = new Map();

app.get('/api/group/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const events = familyGroups.get(code) || [];
  res.json({ code, events });
});

app.post('/api/group/event', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const sender = String(req.body?.sender || 'Medlem').trim().slice(0, 40);
  const snippet = String(req.body?.snippet || '').trim().slice(0, 250);
  const summary = String(req.body?.summary || '').trim().slice(0, 250);

  if (!code || !snippet) {
    return res.status(400).json({ error: 'Gruppkod och innehåll krävs.' });
  }

  const events = familyGroups.get(code) || [];
  const newEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sender,
    snippet,
    summary,
    time: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
    reply: null
  };

  events.unshift(newEvent);
  familyGroups.set(code, events.slice(0, 25));
  res.json({ ok: true, event: newEvent });
});

app.post('/api/group/reply', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const eventId = String(req.body?.eventId || '').trim();
  const verdict = req.body?.verdict === 'safe' ? 'safe' : 'scam';
  const by = String(req.body?.by || 'Anhörig').trim().slice(0, 40);
  const text = String(req.body?.text || '').trim().slice(0, 100);

  const events = familyGroups.get(code) || [];
  const target = events.find((e) => e.id === eventId);
  if (!target) {
    return res.status(404).json({ error: 'Hittade inte frågan i gruppen.' });
  }

  target.reply = {
    verdict,
    by,
    text: text || (verdict === 'safe' ? 'Ser säkert ut' : 'Rör ej – bluff!')
  };

  res.json({ ok: true, event: target });
});

// ==========================================
// STARTA SERVER (Utan publik webbsida – endast API)
// ==========================================
app.get('/', (req, res) => {
  res.status(200).json({ status: 'Kollad API online' });
});

app.listen(PORT, () => {
  console.log(`Kollad API lyssnar på port ${PORT}`);
});
