const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// Aktivera CORS så att din frontend kan skicka förfrågningar hit
app.use(cors());
app.use(express.json());

// Initiera Gemini API (använder miljövariabeln GEMINI_API_KEY från Render)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// API-rutt för att analysera text
app.post('/api/check', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Ingen text angavs för analys.' });
        }

        // Anropa Gemini för att analysera om texten är en bluff/bedrägeri
        const response = req.body.model || 'gemini-2.5-flash'; // eller din standardmodell
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analysera följande text och avgör om det är ett bedrägeri, nätfiske (phishing/smishing) eller en säker text. Ge en tydlig och kortfattad bedömning på svenska:\n\n"${text}"`,
        });

        const analysisText = result.text || 'Ingen analys kunde genereras.';

        res.json({ result: analysisText });
    } catch (error) {
        console.error('Fel vid kommunikation med Gemini:', error);
        res.status(500).json({ error: 'Ett fel uppstod på servern vid analysen.' });
    }
});

// Enkel hälsokontroll på rotsidan
app.get('/', (req, res) => {
    res.send('Kollad API-server är igång och körs!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Kollad-servern körs på port ${PORT}`);
});