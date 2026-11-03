const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// Aktivera CORS så att din frontend kan nå servern
app.use(cors());
app.use(express.json());

// Initiera Gemini API med miljövariabeln från Render
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// API-rutt för att analysera text
app.post('/api/check', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Ingen text angavs för analys.' });
        }

        // Anropa Gemini med den modell som biblioteket efterfrågar
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Analysera följande text och avgör om det är ett bedrägeri, nätfiske (phishing/smishing) eller en säker text. Ge en tydlig och kortfattad bedömning på svenska:\n\n"${text}"`,
        });

        const analysisText = response.text || 'Ingen analys kunde genereras.';

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