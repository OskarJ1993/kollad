const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const TEST_MODE = false;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6IGBdC2iWK432xP9-HiJjzH7jQ7pjU3wiBhuIceh9mAxQ";

const analysisCache = new Map();

app.post('/api/analyze', async (req, res) => {
    handleAnalyzedRequest(req, res, "Standardkoll (SMS/Länk)");
});

app.post('/api/analyze-blocket', async (req, res) => {
    handleAnalyzedRequest(req, res, "Marketplace & Blocket-kollen (fokus på säljarprofiler, falska betallänkar och förskottsbetalning)");
});

app.post('/api/analyze-webshop', async (req, res) => {
    handleAnalyzedRequest(req, res, "Webbshop-kollen (fokus på oseriösa omdömen, kontaktuppgifter och priser som är för bra för att vara sanna)");
});

// ID-kapning & Läckokoll
app.post('/api/check-leak', async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: "Ogiltig e-postadress angiven." });
    }

    const cleanEmail = email.trim().toLowerCase();
    console.log(`[SERVER] Kontrollerar dataläckor för: ${cleanEmail}`);  try { const hash = crypto.createHash('sha1').update(cleanEmail).digest('hex').toUpperCase(); const prefix = hash.substring(0, 5); const suffix = hash.substring(5);  const hibpResponse = await fetch(`https://haveibeenpwned.com/api/v3/range/${prefix}`, {
            headers: { 'User-Agent': 'Kollad-Security-App' }
        });

        let isBreached = false;
        let breachCount = 0;

        if (hibpResponse.status === 200) {
            const textResponse = await hibpResponse.text();
            const lines = textResponse.split('\n');
            
            for (const line of lines) {
                const [hashSuffix, count] = line.split(':');
                if (hashSuffix.trim() === suffix) {
                    isBreached = true;
                    breachCount = parseInt(count.trim(), 10);
                    break;
                }
            }
        }

        if (!isBreached) {
            return res.json({
                status: "green",
                title: "Inga kända läckor funna",
                description: `E-postadressen ${cleanEmail} förekommer inte i några kända publika dataläckor.`
            });
        }

        const aiPrompt = `Du är säkerhetsmotorn i appen 'Kollad'. E-postadressen ${cleanEmail} har hittats i ${breachCount} kända dataläckor på nätet. 
        Svara ENDAST med ett giltigt JSON-objekt i exakt detta format (utan markdown-formatering som \`\`\`json):
        {
            "status": "red",
            "title": "Varning: E-postadressen finns i ${breachCount} dataläckor!",
            "description": "Dina inloggningsuppgifter kan ha läckt ut på svarta marknaden. Byt lösenord omedelbart på viktiga konton och aktivera tvåstegsverifiering."
        }`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt }] }] })
        });

        const aiData = await aiResponse.json();
        if (aiData.candidates && aiData.candidates.length > 0) {
            let aiText = aiData.candidates[0].content.parts[0].text;
            aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
            return res.json(JSON.parse(aiText));
        }

        res.json({
            status: "red",
            title: "Varning: Dataläcka upptäckt",
            description: `Denna e-postadress förekommer i ${breachCount} kända dataläckor. Byt dina lösenord omgående.`
        });

    } catch (error) {
        console.error("Fel vid läckokontroll:", error);
        res.status(500).json({
            status: "red",
            title: "Kunde inte kontrollera",
            description: "Ett tekniskt fel uppstod vid kontroll mot läckoregister."
        });
    }
});

async function handleAnalyzedRequest(req, res, modeContext) {
    const { text } = req.body;

    if (!text || text.trim() === "") {
        return res.status(400).json({ error: "Ingen text angiven." });
    }

    const cacheKey = `${modeContext}:${text.trim()}`;
    if (analysisCache.has(cacheKey)) {
        console.log(`[SERVER] ⚡ Träff i lokal cache!`);
        return res.json(analysisCache.get(cacheKey));
    }

    console.log(`[SERVER] Analyserar via Gemini 3.5 Flash-lite (${modeContext}): "${text.substring(0, 30)}..."`);

    const prompt = `Du är säkerhetsmotorn i appen 'Kollad'. Analysera följande text utifrån kontexten: ${modeContext}.
    
Text att analysera: "${text}"

Svara ENDAST med ett giltigt JSON-objekt i exakt detta format (utan markdown-formatering som \`\`\`json):
{
    "status": "red" eller "green",
    "title": "Kort varningsrubrik eller 'Ingen risk upptäckt'",
    "description": "Tydlig och kortfattad förklaring till varför det är säkert eller en risk."
}`;

    let attempts = 0;
    let maxAttempts = 3;
    let success = false;
    let resultData = null;

    while (attempts < maxAttempts && !success) {
        attempts++;
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            const data = await response.json();
            
            if (data.candidates && data.candidates.length > 0) {
                success = true;
                let aiText = data.candidates[0].content.parts[0].text;
                aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
                resultData = JSON.parse(aiText);
                analysisCache.set(cacheKey, resultData);
                return res.json(resultData);
            }
        } catch (error) {
            console.log(`[SERVER] Försök ${attempts} fick nätverksfel:`, error.message);
        }

        if (!success && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    res.status(500).json({ 
        status: "red", 
        title: "Tillfällig överbelastning", 
        description: "AI-motorn är hårt belastad just nu. Var god försök igen om en liten stund." 
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Kollad-servern körs på port ${PORT}`);
});