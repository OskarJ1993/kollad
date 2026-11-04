const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// --- 1. CORS OCH MIDDLEWARE ---
// Tillåter anrop från din frontend (ex. lokal utveckling eller Capacitor/webb)
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initiera Gemini API (hämtar automatisk nyckel från miljövariabler process.env.GEMINI_API_KEY)
const ai = new GoogleGenAI();


// --- 2. RATE LIMITING (Skydda mot spam och botar) ---
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuter
    max: 20, // Max 20 anrop per 15 minuter från samma IP till check-endpointen
    message: { error: "För många förfrågningar. Försök igen om en stund." },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/check', limiter);


// --- ENKEL LOKAL DATABASHANTERING (För att spåra gratiskvoter) ---
const DB_FILE = path.join(__dirname, 'database.json');

function getDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }, null, 2));
    }
    const data = fs.readFileSync(DB_FILE);
    return JSON.parse(data);
}

function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}


// --- 3. ANALYS-ENDPOINT MED KVOTKONTROLL OCH GEMINI ---
app.post('/api/check', async (req, res) => {
    try {
        const { userId, textToAnalyze } = req.body;

        if (!userId || !textToAnalyze) {
            return res.status(400).json({ error: "Användar-ID och text saknas." });
        }

        const db = getDatabase();
        let user = db.users.find(u => u.id === userId);

        // Skapa ny användare om den inte finns
        if (!user) {
            user = { id: userId, freeChecksUsed: 0, hasActiveSubscription: false };
            db.users.push(user);
        }

        // Kontrollera gratiskvot (max 5 gratis kontroller)
        const MAX_FREE_CHECKS = 5;
        if (!user.hasActiveSubscription && user.freeChecksUsed >= MAX_FREE_CHECKS) {
            return res.status(403).json({ 
                error: "Du har nått gränsen för dina 5 gratiskontroller. Starta prenumerationen för att fortsätta!" 
            });
        }

        // Optimera texten (kapa till max 1000 tecken för att spara tokens)
        const trimmedText = textToAnalyze.length > 1000 ? textToAnalyze.substring(0, 1000) : textToAnalyze;

        // Anropa Gemini med en effektiv modell och strukturerad prompt
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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

        // Parsa svaret från modellen som JSON
        let analysisResult;
        try {
            const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
            analysisResult = JSON.parse(cleanText);
        } catch (e) {
            analysisResult = { risk: "okänd", reason: response.text };
        }

        // Öka räknaren för använda gratiskontroller om användaren saknar prenumeration
        if (!user.hasActiveSubscription) {
            user.freeChecksUsed += 1;
            saveDatabase(db);
        }

        // Svara alltid med giltig JSON
        return res.json({ 
            success: true, 
            checksRemaining: MAX_FREE_CHECKS - user.freeChecksUsed,
            result: analysisResult 
        });

    } catch (error) {
        console.error("Fel vid analys:", error);
        return res.status(500).json({ error: "Ett internt serverfel uppstod vid analysen." });
    }
});


// --- 4. EXEMPEL PÅ E-POSTKONTROLL (om du använder den) ---
app.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: "E-postadress saknas." });
        }
        
        // Här kan du lägga till din loggik för e-postläckor
        return res.json({ result: "Inga kända dataläckor hittades för denna e-postadress." });
    } catch (error) {
        return res.status(500).json({ error: "Kunde inte kontrollera e-post." });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kollad-servern körs på port ${PORT}`));