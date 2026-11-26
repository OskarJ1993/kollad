const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// --- 1. CORS OCH MIDDLEWARE ---
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '16kb' }));
app.use(express.static('public'));

// Initiera Gemini API (läser GEMINI_API_KEY från miljövariabler)
const ai = new GoogleGenAI();

// --- 2. RATE LIMITING & MISSBRUKSSKYDD ---
const windowLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: "För många förfrågningar. Försök igen om en stund." },
    standardHeaders: true,
    legacyHeaders: false,
});

const burstLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 6,
    message: { error: "Du gör kontroller för snabbt. Vänta en liten stund och försök igen." },
    standardHeaders: true,
    legacyHeaders: false,
});

const emailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "För många e-postkontroller. Försök igen om en stund." },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/check', windowLimiter, burstLimiter);
app.use('/api/check-email', emailLimiter);

const lastCheckByUser = new Map();
const USER_COOLDOWN_MS = 2500;

function hasPassedUserCooldown(userId) {
    const now = Date.now();
    const prev = lastCheckByUser.get(userId) || 0;
    if (now - prev < USER_COOLDOWN_MS) {
        return false;
    }
    lastCheckByUser.set(userId, now);

    if (lastCheckByUser.size > 2000) {
        const oldestKey = lastCheckByUser.keys().next().value;
        lastCheckByUser.delete(oldestKey);
    }
    return true;
}

// --- CACHE FÖR GEMINI & E-POST (SPARAR TOKENS & ANROP) ---
const analysisCache = new Map();
const emailCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 timme

function getFromCache(cacheMap, key) {
    const entry = cacheMap.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cacheMap.delete(key);
        return null;
    }
    return entry.value;
}

function saveToCache(cacheMap, key, value, maxEntries = 500) {
    cacheMap.set(key, { value, timestamp: Date.now() });
    if (cacheMap.size > maxEntries) {
        const oldestKey = cacheMap.keys().next().value;
        cacheMap.delete(oldestKey);
    }
}

// --- SNABB FÖRKONTROLL UTAN AI-KOSTNAD ---
function runFastHeuristicCheck(text) {
    const lower = text.toLowerCase();

    const knownFakeDomains = [
        'postnord-leverans-se.com',
        'bankid-sakerhet-kontroll.se',
        'skatteverket-utbetalning',
        'swish-bekrafta-nu',
        'kivra-faktura-se'
    ];

    if (knownFakeDomains.some(domain => lower.includes(domain))) {
        return {
            risk: 'hög',
            reason: 'Känd bluffdomän som utger sig för att vara en svensk myndighet eller tjänst. Klicka inte på länken.'
        };
    }

    const hasSuspiciousLink = /https?:\/\/[^\s]+/i.test(lower);
    const hasUrgentBankId = lower.includes('bankid') && (lower.includes('förnyas') || lower.includes('spärras') || lower.includes('omgående'));
    if (hasSuspiciousLink && hasUrgentBankId) {
        return {
            risk: 'hög',
            reason: 'BankID skickar aldrig länkar via SMS eller mejl för att förnya eller låsa upp ditt BankID.'
        };
    }

    return null;
}

// --- ENKEL LOKAL DATABASHANTERING ---
const DB_FILE = path.join(__dirname, 'database.json');

const DEFAULT_RADAR = [
    {
        id: 'postnord',
        title: 'PostNord-paket',
        category: 'Leveransbluff',
        reports: 62,
        sample: 'PostNord: Ditt paket har stoppats p.g.a. obetald tullavgift. Bekräfta här: http://postnord-leverans-se.com'
    },
    {
        id: 'bankid',
        title: 'BankID-inloggning',
        category: 'Kontokapning',
        reports: 68,
        sample: 'Säkerhetsvarning: Ditt BankID behöver förnyas omgående via länken. https://bankid-sakerhet-kontroll.se/logga-in'
    },
    {
        id: 'cert-natfiske',
        title: 'Falska mejl & inloggningssidor',
        category: 'Nätfiske • CERT-SE',
        reports: 'Aktuell varning',
        sample: 'Hej, granska den delade fakturan och logga in här för att bekräfta ditt konto.'
    },
    {
        id: 'fakturabluff',
        title: 'Falska fakturor & påminnelser',
        category: 'Fakturabluff',
        reports: 34,
        sample: 'Påminnelse: Obetald faktura med förseningsavgift. Öppna fakturan här för att undvika inkasso.'
    },
    {
        id: 'skatteverket',
        title: 'Skatteåterbäring',
        category: 'Myndighetsbluff',
        reports: 25,
        sample: 'Skatteverket: Du har en utbetalning som väntar på bekräftelse.'
    }
];

function getDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initial = { users: [], radar: DEFAULT_RADAR, groups: {} };
        fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(data.users)) data.users = [];
    if (!Array.isArray(data.radar) || data.radar.length === 0) data.radar = [...DEFAULT_RADAR];
    if (!data.groups || typeof data.groups !== 'object') data.groups = {};
    return data;
}

function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function detectScamCategory(text) {
    const lower = text.toLowerCase();
    if (lower.includes('postnord') || lower.includes('paket') || lower.includes('dhl') || lower.includes('bring')) {
        return { id: 'postnord', title: 'PostNord-paket', category: 'Leveransbluff' };
    }
    if (lower.includes('bankid') || lower.includes('bank') || lower.includes('swedbank') || lower.includes('nordea')) {
        return { id: 'bankid', title: 'BankID-inloggning', category: 'Kontokapning' };
    }
    if (lower.includes('faktura') || lower.includes('inkasso') || lower.includes('betalning')) {
        return { id: 'fakturabluff', title: 'Falska fakturor & påminnelser', category: 'Fakturabluff' };
    }
    if (lower.includes('skatteverket') || lower.includes('kivra') || lower.includes('återbäring')) {
        return { id: 'skatteverket', title: 'Skatteåterbäring', category: 'Myndighetsbluff' };
    }
    if (lower.includes('konto') || lower.includes('logga in') || lower.includes('mejl') || lower.includes('delad')) {
        return { id: 'cert-natfiske', title: 'Falska mejl & inloggningssidor', category: 'Nätfiske • CERT-SE' };
    }
    return {
        id: 'custom_' + lower.replace(/[^a-z0-9]/g, '').slice(0, 12),
        title: text.length > 24 ? text.slice(0, 24) + '...' : text,
        category: 'Rapporterad bluff'
    };
}

function recordRadarReport(db, text) {
    const match = detectScamCategory(text);
    const existing = db.radar.find(item => item.id === match.id);
    if (existing) {
        if (typeof existing.reports === 'number') {
            existing.reports += 1;
        } else {
            existing.reports = 'Flera nya rapporter';
        }
        existing.sample = text;
    } else {
        db.radar.unshift({ ...match, reports: 1, sample: text });
    }
    db.radar.sort((a, b) => {
        const aNum = typeof a.reports === 'number' ? a.reports : 999;
        const bNum = typeof b.reports === 'number' ? b.reports : 999;
        return bNum - aNum;
    });
    db.radar = db.radar.slice(0, 12);
}

// --- 3. ANALYS-ENDPOINT ---
app.post('/api/check', async (req, res) => {
    try {
        const { userId, textToAnalyze, plan } = req.body;

        if (typeof userId !== 'string' || !userId.trim() || typeof textToAnalyze !== 'string' || !textToAnalyze.trim()) {
            return res.status(400).json({ error: "Användar-ID och text saknas." });
        }

        const cleanUserId = userId.trim().slice(0, 64);
        if (!hasPassedUserCooldown(cleanUserId)) {
            return res.status(429).json({ error: "Vänta ett par sekunder innan du gör nästa kontroll." });
        }

        const trimmedText = textToAnalyze.trim().slice(0, 500);
        if (trimmedText.length < 3) {
            return res.status(400).json({ error: "Texten eller länken är för kort för analys." });
        }

        const db = getDatabase();
        let user = db.users.find(u => u.id === cleanUserId);

        if (!user) {
            user = { id: cleanUserId, freeChecksUsed: 0, hasActiveSubscription: false };
            db.users.push(user);
        }

        const isPaidOrTrial = Boolean(user.hasActiveSubscription) || plan === 'pro' || plan === 'trial';
        const MAX_FREE_CHECKS = 5;

        if (!isPaidOrTrial && user.freeChecksUsed >= MAX_FREE_CHECKS) {
            return res.status(403).json({
                error: "Du har nått gränsen för dina 5 gratiskontroller. Starta prenumerationen för att fortsätta!"
            });
        }

        const cacheKey = trimmedText.toLowerCase().replace(/\s+/g, ' ');
        let analysisResult = getFromCache(analysisCache, cacheKey) || runFastHeuristicCheck(trimmedText);

        if (!analysisResult) {
            const response = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: `Analysera om följande text är ett bedrägeri eller bluff. Svara kortfattat enbart i JSON-format med exakt dessa fält: {"risk": "låg/hög", "reason": "kort motivering på svenska"}. Text att analysera: ${trimmedText}`
                            }
                        ]
                    }
                ]
            });

            try {
                const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
                analysisResult = JSON.parse(cleanText);
            } catch (e) {
                analysisResult = { risk: "okänd", reason: response.text };
            }
        }

        saveToCache(analysisCache, cacheKey, analysisResult);

        if (analysisResult && typeof analysisResult.risk === 'string' && analysisResult.risk.toLowerCase().includes('hög')) {
            recordRadarReport(db, trimmedText);
        }

        if (!isPaidOrTrial) {
            user.freeChecksUsed += 1;
        }
        saveDatabase(db);

        return res.json({
            success: true,
            checksRemaining: isPaidOrTrial ? null : Math.max(0, MAX_FREE_CHECKS - user.freeChecksUsed),
            result: analysisResult
        });

    } catch (error) {
        console.error("Fel vid analys:", error);
        return res.status(500).json({ error: "Ett internt serverfel uppstod vid analysen." });
    }
});

// --- 4. E-POSTKONTROLL (XposedOrNot + Cache) ---
app.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        if (typeof email !== 'string' || !email.trim()) {
            return res.status(400).json({ error: "E-postadress saknas." });
        }

        const cleanEmail = email.trim().toLowerCase().slice(0, 120);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({ error: "Ogiltig e-postadress." });
        }

        const cached = getFromCache(emailCache, cleanEmail);
        if (cached) {
            return res.json(cached);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
            const apiRes = await fetch(
                `https://api.xposedornot.com/v1/check-email/${encodeURIComponent(cleanEmail)}`,
                {
                    headers: { 'User-Agent': 'Kollad-Security-App/1.0' },
                    signal: controller.signal
                }
            );
            clearTimeout(timeout);

            if (apiRes.status === 404) {
                const safePayload = {
                    breached: false,
                    count: 0,
                    result: "Goda nyheter! Inga kända dataläckor hittades för denna e-postadress."
                };
                saveToCache(emailCache, cleanEmail, safePayload);
                return res.json(safePayload);
            }

            if (apiRes.ok) {
                const data = await apiRes.json();
                const breaches = Array.isArray(data.breaches?.[0])
                    ? data.breaches[0]
                    : Array.isArray(data.breaches)
                        ? data.breaches
                        : [];

                if (breaches.length > 0) {
                    const topNames = breaches.slice(0, 4).join(', ');
                    const warnPayload = {
                        breached: true,
                        count: breaches.length,
                        result: `Varning: E-postadressen förekommer i ${breaches.length} kända dataläckor (bl.a. ${topNames}). Byt lösenord om du återanvänder samma lösenord på flera sidor.`
                    };
                    saveToCache(emailCache, cleanEmail, warnPayload);
                    return res.json(warnPayload);
                }
            }
        } catch (fetchErr) {
            clearTimeout(timeout);
            console.log("Extern e-postkontroll ej nåbar just nu:", fetchErr.message);
        }

        return res.json({
            breached: false,
            count: 0,
            result: "Inga kända dataläckor hittades just nu. Tips: Använd alltid ett unikt lösenord för din e-post och bank."
        });
    } catch (error) {
        return res.status(500).json({ error: "Kunde inte kontrollera e-post." });
    }
});

// --- 5. BLUFF-RADARN ---
app.get('/api/radar', (req, res) => {
    try {
        const db = getDatabase();
        return res.json({ items: db.radar });
    } catch (error) {
        return res.status(500).json({ error: "Kunde inte hämta bluff-radarn." });
    }
});

// --- 6. FAMILJEGRUPP ---
app.get('/api/group/:code', (req, res) => {
    try {
        const code = String(req.params.code || '').toUpperCase().trim().slice(0, 24);
        if (!code) return res.status(400).json({ error: "Gruppkod saknas." });

        const db = getDatabase();
        const group = db.groups[code];
        if (!group) {
            return res.json({ code, name: 'Familjegrupp', events: [] });
        }
        return res.json(group);
    } catch (error) {
        return res.status(500).json({ error: "Kunde inte hämta gruppdata." });
    }
});

app.post('/api/group/event', (req, res) => {
    try {
        const { code, name, member, text, reason } = req.body;
        const cleanCode = String(code || '').toUpperCase().trim().slice(0, 24);
        if (!cleanCode || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: "Gruppkod och text krävs." });
        }

        const db = getDatabase();
        if (!db.groups[cleanCode]) {
            db.groups[cleanCode] = {
                code: cleanCode,
                name: String(name || 'Familjegrupp').slice(0, 40),
                events: []
            };
        }

        const newEvent = {
            member: String(member || 'Medlem').slice(0, 24),
            text: text.trim().slice(0, 60),
            reason: String(reason || 'Hög risk upptäckt').slice(0, 120),
            date: new Date().toLocaleDateString('sv-SE')
        };

        db.groups[cleanCode].events.unshift(newEvent);
        db.groups[cleanCode].events = db.groups[cleanCode].events.slice(0, 20);
        saveDatabase(db);

        return res.json({ success: true, group: db.groups[cleanCode] });
    } catch (error) {
        return res.status(500).json({ error: "Kunde inte spara gruppvarning." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kollad-servern körs på port ${PORT}`));
