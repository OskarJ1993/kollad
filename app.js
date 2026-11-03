// Huvudlogik för Kollad frontend
document.addEventListener('DOMContentLoaded', () => {
    const checkButton = document.getElementById('checkButton');
    const inputField = document.getElementById('inputField');
    const resultContainer = document.getElementById('resultContainer');

    if (checkButton) {
        checkButton.addEventListener('click', async () => {
            const textToCheck = inputField.value.trim();
            
            if (!textToCheck) {
                alert('Vänligen skriv eller klistra in något att kontrollera.');
                return;
            }

            resultContainer.innerHTML = 'Analyserat pågår...';

            try {
                // Här anropas din publika Render-server istället för localhost
                const response = await fetch('https://kollad.onrender.com/api/check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text: textToCheck })
                });

                if (!response.ok) {
                    throw new Error('Ett fel uppstod vid anropet till servern.');
                }

                const data = await response.json();
                
                // Visar resultatet från servern/Gemini
                resultContainer.innerHTML = `
                    <div class="result-box">
                        <h3>Resultat:</h3>
                        <p>${data.result || data.message}</p>
                    </div>
                `;
            } catch (error) {
                console.error('Fel:', error);
                resultContainer.innerHTML = '<p class="error">Kunde inte nå servern. Försök igen senare.</p>';
            }
        });
    }
});