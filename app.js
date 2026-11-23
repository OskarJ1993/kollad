let LocalNotifications = null;
try {
    const mod = await import('@capacitor/local-notifications');
    LocalNotifications = mod.LocalNotifications;
} catch (e) {
    console.log('LocalNotifications ej tillgänglig i denna miljö:', e);
}

const DEFAULT_RADAR_ITEMS = [
    {
        id: 'postnord',
        title: 'PostNord-paket',
        category: 'Leveransbluff',
        reports: 62,
        sample: 'PostNord: Ditt paket har stoppats p.g.a. obetald tullavgift. Bekräfta här:'
    },
    {
        id: 'bankid',
        title: 'BankID-inloggning',
        category: 'Kontokapning',
        reports: 68,
        sample: 'Säkerhetsvarning: Ditt BankID behöver förnyas omgående via länken.'
    },
    {
        id: 'skatteverket',
        title: 'Skatteåterbäring',
        category: 'Myndighetsbluff',
        reports: 25,
        sample: 'Skatteverket: Du har en utbetalning som väntar på bekräftelse.'
    }
];

const TRIAL_DAYS = 7;

let toastTimeout = null;
let lastCheckedSummary = '';

function showToast(message) {
    const banner = document.getElementById('toastBanner');
    if (!banner) return;

    banner.textContent = message;
    banner.classList.remove('hidden');

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    toastTimeout = setTimeout(() => {
        banner.classList.add('hidden');
    }, 3000);
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

// Hopfällbar sektion för e-postläckor
window.toggleLeakSection = function() {
    const body = document.getElementById('leakSectionBody');
    const trigger = document.getElementById('toggleLeakBtn');
    const chevron = document.getElementById('leakChevron');
    if (!body) return;

    const willOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !willOpen);
    if (trigger) trigger.setAttribute('aria-expanded', String(willOpen));
    if (chevron) chevron.classList.toggle('rotated', willOpen);

    if (willOpen) {
        document.getElementById('leakEmailInput')?.focus();
    }
};

// PRO & 7-dagars testperiod
function getSubscriptionState() {
    const plan = localStorage.getItem('kollad_plan') || 'free'; // 'free' | 'trial' | 'pro'
    const trialStart = parseInt(localStorage.getItem('kollad_trial_start') || '0', 10);

    if (plan === 'pro') {
        return { plan: 'pro', daysLeft: null, isActivePro: true };
    }

    if (plan === 'trial' && trialStart > 0) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const elapsedDays = Math.floor((Date.now() - trialStart) / msPerDay);
        const daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays);

        if (daysLeft > 0) {
            return { plan: 'trial', daysLeft, isActivePro: true };
        }
        localStorage.setItem('kollad_plan', 'free');
    }

    return { plan: 'free', daysLeft: 0, isActivePro: false };
}

function updateSubscriptionUI(checksRemaining) {
    const state = getSubscriptionState();
    const pill = document.getElementById('planStatusPill');
    const pillText = document.getElementById('planStatusText');
    const settingsBadge = document.getElementById('settingsPlanBadge');
    const settingsDesc = document.getElementById('settingsPlanDesc');
    const trialBtn = document.getElementById('startTrialBtn');
    const upgradeBtn = document.getElementById('upgradeProBtn');

    if (pill) {
        pill.classList.toggle('is-pro', state.isActivePro);
    }

    if (state.plan === 'pro') {
        if (pillText) pillText.textContent = 'Kollad PRO • Obegränsat skydd';
        if (settingsBadge) settingsBadge.textContent = 'KOLLAD PRO';
        if (settingsDesc) settingsDesc.textContent = 'Du har full tillgång till alla funktioner.';
        if (trialBtn) trialBtn.classList.add('hidden');
        if (upgradeBtn) upgradeBtn.textContent = 'DU HAR REDAN PRO';
    } else if (state.plan === 'trial') {
        if (pillText) pillText.textContent = `PRO-test: ${state.daysLeft} dagar kvar • Uppgradera`;
        if (settingsBadge) settingsBadge.textContent = `7 DAGARS TEST (${state.daysLeft} D KVAR)`;
        if (settingsDesc) settingsDesc.textContent = 'Fullt PRO-skydd under din testperiod.';
        if (trialBtn) trialBtn.classList.add('hidden');
        if (upgradeBtn) upgradeBtn.textContent = 'UPPGRADERA TILL PRO NU';
    } else {
        const suffix = typeof checksRemaining === 'number'
            ? ` • ${checksRemaining} kontroller kvar`
            : ' • Uppgradera till PRO';
        if (pillText) pillText.textContent = `Gratisversion${suffix}`;
        if (settingsBadge) settingsBadge.textContent = 'GRATISPLAN';
        if (settingsDesc) settingsDesc.textContent = 'Prova 7 dagar gratis eller uppgradera till PRO.';
        const hasUsedTrial = localStorage.getItem('kollad_trial_used') === 'true';
        if (trialBtn) trialBtn.classList.toggle('hidden', hasUsedTrial);
        if (upgradeBtn) upgradeBtn.textContent = 'UPPGRADERA TILL PRO NU';
    }
}

window.openProModal = function() {
    window.closeSettings();
    updateSubscriptionUI();
    const modal = document.getElementById('proModal');
    if (modal) {
        modal.classList.remove('hidden');
        refreshIcons();
    }
};

window.closeProModal = function() {
    const modal = document.getElementById('proModal');
    if (modal) modal.classList.add('hidden');
};

window.activateProTrial = function() {
    if (localStorage.getItem('kollad_trial_used') === 'true') {
        showToast('Din 7-dagars testperiod har redan använts.');
        return;
    }
    localStorage.setItem('kollad_plan', 'trial');
    localStorage.setItem('kollad_trial_start', String(Date.now()));
    localStorage.setItem('kollad_trial_used', 'true');
    updateSubscriptionUI();
    document.getElementById('proUpgradeBanner')?.classList.add('hidden');
    window.closeProModal();
    showToast('7 dagars gratis PRO-test aktiverat!');
};

window.upgradeToPro = function() {
    localStorage.setItem('kollad_plan', 'pro');
    updateSubscriptionUI();
    document.getElementById('proUpgradeBanner')?.classList.add('hidden');
    window.closeProModal();
    showToast('Välkommen till Kollad PRO!');
};

window.restorePurchases = function() {
    const state = getSubscriptionState();
    if (state.plan === 'pro') {
        showToast('Ditt PRO-medlemskap är aktivt.');
    } else {
        showToast('Inga tidigare PRO-köp hittades på denna enhet.');
    }
};

// Byt flik mellan Hem, Bluff-radar, Varningar och Akut-hjälp
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

// Bluff-radarn logik
function detectScamCategory(text) {
    const lower = text.toLowerCase();
    if (lower.includes('postnord') || lower.includes('paket') || lower.includes('dhl') || lower.includes('bring')) {
        return { id: 'postnord', title: 'PostNord-paket', category: 'Leveransbluff' };
    }
    if (lower.includes('bankid') || lower.includes('bank') || lower.includes('swedbank') || lower.includes('nordea')) {
        return { id: 'bankid', title: 'BankID-inloggning', category: 'Kontokapning' };
    }
    if (lower.includes('skatteverket') || lower.includes('kivra') || lower.includes('återbäring')) {
        return { id: 'skatteverket', title: 'Skatteåterbäring', category: 'Myndighetsbluff' };
    }
    return {
        id: 'custom_' + lower.replace(/[^a-z0-9]/g, '').slice(0, 12),
        title: text.length > 24 ? text.slice(0, 24) + '...' : text,
        category: 'Rapporterad bluff'
    };
}

function updateLocalRadar(text) {
    const saved = JSON.parse(localStorage.getItem('kollad_radar') || 'null');
    const radar = Array.isArray(saved) && saved.length > 0 ? [...saved] : [...DEFAULT_RADAR_ITEMS];
    const matchInfo = detectScamCategory(text);

    const existing = radar.find(item => item.id === matchInfo.id);
    if (existing) {
        existing.reports += 1;
        existing.sample = text;
    } else {
        radar.unshift({
            ...matchInfo,
            reports: 1,
            sample: text
        });
    }

    radar.sort((a, b) => b.reports - a.reports);
    const trimmed = radar.slice(0, 8);
    localStorage.setItem('kollad_radar', JSON.stringify(trimmed));
    renderScamRadar(trimmed);
}

function renderScamRadar(items) {
    const radarList = document.getElementById('radarList');
    if (!radarList) return;

    radarList.innerHTML = '';

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'history-item radar-item';

        const left = document.createElement('div');
        left.className = 'item-left radar-meta';

        const titleEl = document.createElement('span');
        titleEl.className = 'item-text';
        titleEl.style.fontWeight = '600';
        titleEl.textContent = item.title;

        const subEl = document.createElement('small');
        subEl.className = 'radar-subtext';
        subEl.textContent = `${item.reports} rapporter • ${item.category}`;

        left.append(titleEl, subEl);

        const right = document.createElement('div');
        right.className = 'item-right';

        const badge = document.createElement('span');
        badge.className = 'badge-danger';
        badge.textContent = 'Hög risk';

        right.appendChild(badge);
        row.append(left, right);

        row.addEventListener('click', () => {
            const input = document.getElementById('userInput');
            if (input) {
                input.value = item.sample || item.title;
                input.focus();
            }
            switchTab('home');
            showToast('Exempel ifyllt – tryck KOLLA för att analysera.');
        });

        radarList.appendChild(row);
    });

    refreshIcons();
}

function loadScamRadar() {
    const saved = JSON.parse(localStorage.getItem('kollad_radar') || 'null');
    const items = Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_RADAR_ITEMS;
    renderScamRadar(items);
}

// Hantera statistik för dagens blockerade hot (nollställs per dag)
function getTodayKey() {
    return new Date().toLocaleDateString('sv-SE');
}

function getTodayBlockedCount() {
    const savedDate = localStorage.getItem('kollad_blocked_date');
    const today = getTodayKey();
    if (savedDate !== today) {
        localStorage.setItem('kollad_blocked_date', today);
        localStorage.setItem('kollad_blocked_count', '0');
        return 0;
    }
    return parseInt(localStorage.getItem('kollad_blocked_count') || '0', 10);
}

function incrementBlockedCount() {
    const count = getTodayBlockedCount() + 1;
    localStorage.setItem('kollad_blocked_date', getTodayKey());
    localStorage.setItem('kollad_blocked_count', String(count));
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
        historyList.innerHTML = '';

        if (history.length === 0) {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'history-item';

            const emptyText = document.createElement('span');
            emptyText.className = 'item-text';
            emptyText.style.color = 'var(--text-secondary)';
            emptyText.textContent = 'Inga kontroller gjorda ännu.';

            emptyRow.appendChild(emptyText);
            historyList.appendChild(emptyRow);
        } else {
            history.forEach(entry => {
                const text = typeof entry === 'string' ? entry : entry.text;
                const isDanger = typeof entry === 'object' && !!entry.isDanger;
                const iconName = text.includes('@') ? 'mail' : 'globe';
                const shortText = text.length > 26 ? text.substring(0, 26) + '...' : text;

                const row = document.createElement('div');
                row.className = 'history-item';
                row.style.cursor = 'pointer';

                const left = document.createElement('div');
                left.className = 'item-left';

                const icon = document.createElement('i');
                icon.setAttribute('data-lucide', iconName);
                icon.className = 'item-type-icon';

                const span = document.createElement('span');
                span.className = 'item-text';
                span.textContent = shortText;

                left.append(icon, span);

                const right = document.createElement('div');
                right.className = 'item-right';

                const badge = document.createElement('span');
                badge.className = isDanger ? 'badge-danger' : 'badge-safe';
                badge.textContent = isDanger ? 'Varning' : 'Säker';

                const dot = document.createElement('span');
                dot.className = isDanger ? 'dot-danger' : 'dot-safe';

                right.append(badge, dot);
                row.append(left, right);

                row.addEventListener('click', () => {
                    const input = document.getElementById('userInput');
                    if (input) {
                        input.value = text;
                        input.focus();
                    }
                    showToast('Vald post placerad i sökfältet.');
                });

                historyList.appendChild(row);
            });
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
    warningsList.innerHTML = '';

    if (warnings.length === 0) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'history-item';

        const emptyText = document.createElement('span');
        emptyText.className = 'item-text';
        emptyText.style.color = 'var(--text-secondary)';
        emptyText.textContent = 'Inga hot har blockerats ännu.';

        emptyRow.appendChild(emptyText);
        warningsList.appendChild(emptyRow);
        return;
    }

    warnings.forEach(w => {
        const row = document.createElement('div');
        row.className = 'history-item';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'flex-start';
        row.style.gap = '4px';

        const top = document.createElement('div');
        top.style.display = 'flex';
        top.style.justifyContent = 'space-between';
        top.style.width = '100%';
        top.style.gap = '8px';

        const titleEl = document.createElement('span');
        titleEl.className = 'item-text';
        titleEl.style.fontWeight = '600';
        titleEl.textContent = w.text;

        const badge = document.createElement('span');
        badge.className = 'badge-danger';
        badge.textContent = 'Hög risk';

        top.append(titleEl, badge);

        const meta = document.createElement('small');
        meta.style.color = 'var(--text-secondary)';
        meta.style.fontSize = '11px';
        meta.textContent = `${w.date} • ${w.reason}`;

        row.append(top, meta);
        warningsList.appendChild(row);
    });
}

window.clearWarnings = function() {
    localStorage.removeItem('kollad_warnings');
    renderWarnings();
    showToast('Varningslistan rensades.');
};

function getAlertPreferences() {
    return {
        sound: localStorage.getItem('kollad_pref_sound') !== 'false',
        vibrate: localStorage.getItem('kollad_pref_vibrate') !== 'false'
    };
}

async function triggerSecurityAlert(reasonText) {
    const prefs = getAlertPreferences();

    if (prefs.vibrate && typeof navigator.vibrate === 'function') {
        navigator.vibrate([200, 100, 200]);
    }

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
                        sound: prefs.sound ? 'default' : undefined
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
    const homeStatusCard = document.getElementById('homeStatusCard');
    const homeStatusDot = document.getElementById('homeStatusDot');
    const homeStatusText = document.getElementById('homeStatusText');
    const homeLivePill = document.getElementById('homeLivePill');
    const count = getTodayBlockedCount();

    if (toggle) toggle.checked = isActive;

    if (isActive) {
        if (subtitle) {
            subtitle.innerHTML = `Realtidsskydd aktivt • <span id="blockedCount" class="stat-highlight">${count}</span> blockerade hot idag`;
        }
        if (homeStatusCard) homeStatusCard.className = 'status-card active-guard guard-live-card';
        if (homeStatusDot) homeStatusDot.className = 'status-dot-green';
        if (homeStatusText) homeStatusText.textContent = 'Guard Live är aktivt';
        if (homeLivePill) homeLivePill.style.display = 'inline-block';
        setShieldIcon('shield-check', false);
    } else {
        if (subtitle) {
            subtitle.innerHTML = `Skyddet är pausat • <span id="blockedCount" class="stat-highlight">${count}</span> blockerade hot idag`;
        }
        if (homeStatusCard) homeStatusCard.className = 'status-card inactive-guard guard-live-card';
        if (homeStatusDot) homeStatusDot.className = 'status-dot-off';
        if (homeStatusText) homeStatusText.textContent = 'Guard Live är avstängt';
        if (homeLivePill) homeLivePill.style.display = 'none';
        setShieldIcon('shield-off', true);
    }
}

function applyLargeTextState(isLarge) {
    const container = document.getElementById('appContainer');
    const toggle = document.getElementById('settingLargeText');
    if (container) {
        container.classList.toggle('large-text', isLarge);
    }
    if (toggle) {
        toggle.checked = isLarge;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    updateSubscriptionUI();

    const savedGuardActive = localStorage.getItem('kollad_guard_live');
    applyGuardLiveState(savedGuardActive === null ? true : savedGuardActive === 'true');

    const savedLargeText = localStorage.getItem('kollad_large_text') === 'true';
    applyLargeTextState(savedLargeText);

    const prefs = getAlertPreferences();
    const soundEl = document.getElementById('settingSound');
    const vibrateEl = document.getElementById('settingVibrate');
    if (soundEl) soundEl.checked = prefs.sound;
    if (vibrateEl) vibrateEl.checked = prefs.vibrate;

    document.querySelectorAll('.bottom-nav .nav-item[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    document.querySelectorAll('.example-chip[data-sample]').forEach(chip => {
        chip.addEventListener('click', () => {
            const input = document.getElementById('userInput');
            if (input) {
                input.value = chip.dataset.sample || '';
                input.focus();
            }
            showToast('Exempel ifyllt – tryck KOLLA för att testa.');
        });
    });

    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                window.closeSettings();
            }
        });
    }

    const proModal = document.getElementById('proModal');
    if (proModal) {
        proModal.addEventListener('click', (e) => {
            if (e.target === proModal) {
                window.closeProModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeSettings();
            window.closeProModal();
        }
    });

    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                const input = document.getElementById('userInput');
                if (input && text) {
                    input.value = text;
                    input.focus();
                    showToast('Inklistrat från urklipp.');
                } else {
                    showToast('Urklippet är tomt.');
                }
            } catch (err) {
                console.log('Kunde inte läsa urklipp:', err);
                showToast('Klistra in manuellt i rutan.');
            }
        });
    }

    const askRelativeBtn = document.getElementById('askRelativeBtn');
    if (askRelativeBtn) {
        askRelativeBtn.addEventListener('click', async () => {
            const inputVal = document.getElementById('userInput')?.value.trim() || '';
            const shareMessage = `Kan du kika på det här i Kollad innan jag klickar?\nInmatning: ${inputVal}\nAnalys: ${lastCheckedSummary}`;

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Kollad – Fråga en anhörig',
                        text: shareMessage
                    });
                    return;
                } catch (e) {
                    if (e?.name === 'AbortError') return;
                }
            }

            try {
                await navigator.clipboard.writeText(shareMessage);
                showToast('Sammanfattning kopierad – klistra in i SMS eller chatt till anhörig.');
            } catch (e) {
                showToast('Kunde inte dela automatiskt.');
            }
        });
    }

    const openHelpFromResultBtn = document.getElementById('openHelpFromResultBtn');
    if (openHelpFromResultBtn) {
        openHelpFromResultBtn.addEventListener('click', () => {
            switchTab('emergency');
        });
    }

    const analyzeBtn = document.getElementById('analyzeBtn');
    const userInput = document.getElementById('userInput');
    const resultCard = document.getElementById('resultCard');
    const resultDescription = document.getElementById('resultDescription');
    const proUpgradeBanner = document.getElementById('proUpgradeBanner');

    updateBlockedCountUI(getTodayBlockedCount());
    renderHistory();
    renderWarnings();
    loadScamRadar();

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const textToCheck = userInput.value.trim();

            if (!textToCheck) {
                showToast('Skriv eller klistra in en länk, domän eller e-post först.');
                return;
            }

            const btnText = analyzeBtn.querySelector('.btn-text');
            const spinner = analyzeBtn.querySelector('.spinner');
            if (btnText) btnText.textContent = 'ANALYSERAR...';
            if (spinner) spinner.classList.remove('hidden');

            resultCard.classList.remove('hidden');
            if (proUpgradeBanner) proUpgradeBanner.classList.add('hidden');
            resultDescription.textContent = 'Analyserar pågår...';

            const slowWakeTimer = setTimeout(() => {
                if (resultDescription.textContent === 'Analyserar pågår...') {
                    resultDescription.textContent = 'Startar säkerhetsanalysen, det kan ta några sekunder...';
                }
            }, 3500);

            try {
                const subState = getSubscriptionState();
                const response = await fetch('https://kollad.onrender.com/api/check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        userId: getUserId(),
                        textToAnalyze: textToCheck,
                        plan: subState.plan
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    if (response.status === 403) {
                        resultDescription.innerHTML = `<span style="color: #ff4d4d;">${data.error || 'Du har nått gränsen för dina gratiskontroller.'}</span>`;
                        if (proUpgradeBanner) {
                            proUpgradeBanner.classList.remove('hidden');
                            refreshIcons();
                        }
                        updateSubscriptionUI(0);
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
                        updateLocalRadar(textToCheck);
                    }
                }

                lastCheckedSummary = outputText || data.message || 'Analys klar.';
                resultDescription.textContent = lastCheckedSummary;
                saveToHistory(textToCheck, isDanger);

                if (data.checksRemaining !== undefined && !subState.isActivePro) {
                    resultDescription.innerHTML += `<br><br><small style="color: #888;">Gratiskontroller kvar: ${data.checksRemaining}</small>`;
                    updateSubscriptionUI(data.checksRemaining);
                    if (data.checksRemaining === 0 && proUpgradeBanner) {
                        proUpgradeBanner.classList.remove('hidden');
                        refreshIcons();
                    }
                } else {
                    updateSubscriptionUI();
                }

            } catch (error) {
                console.error('Fel:', error);
                lastCheckedSummary = error.message || 'Kunde inte nå servern. Försök igen senare.';
                resultDescription.textContent = lastCheckedSummary;
            } finally {
                clearTimeout(slowWakeTimer);
                if (btnText) btnText.textContent = 'KOLLA';
                if (spinner) spinner.classList.add('hidden');
            }
        });
    }
});

// Globala funktioner för gränssnittet
window.openSettings = function() {
    updateSubscriptionUI();
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        refreshIcons();
    }
};

window.closeSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
};

window.toggleLargeText = function() {
    const toggle = document.getElementById('settingLargeText');
    const isLarge = !!(toggle && toggle.checked);
    localStorage.setItem('kollad_large_text', String(isLarge));
    applyLargeTextState(isLarge);
    showToast(isLarge ? 'Större text aktiverad.' : 'Normal textstorlek.');
};

window.saveAlertPreferences = function() {
    const soundEl = document.getElementById('settingSound');
    const vibrateEl = document.getElementById('settingVibrate');
    if (soundEl) localStorage.setItem('kollad_pref_sound', String(soundEl.checked));
    if (vibrateEl) localStorage.setItem('kollad_pref_vibrate', String(vibrateEl.checked));
    showToast('Aviseringsinställningar sparade.');
};

window.checkEmailLeak = async function() {
    const emailInput = document.getElementById('leakEmailInput');
    const container = document.getElementById('leakResultContainer');

    if (!emailInput || !container) return;

    const email = emailInput.value.trim();
    if (!email) {
        showToast('Ange en e-postadress att söka efter.');
        return;
    }

    container.classList.remove('hidden');
    container.textContent = 'Kontrollerar dataläckor mot servern...';

    try {
        const subState = getSubscriptionState();
        const response = await fetch('https://kollad.onrender.com/api/check-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, userId: getUserId(), plan: subState.plan })
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
    showToast(isActive ? 'Guard Live är nu aktivt.' : 'Guard Live är avstängt.');
};

window.clearHistory = function() {
    localStorage.removeItem('kollad_history');
    renderHistory();
    showToast('Sökhistoriken har rensats.');
};
