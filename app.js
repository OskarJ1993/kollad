import { LocalNotifications } from '@capacitor/local-notifications';

function getUserId() {
    let userId = localStorage.getItem('kollad_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('kollad_user_id', userId);
    }
    return userId;
}

// Hantera flikar (Navigation i bottenmenyn)
window.switchTab = function(tabName) {
    const tabHome = document.getElementById('tabHome');
    const tabGuard = document.getElementById('tabGuard');
    const tabHistory = document.getElementById('tabHistory');

    const navHome = document.getElementById('navHome');
    const navGuard = document.getElementById('navGuard');
    const navHistory = document.getElementById('navHistory');

    // Dölj alla flikar
    if (tabHome) tabHome.classList.add('hidden');
    if (tabGuard) tabGuard.classList.add('hidden');
    if (tabHistory) tabHistory.classList.add('hidden');

    // Ta bort active från alla nav-knappar
    if (navHome) navHome.classList.remove('active');
    if (navGuard) navGuard.classList.remove('active');
    if (navHistory) navHistory.classList.remove('active');

    const headerTitle = document.getElementById('headerTitle');
    const headerSubtitle = document.getElementById('headerSubtitle');

    if (tabName === 'home') {
        if (tabHome) tabHome.classList.remove('hidden');
        if (navHome) navHome.classList.add('active');
        if (headerTitle) headerTitle.textContent = "Välkommen tillbaka";
        if (headerSubtitle) headerSubtitle.textContent = "Ditt digitala skydd är aktivt.";
    } else if (tabName === 'guard') {
        if (tabGuard) tabGuard.classList.remove('hidden');
        if (navGuard) navGuard.classList.add('active');
        if (headerTitle) headerTitle.textContent = "Guard Live";
        if (headerSubtitle) headerSubtitle.textContent = "Realtidsskydd i bakgrunden.";
    } else if (tabName === 'history') {
        if (tabHistory) tabHistory.classList.remove('hidden');
        if (navHistory) navHistory.classList.add('active');
        if (headerTitle) headerTitle.textContent = "Varningshistorik";
        if (headerSubtitle) headerSubtitle.textContent = "Tidigare kontroller och hot.";
        renderHistory(); // Uppdatera listan när man går hit
    }
}

// Hantera statistik för blockerade hot
function incrementBlockedCount() {
    let count = parseInt(localStorage.getItem('kollad_blocked_count') || '0', 10);
    count += 1;
    localStorage.setItem('kollad_blocked_count', count);
    updateBlockedCountUI(count);
}

function updateBlockedCountUI(count) {
    const statHighlight = document.getElementById('homeBlockedCount');
    const blockedCountEl = document.getElementById('blockedCount');
    if (statHighlight) statHighlight.textContent = count;
    if (blockedCountEl) blockedCountEl.textContent = count;
}

// Hantera sökhistorik och rendera i listor
function saveToHistory(text, riskLevel) {
    let history = JSON.parse(localStorage.getItem('kollad_history') || '[]');
    history = [{ text, risk: riskLevel, date: new Date().toLocaleDateString() }, ...history.filter(item => item.text !== text)].slice(0, 10);
    localStorage.setItem('kollad_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const homeHistoryList = document.getElementById('homeHistoryList');
    const fullHistoryList = document.getElementById('fullHistoryList');
    const history = JSON.parse(localStorage.getItem('kollad_history') || '[]');

    // Rendera hemvyns korta lista (max 3)
    if (homeHistoryList) {
        if (history.length > 0) {
            homeHistoryList.innerHTML = '';
            history.slice(0, 3).forEach(item => {
                const isSafe = item.risk && item.risk.toLowerCase().includes('låg');
                const badgeClass = isSafe ? 'badge-safe' : 'badge-danger';
                const dotClass = isSafe ? 'dot-safe' : 'dot-danger';
                const badgeText = isSafe ? 'Säker' : 'Falsk';

                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `
                    <span class="item-text">🌐 ${item.text.length > 22 ? item.text.substring(0, 22) + '...' : item.text}</span>
                    <span class="${badgeClass}">${badgeText}</span>
                    <span class="${dotClass}"></span>
                `;
                div.addEventListener('click', () => {
                    switchTab('home');
                    const userInput = document.getElementById('userInput');
                    if (userInput) userInput.value = item.text;
                });
                homeHistoryList.appendChild(div);
            });
        } else {
            homeHistoryList.innerHTML = `<div class="history-item"><span class="item-text" style="color: var(--text-secondary);">Inga tidigare sökningar</span></div>`;
        }
    }

    // Rendera fullständiga historik-fliken
    if (fullHistoryList) {
        if (history.length > 0) {
            fullHistoryList.innerHTML = '';
            history.forEach(item => {
                const isSafe = item.risk && item.risk.toLowerCase().includes('låg');
                const badgeClass = isSafe ? 'badge-safe' : 'badge-danger';
                const dotClass = isSafe ? 'dot-safe' : 'dot-danger';
                const badgeText = isSafe ? 'Säker' : 'Falsk';

                const div = document.createElement('div');
                div.className = 'history-item';
                div.style.marginBottom = '6px';
                div.innerHTML = `
                    <div>
                        <span class="item-text" style="display: block; font-weight: 500;">🌐 ${item.text}</span>
                        <small style="font-size: 9px; color: var(--text-secondary);">${item.date || ''}</small>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="${badgeClass}">${badgeText}</span>
                        <span class="${dotClass}"></span>
                    </div>
                `;
                fullHistoryList.appendChild(div);
            });
        } else {
            fullHistoryList.innerHTML = `<p style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 20px;">Inga varningar eller kontroller sparade än.</p>`;
        }
    }
}

// Guard Live Toggle-funktion
window.toggleGuardLive = function() {
    const toggle = document.getElementById('guardToggle');
    const subtitle = document.getElementById('guardSubtitle');
    const statusText = document.getElementById('statusText');
    const statusIndicator = document.getElementById('statusIndicator');
    const guardCard = document.querySelector('.guard-live-full-card');
    
    // Hemvyns status
    const homeStatusCard = document.getElementById('homeStatusCard');
    const homeStatusDot = document.getElementById('homeStatusDot');
    const homeStatusText = document.getElementById('homeStatusText');

    if (toggle && toggle.checked) {
        if (subtitle) subtitle.textContent = 'Realtidsskydd är aktivt';
        if (statusText) statusText.textContent = 'Status: Aktiv';
        if (statusIndicator) {
            statusIndicator.style.backgroundColor = 'var(--success-color)';
            statusIndicator.style.boxShadow = '0 0 8px var(--success-color)';
        }
        if (guardCard) guardCard.classList.add('active-guard');
        
        if (homeStatusCard) homeStatusCard.classList.add('active-guard');
        if (homeStatusDot) {
            homeStatusDot.style.backgroundColor = 'var(--success-color)';
            homeStatusDot.style.boxShadow = '0 0 8px var(--success-color)';
        }
        if (homeStatusText) homeStatusText.textContent = '🛡️ Guard Live är aktivt.';
    } else {
        if (subtitle) subtitle.textContent = 'Realtidsskydd är avstängt';
        if (statusText) statusText.textContent = 'Status: Avstängd';
        if (statusIndicator) {
            statusIndicator.style.backgroundColor = 'var(--text-secondary)';
            statusIndicator.style.boxShadow = 'none';
        }
        if (guardCard) guardCard.classList.remove('active-guard');

        if (homeStatusCard) homeStatusCard.classList.remove('active-guard');
        if (homeStatusDot) {
            homeStatusDot.style.backgroundColor = 'var(--danger-color)';
            homeStatusDot.style.boxShadow = 'none';
        }
        if (homeStatusText) homeStatusText.textContent = '🛡️ Guard Live är avstängt.';
    }
}

async function triggerSecurityAlert(reasonText) {
    const settingSound = document.getElementById('settingSound');
    const settingVibrate = document.getElementById('settingVibrate');

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
                    headers: { 'Content-Type': 'application/json' },
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

// Modal och inställningar
window.openSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
};

window.clearHistory = function() {
    localStorage.removeItem('kollad_history');
    renderHistory();
    alert('Sökhistoriken har rensats.');
};
