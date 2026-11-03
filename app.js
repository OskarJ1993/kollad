document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const userInput = document.getElementById('userInput');
    const resultCard = document.getElementById('resultCard');
    const resultDescription = document.getElementById('resultDescription');

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const textToCheck = userInput.value.trim();
            
            if (!textToCheck) {
                alert('Vänligen skriv eller klistra in något att kontrollera.');
                return;
            }

            // Visa resultat-kortet och sätt laddningstext
            resultCard.classList.remove('hidden');
            resultDescription.textContent = 'Analyserar pågår...';

            try {
                // Skickar förfrågan till din Render-server
                const response = await fetch('https://kollad.onrender.com/api/check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text: textToCheck })
                });

                if (!response.ok) {
                    throw new Error('Kunde inte nå servern.');
                }

                const data = await response.json();
                
                // Visar svaret från servern/Gemini i gränssnittet
                resultDescription.textContent = data.result || data.message || 'Analys klar.';
            } catch (error) {
                console.error('Fel:', error);
                resultDescription.textContent = 'Kunde inte nå servern. Försök igen senare.';
            }
        });
    }
});