const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Om du har dina frontend-filer i en 'public'-mapp

// Initiera Gemini API (hämtar automatisk nyckel från process.env.GEMINI_API_KEY)
const ai = new GoogleGenAI();

// --- 1. RATE LIMITING (Skydda mot spam och botar) ---
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuter
    max: 10, // Max 10 anrop per 15 minuter från samma IP till analys-endpointen
    message: { error: "För många förfrågningar. Försök igen om en stund." },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/analyze', limiter);


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


// --- 2 & 3. ANALYS-ENDPOINT MED KVOTKONTROLL OCH OPTIMERAD GEMINI ---
app.post('/api/analyze', async (req, res) => {
    try {
        const { userId, textToAnalyze } = req.body;

        if (!userId || !textToAnalyze) {
            return res.status(400).json({ error: "Användar-ID och text saknas." });
        }

        const db = getDatabase();
        let user = db.users.find(u => u.id === userId);

        // Om användaren inte finns i "databasen" skapar vi en ny
        if (!user) {
            user = { id: userId, freeChecksUsed: 0, hasActiveSubscription: false };
            db.users.push(user);
        }

        // 2. Kontrollera gratiskvot
        const MAX_FREE_CHECKS = 5;
        if (!user.hasActiveSubscription && user.freeChecksUsed >= MAX_FREE_CHECKS) {
            return res.status(403).json({ 
                error: "Du har nått gränsen för dina 5 gratiskontroller. Starta prenumerationen för att fortsätta!" 
            });
        }

        // 3. Optimera texten (kapa för att spara tokens)
        const trimmedText = textToAnalyze.length > 1000 ? textToAnalyze.substring(0, 1000) : textToAnalyze;

        // Anropa Gemini med en snabb och effektiv modell samt strukturerad prompt
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

        // Försök parsa svaret från modellen som JSON (eller skicka råtext om det kraschar)
        let analysisResult;
        try {
            // Rensa eventuella markdown-backticks om modellen skickar med det
            const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
            analysisResult = JSON.parse(cleanText);
        } catch (e) {
            analysisResult = { risk: "okänd", reason: response.text };
        }

        // Räkna upp använda gratiskontroller om användaren saknar prenumeration
        if (!user.hasActiveSubscription) {
            user.freeChecksUsed += 1;
            saveDatabase(db);
        }

        res.json({ 
            success: true, 
            checksRemaining: MAX_FREE_CHECKS - user.freeChecksUsed,
            result: analysisResult 
        });

    } catch (error) {
        console.error("Fel vid analys:", error);
        res.status(500).json({ error: "Ett internt serverfel uppstod vid analysen." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kollad-servern körs på port ${PORT}`));
