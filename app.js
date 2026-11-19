let LocalNotifications = null;
try {
    const mod = await import('@capacitor/local-notifications');
    LocalNotifications = mod.LocalNotifications;
} catch (e) {
    console.log('LocalNotifications ej tillgänglig i denna miljö:', e);
}

function getUserId() {
    let userId = localStorage.getItem('kollad_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('kollad_user_id', userId);
    }
    return userId;
}

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Byt flik mellan Hem, Guard och Varningar
function switchTab(tabName) {
    const tabViews = document.querySelectorAll('.tab-view');
    tabViews.forEach(view => {
        view.classList.toggle('hidden', view.id !== `tab-${tabName}`);
    });

    const navButtons = document.querySelectorAll('.bottom-nav .nav-item[data-tab]');
    navButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    refreshIcons();
}

window.switchTab = switchTab;

// Hantera statistik för blockerade hot
function incrementBlockedCount() {
    let count = parseInt(localStorage.getItem('kollad_blocked_count') || '0', 10);
    count += 1;
    localStorage.setItem('kollad_blocked_count', count);
    updateBlockedCountUI(count);
}

function updateBlockedCountUI(count) {
    const blockedCountEl = document.getElementById('blockedCount');
    if (blockedCountEl) {
        blockedCountEl.textContent = count;
    }
}

// Hantera sökhistorik
function saveToHistory(text, isDanger = false) {
    let history = JSON.parse(localStorage.getItem('kollad_history') || '[]');
    history = history.filter(item => (typeof item === 'string' ? item !== text : item.text !== text));
    history.unshift({ text, isDanger });
    history = history.slice(0, 5);
    localStorage.setItem('kollad_history', JSON.stringify(history));
    renderHistory();

    if (isDanger) {
        saveToWarnings(text);
    }
}

function renderHistory() {
    const historyList = document.getElementById('historyList');
    const history = JSON.parse(localStorage.getItem('kollad_history') || '[]');

    if (historyList) {
        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="history-item">
                    <span class="item-text" style="color: var(--text-secondary);">Inga kontroller gjorda ännu.</span>
                </div>`;
        } else {
            historyList.innerHTML = history.map(entry => {
                const text = typeof entry === 'string' ? entry : entry.text;
                const isDanger = typeof entry === 'object' && !!entry.isDanger;
                const iconName = text.includes('@') ? 'mail' : 'globe';
                const shortText = text.length > 26 ? text.substring(0, 26) + '...' : text;
                const safeAttr = text.replace(/'/g, "\\'");

                return `
                    <div class="history-item" style="cursor: pointer;" onclick="document.getElementById('userInput').value='${safeAttr}'">
                        <div class="item-left">
                            <i data-lucide="${iconName}" class="item-type-icon"></i>
                            <span class="item-text">${shortText}</span>
                        </div>
                        <div class="item-right">
                            <span class="${isDanger ? 'badge-danger' : 'badge-safe'}">${isDanger ? 'Varning' : 'Säker'}</span>
                            <span class="${isDanger ? 'dot-danger' : 'dot-safe'}"></span>
                        </div>
                    </div>`;
            }).join('');
        }
    }

    const historySection = document.getElementById('historySection');
    const historyChips = document.getElementById('historyChips');
    if (historySection && historyChips) {
        if (history.length > 0) {
            historySection.classList.remove('hidden');
            historyChips.innerHTML = '';
            history.forEach(entry => {
                const item = typeof entry === 'string' ? entry : entry.text;
                const chip = document.createElement('button');
                chip.className = 'history-chip';
                chip.textContent = item.length > 25 ? item.substring(0, 25) + '...' : item;
                chip.title = item;
                chip.addEventListener('click', () => {
                    const userInput = document.getElementById('userInput');
                    if (userInput) userInput.value = item;
                });
                historyChips.appendChild(chip);
            });
        } else {
            historySection.classList.add('hidden');
        }
    }

    refreshIcons();
}

// Hantera varningshistorik
function saveToWarnings(text, reason = 'Misstänkt bedrägeri') {
    let warnings = JSON.parse(localStorage.getItem('kollad_warnings') || '[]');
    warnings.unshift({
        text,
        reason,
        date: new Date().toLocaleDateString('sv-SE')
    });
    warnings = warnings.slice(0, 15);
    localStorage.setItem('kollad_warnings', JSON.stringify(warnings));
    renderWarnings();
}

function renderWarnings() {
    const warningsList = document.getElementById('warningsList');
    if (!warningsList) return;

    const warnings = JSON.parse(localStorage.getItem('kollad_warnings') || '[]');
    if (warnings.length === 0) {
        warningsList.innerHTML = `
            <div class="history-item">
                <span class="item-text" style="color: var(--text-secondary);">Inga hot har blockerats ännu.</span>
            </div>`;
        return;
    }

    warningsList.innerHTML = warnings.map(w => `
        <div class="history-item" style="flex-direction: column; align-items: flex-start; gap: 4px;">
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <span class="item-text" style="font-weight: 600;">${w.text}</span>
                <span class="badge-danger">Hög risk</span>
            </div>
            <small style="color: var(--text-secondary); font-size: 11px;">${w.date} • ${w.reason}</small>
        </div>
    `).join('');
}

window.clearWarnings = function() {
    localStorage.removeItem('kollad_warnings');
    renderWarnings();
};

async function triggerSecurityAlert(reasonText) {
    if (!LocalNotifications) return;

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
                        sound: 'default'
                    }
                ]
            });
        }
    } catch (error) {
        console.log('Kunde inte skicka notis:', error);
    }
}

function setShieldIcon(iconName, isOff) {
    const shieldIcon = document.getElementById('homeShieldIcon');
    if (!shieldIcon) return;

    shieldIcon.setAttribute('data-lucide', iconName);
    shieldIcon.classList.toggle('off', isOff);
    refreshIcons();
}

function applyGuardLiveState(isActive) {
    const toggle = document.getElementById('guardToggle');
    const subtitle = document.getElementById('guardSubtitle');
    const statusText = document.getElementById('statusText');
    const card = document.querySelector('.guard-live-card');
    const homeStatusCard = document.getElementById('homeStatusCard');
    const homeStatusDot = document.getElementById('homeStatusDot');
    const homeStatusText = document.getElementById('homeStatusText');
    const homeLivePill = document.getElementById('homeLivePill');
    const guardTabDot = document.getElementById('guardTabDot');

    if (toggle) toggle.checked = isActive;

    if (isActive) {
        if (subtitle) subtitle.textContent = 'Realtidsskydd är aktivt';
        if (statusText) statusText.textContent = 'Status: Aktiv';
        if (card) card.classList.add('active-guard');
        if (guardTabDot) guardTabDot.className = 'status-dot-green';
        if (homeStatusCard) homeStatusCard.className = 'status-card active-guard';
        if (homeStatusDot) homeStatusDot.className = 'status-dot-green';
        if (homeStatusText) homeStatusText.textContent = 'Guard Live är aktivt';
        if (homeLivePill) homeLivePill.style.display = 'inline-block';
        setShieldIcon('shield-check', false);
    } else {
        if (subtitle) subtitle.textContent = 'Realtidsskydd är avstängt';
        if (statusText) statusText.textContent = 'Status: Avstängd';
        if (card) card.classList.remove('active-guard');
        if (guardTabDot) guardTabDot.className = 'status-dot-off';
        if (homeStatusCard) homeStatusCard.className = 'status-card inactive-guard';
        if (homeStatusDot) homeStatusDot.className = 'status-dot-off';
        if (homeStatusText) homeStatusText.textContent = 'Guard Live är avstängt';
        if (homeLivePill) homeLivePill.style.display = 'none';
        setShieldIcon('shield-off', true);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();

    const savedGuardActive = localStorage.getItem('kollad_guard_live');
    applyGuardLiveState(savedGuardActive === null ? true : savedGuardActive === 'true');

    // Koppla flikknapparna i bottenmenyn
    document.querySelectorAll('.bottom-nav .nav-item[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Koppla snabbklistra-knapp om den finns
    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                const input = document.getElementById('userInput');
                if (input && text) {
                    input.value = text;
                    input.focus();
                }
            } catch (err) {
                console.log('Kunde inte läsa urklipp:', err);
            }
        });
    }

    const analyzeBtn = document.getElementById('analyzeBtn');
    const userInput = document.getElementById('userInput');
    const resultCard = document.getElementById('resultCard');
    const resultDescription = document.getElementById('resultDescription');

    const savedCount = parseInt(localStorage.getItem('kollad_blocked_count') || '0', 10);
    updateBlockedCountUI(savedCount);
    renderHistory();
    renderWarnings();

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const textToCheck = userInput.value.trim();

            if (!textToCheck) {
                alert('Vänligen skriv eller klistra in något att kontrollera.');
                return;
            }

            const btnText = analyzeBtn.querySelector('.btn-text');
            const spinner = analyzeBtn.querySelector('.spinner');
            if (btnText) btnText.textContent = 'ANALYSERAR...';
            if (spinner) spinner.classList.remove('hidden');

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
                let isDanger = false;

                if (typeof data.result === 'object' && data.result !== null) {
                    outputText = `Risknivå: ${data.result.risk}\nMotivering: ${data.result.reason}`;

                    if (data.result.risk && data.result.risk.toLowerCase().includes('hög')) {
                        isDanger = true;
                        incrementBlockedCount();
                        triggerSecurityAlert(data.result.reason);
                        saveToWarnings(textToCheck, data.result.reason);

                        const alertModal = document.getElementById('liveAlertModal');
                        if (alertModal) alertModal.classList.remove('hidden');
                    }
                }

                resultDescription.textContent = outputText || data.message || 'Analys klar.';
                saveToHistory(textToCheck, isDanger);

                if (data.checksRemaining !== undefined) {
                    resultDescription.innerHTML += `<br><br><small style="color: #888;">Gratiskontroller kvar: ${data.checksRemaining}</small>`;
                }

            } catch (error) {
                console.error('Fel:', error);
                resultDescription.textContent = error.message || 'Kunde inte nå servern. Försök igen senare.';
            } finally {
                if (btnText) btnText.textContent = 'KOLLA';
                if (spinner) spinner.classList.add('hidden');
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        if (!response.ok) throw new Error('Kunde inte nå servern.');

        const data = await response.json();
        container.textContent = data.result || 'Inga kända dataläckor hittades för denna e-postadress.';
    } catch (error) {
        console.error('Fel:', error);
        container.textContent = 'Kunde inte nå servern för e-postkontroll.';
    }
};

window.toggleGuardLive = function() {
    const toggle = document.getElementById('guardToggle');
    const isActive = !!(toggle && toggle.checked);
    localStorage.setItem('kollad_guard_live', String(isActive));
    applyGuardLiveState(isActive);
};

window.closeAlertModal = function() {
    const modal = document.getElementById('liveAlertModal');
    if (modal) modal.classList.add('hidden');
};

window.clearHistory = function() {
    localStorage.removeItem('kollad_history');
    renderHistory();
    alert('Sökhistoriken har rensats.');
};
