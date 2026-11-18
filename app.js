import { LocalNotifications } from '@capacitor/local-notifications';

function getUserId() {
    let userId = localStorage.getItem('kollad_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('kollad_user_id', userId);
    }
    return userId;
}

// Hantera statistik för blockerade hot
function incrementBlockedCount() {
    let count = parseInt(localStorage.getItem('kollad_blocked_count') || '0', 10);
    count += 1;
    localStorage.setItem('kollad_blocked_count', count);
    updateBlockedCountUI(count);
}

function updateBlockedCountUI(count) {
    const statHighlight = document.querySelector('.stat-highlight');
    if (statHighlight) {
        statHighlight.textContent = count;
    }
}

// Hantera sökhistorik och visa i listan
function saveToHistory(text, riskLevel) {
    let history = JSON.parse(localStorage.getItem('kollad_history') || '[]');
    // Undvik dubbletter och behåll de 3 senaste
    history = [{ text, risk: riskLevel }, ...history.filter(item => item.text !== text)].slice(0, 3);
    localStorage.setItem('kollad_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const historyList = document.querySelector('.history-list');
    const history = JSON.parse(localStorage.getItem('kollad_history') || '[]');

    if (!historyList) return;

    if (history.length > 0) {
        historyList.innerHTML = '';
        history.forEach(item => {
            const isSafe = item.risk && item.risk.toLowerCase().includes('låg');
            const badgeClass = isSafe ? 'badge-safe' : 'badge-danger';
            const dotClass = isSafe ? 'dot-safe' : 'dot-danger';
            const badgeText = isSafe ? 'Säker' : 'Falsk';

            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <span class="item-text">🌐 ${item.text.length > 25 ? item.text.substring(0, 25) + '...' : item.text}</span>
                <span class="${badgeClass}">${badgeText}</span>
                <span class="${dotClass}"></span>
            `;
            historyItem.addEventListener('click', () => {
                const userInput = document.getElementById('userInput');
                if (userInput) {
                    userInput.value = item.text;
                }
            });
            historyList.appendChild(historyItem);
        });
    }
}

async function triggerSecurityAlert(reasonText) {
    const settingSound = document.getElementById('settingSound');
    const settingVibrate = document.getElementById('settingVibrate');

    // Vibrera om inställningen är på
    if (settingVibrate && settingVibrate.checked && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }

    try {
        let permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') {
            permStatus = await LocalNotifications.requestPermissions();
        }

        if (permStatus.display === 'granted') {
            await LocalNotifications.schedule({
                notifications: [
                    {
                        title: "⚠️ Varning: Bedrägeriförsök upptäckt!",
                        body: reasonText || "Live Guard har identifierat misstänkt innehåll.",
                        id: new Date().getTime(),
                        sound: settingSound && settingSound.checked ? 'default' : undefined
                    }
                ]
            });
        }
    } catch (error) {
        console.log('Kunde inte skicka notis:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const userInput = document.getElementById('userInput');
    const resultCard = document.getElementById('resultCard');
    const resultDescription = document.getElementById('resultDescription');

    // Ladda sparad statistik och historik vid start
    const savedCount = parseInt(localStorage.getItem('kollad_blocked_count') || '0', 10);
    updateBlockedCountUI(savedCount);
    renderHistory();

    if (analyzeBtn && userInput) {
        analyzeBtn.addEventListener('click', async () => {
            const textToCheck = userInput.value.trim();
            
            if (!textToCheck) {
                alert('Vänligen skriv eller klistra in något att kontrollera.');
                return;
            }

            resultCard.classList.remove('hidden');
            resultDescription.textContent = 'Analyserar pågår...';

            try {
                const response = await fetch('https://kollad.onrender.com/api/check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        userId: getUserId(),
                        textToAnalyze: textToCheck 
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    if (response.status === 403) {
                        resultDescription.innerHTML = `<span style="color: #ff4d4d;">${data.error || 'Du har nått gränsen för dina gratiskontroller.'}</span>`;
                        return;
                    }
                    throw new Error(data.error || 'Kunde inte nå servern.');
                }
                
                let outputText = data.result;
                let riskLevel = "låg";

                if (typeof data.result === 'object' && data.result !== null) {
                    riskLevel = data.result.risk || "låg";
                    outputText = `Risknivå: ${riskLevel}\nMotivering: ${data.result.reason}`;

                    if (riskLevel.toLowerCase().includes('hög')) {
                        incrementBlockedCount();
                        triggerSecurityAlert(data.result.reason);
                    }
                }

                resultDescription.textContent = outputText || data.message || 'Analys klar.';
                
                // Spara till historik
                saveToHistory(textToCheck, riskLevel);

                if (data.checksRemaining !== undefined) {
                    resultDescription.innerHTML += `<br><br><small style="color: #888;">Gratiskontroller kvar: ${data.checksRemaining}</small>`;
                }

            } catch (error) {
                console.error('Fel:', error);
                resultDescription.textContent = error.message || 'Kunde inte nå servern. Försök igen senare.';
            }
        });
    }
});

// Globala funktioner för gränssnittet
window.openSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
};

window.toggleGuardLiveTab = function() {
    alert("Guard Live-läget är aktivt i bakgrunden för att skydda dig mot skadliga länkar.");
};

window.clearHistory = function() {
    localStorage.removeItem('kollad_history');
    renderHistory();
    alert('Sökhistoriken har rensats.');
};
