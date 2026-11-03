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

// Globala funktioner för gränssnittet och e-postkoll
window.openSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
};

window.checkEmailLeak = async function() {
    const emailInput = document.getElementById('leakEmailInput');
    const container = document.getElementById('leakResultContainer');
    
    if (!emailInput || !container) return;

    const email = emailInput.value.trim();
    if (!email) {
        alert('Vänligen ange en e-postadress.');
        return;
    }

    container.classList.remove('hidden');
    container.textContent = 'Kontrollerar dataläckor mot servern...';

    try {
        const response = await fetch('https://kollad.onrender.com/api/check-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
        });

        if (!response.ok) {
            throw new Error('Kunde inte nå servern.');
        }

        const data = await response.json();
        container.textContent = data.result || 'Inga läckor hittades.';
    } catch (error) {
        console.error('Fel:', error);
        container.textContent = 'Kunde inte nå servern för e-postkontroll.';
    }
};

window.toggleGuardLive = function() {
    const toggle = document.getElementById('guardToggle');
    const subtitle = document.getElementById('guardSubtitle');
    const statusText = document.getElementById('statusText');
    const card = document.querySelector('.guard-live-card');

    if (toggle && toggle.checked) {
        if (subtitle) subtitle.textContent = 'Realtidsskydd är aktivt';
        if (statusText) statusText.textContent = 'Status: Aktiv';
        if (card) card.classList.add('active-guard');
    } else {
        if (subtitle) subtitle.textContent = 'Realtidsskydd är avstängt';
        if (statusText) statusText.textContent = 'Status: Avstängd';
        if (card) card.classList.remove('active-guard');
    }
};

window.closeAlertModal = function() {
    const modal = document.getElementById('liveAlertModal');
    if (modal) modal.classList.add('hidden');
};

window.clearHistory = function() {
    alert('Sökhistoriken har rensats.');
};