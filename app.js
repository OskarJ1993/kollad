let LocalNotifications = null;

async function initNotifications() {
    try {
        const mod = await import('@capacitor/local-notifications');
        LocalNotifications = mod.LocalNotifications;
    } catch (e) {
        console.log('LocalNotifications ej tillgänglig i denna miljö:', e);
    }
}

initNotifications();

const API_BASE = 'https://kollad.onrender.com';

const DEFAULT_RADAR_ITEMS = [
    {
        id: 'postnord',
        title: 'PostNord-paket',
        category: 'Leveransbluff',
        reports: 62,
        sample: 'PostNord: Ditt paket har stoppats p.g.a. obetald tullavgift. Bekräfta här: http://postnord-leverans-se.com'
    },
    {
        id: 'bankid',
        title: 'BankID-inloggning',
        category: 'Kontokapning',
        reports: 68,
        sample: 'Säkerhetsvarning: Ditt BankID behöver förnyas omgående via länken. https://bankid-sakerhet-kontroll.se/logga-in'
    },
    {
        id: 'cert-natfiske',
        title: 'Falska mejl & inloggningssidor',
        category: 'Nätfiske • CERT-SE',
        reports: 'Aktuell varning',
        sample: 'Hej, granska den delade fakturan och logga in här för att bekräfta ditt konto.'
    },
    {
        id: 'fakturabluff',
        title: 'Falska fakturor & påminnelser',
        category: 'Fakturabluff',
        reports: 34,
        sample: 'Påminnelse: Obetald faktura med förseningsavgift. Öppna fakturan här för att undvika inkasso.'
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
let groupPollTimer = null;

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

// Tar emot delad text/länk via URL-parametrar (redo för iOS/Android Share Target)
function handleIncomingShare() {
    const params = new URLSearchParams(window.location.search);
    const sharedText =
        params.get('share') ||
        params.get('text') ||
        params.get('url') ||
        params.get('q');

    if (!sharedText) return;

    const cleanText = sharedText.trim();
    if (!cleanText) return;

    switchTab('home');
    const input = document.getElementById('userInput');
    if (input) {
        input.value = cleanText;
    }

    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);

    showToast('Delat innehåll mottaget – tryck KOLLA för att analysera.');
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

function startGroupPolling() {
    stopGroupPolling();
    groupPollTimer = setInterval(() => {
        if (!document.hidden) {
            syncFamilyGroupFromServer();
        }
    }, 15000);
}

function stopGroupPolling() {
    if (groupPollTimer) {
        clearInterval(groupPollTimer);
        groupPollTimer = null;
    }
}

// Byt flik mellan Hem, Bluff-radar, Anhörig, Varningar och Akut-hjälp
function switchTab(tabName) {
    const tabViews = document.querySelectorAll('.tab-view');
    tabViews.forEach(view => {
        view.classList.toggle('hidden', view.id !== `tab-${tabName}`);
    });

    const navButtons = document.querySelectorAll('.bottom-nav .nav-item[data-tab]');
    navButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    if (tabName === 'family') {
        const homeVal = document.getElementById('userInput')?.value.trim() || '';
        const relInput = document.getElementById('relativeQuestionInput');
        if (relInput && !relInput.value.trim() && homeVal) {
            relInput.value = homeVal;
        }
        renderRelativeContact();
        renderFamilyGroup();
        syncFamilyGroupFromServer();
        startGroupPolling();
    } else {
        stopGroupPolling();
    }

    if (tabName === 'emergency') {
        renderRelativeContact();
    }

    refreshIcons();
}

window.switchTab = switchTab;

// Anhörig-kontakt & Fråga anhörig
function getRelativeContact() {
    try {
        return JSON.parse(localStorage.getItem('kollad_relative_contact') || 'null');
    } catch (e) {
        return null;
    }
}

function renderRelativeContact() {
    const contact = getRelativeContact();
    const card = document.getElementById('savedRelativeCard');
    const form = document.getElementById('relativeSetupForm');
    const nameEl = document.getElementById('savedRelativeName');
    const phoneEl = document.getElementById('savedRelativePhone');
    const callLink = document.getElementById('callRelativeLink');
    const emergencyCallBtn = document.getElementById('emergencyRelativeCallBtn');
    const emergencyCallLabel = document.getElementById('emergencyRelativeCallLabel');

    if (contact && contact.name) {
        card?.classList.remove('hidden');
        form?.classList.add('hidden');
        if (nameEl) nameEl.textContent = contact.name;
        if (phoneEl) phoneEl.textContent = contact.phone || 'Inget nummer sparat';
        if (callLink) {
            if (contact.phone) {
                callLink.href = `tel:${contact.phone.replace(/\s+/g, '')}`;
                callLink.classList.remove('hidden');
            } else {
                callLink.classList.add('hidden');
            }
        }
        if (emergencyCallBtn) {
            if (contact.phone) {
                emergencyCallBtn.href = `tel:${contact.phone.replace(/\s+/g, '')}`;
                emergencyCallBtn.classList.remove('hidden');
                if (emergencyCallLabel) {
                    emergencyCallLabel.textContent = `Ring ${contact.name}`;
                }
            } else {
                emergencyCallBtn.classList.add('hidden');
            }
        }
    } else {
        card?.classList.add('hidden');
        form?.classList.remove('hidden');
        emergencyCallBtn?.classList.add('hidden');
    }
    refreshIcons();
}

window.saveRelativeContact = function() {
    const name = document.getElementById('relativeNameInput')?.value.trim() || '';
    const phone = document.getElementById('relativePhoneInput')?.value.trim() || '';

    if (!name) {
        showToast('Skriv in namn på din anhöriga först.');
        return;
    }

    localStorage.setItem('kollad_relative_contact', JSON.stringify({ name, phone }));
    renderRelativeContact();
    showToast(`Sparade ${name} som trygghetskontakt.`);
};

window.editRelativeContact = function() {
    const contact = getRelativeContact();
    const nameInput = document.getElementById('relativeNameInput');
    const phoneInput = document.getElementById('relativePhoneInput');
    if (nameInput && contact) nameInput.value = contact.name || '';
    if (phoneInput && contact) phoneInput.value = contact.phone || '';

    document.getElementById('savedRelativeCard')?.classList.add('hidden');
    document.getElementById('relativeSetupForm')?.classList.remove('hidden');
};

window.sendToRelative = async function() {
    const contact = getRelativeContact();
    const customQuestion = document.getElementById('relativeQuestionInput')?.value.trim() || '';
    const homeInput = document.getElementById('userInput')?.value.trim() || '';
    const content = customQuestion || homeInput;

    const message = content
        ? `Hej${contact?.name ? ' ' + contact.name.split(' ')[0] : ''}! Kan du hjälpa mig kolla om det här är säkert innan jag klickar?\n\n"${content}"${lastCheckedSummary ? '\n\nKollad-analys: ' + lastCheckedSummary : ''}`
        : `Hej${contact?.name ? ' ' + contact.name.split(' ')[0] : ''}! Jag har fått ett misstänkt meddelande och vill dubbelkolla med dig innan jag gör något.`;

    if (contact && contact.phone) {
        const cleanPhone = contact.phone.replace(/\s+/g, '');
        const sep = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
        window.location.href = `sms:${cleanPhone}${sep}body=${encodeURIComponent(message)}`;
        return;
    }

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Kollad – Fråga en anhörig',
                text: message
            });
            return;
        } catch (e) {
            if (e?.name === 'AbortError') return;
        }
    }

    try {
        await navigator.clipboard.writeText(message);
        showToast('Meddelande kopierat – klistra in i SMS eller chatt.');
    } catch (e) {
        showToast('Kunde inte öppna delning automatiskt.');
    }
};

// Familjegrupp (synkad mot server + lokal cache)
function getFamilyGroup() {
    try {
        return JSON.parse(localStorage.getItem('kollad_family_group') || 'null');
    } catch (e) {
        return null;
    }
}

function saveFamilyGroup(group) {
    localStorage.setItem('kollad_family_group', JSON.stringify(group));
    renderFamilyGroup();
}

async function syncFamilyGroupFromServer() {
    const group = getFamilyGroup();
    if (!group || !group.code) return;

    try {
        const res = await fetch(`${API_BASE}/api/group/${encodeURIComponent(group.code)}`);
        if (!res.ok) return;
        const serverGroup = await res.json();
        if (Array.isArray(serverGroup.events)) {
            saveFamilyGroup({
                ...group,
                name: serverGroup.name || group.name,
                events: serverGroup.events
            });
        }
    } catch (err) {
        console.log('Kunde inte hämta grupp från servern:', err);
    }
}

function renderFamilyGroup() {
    const group = getFamilyGroup();
    const joinCreateView = document.getElementById('groupJoinOrCreateView');
    const activeView = document.getElementById('groupActiveView');
    const statusPill = document.getElementById('groupStatusPill');
    const nameEl = document.getElementById('activeGroupName');
    const codeEl = document.getElementById('activeGroupCode');
    const shareToggle = document.getElementById('shareWarningsToggle');
    const feedList = document.getElementById('groupFeedList');

    if (!group) {
        joinCreateView?.classList.remove('hidden');
        activeView?.classList.add('hidden');
        if (statusPill) statusPill.textContent = 'REDO';
        return;
    }

    joinCreateView?.classList.add('hidden');
    activeView?.classList.remove('hidden');
    if (statusPill) statusPill.textContent = 'AKTIV';
    if (nameEl) nameEl.textContent = group.name;
    if (codeEl) codeEl.textContent = group.code;
    if (shareToggle) shareToggle.checked = group.shareWarnings !== false;

    if (feedList) {
        feedList.innerHTML = '';
        const events = Array.isArray(group.events) ? group.events : [];
        if (events.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'history-item';
            const span = document.createElement('span');
            span.className = 'item-text';
            span.style.color = 'var(--text-secondary)';
            span.textContent = 'Inga delade varningar i gruppen ännu.';
            empty.appendChild(span);
            feedList.appendChild(empty);
        } else {
            events.forEach(ev => {
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
                titleEl.textContent = ev.text;

                const badge = document.createElement('span');
                badge.className = 'badge-danger';
                badge.textContent = ev.member || 'Varning';

                top.append(titleEl, badge);

                const meta = document.createElement('small');
                meta.className = 'radar-subtext';
                meta.textContent = `${ev.date} • ${ev.reason}`;

                row.append(top, meta);
                feedList.appendChild(row);
            });
        }
    }
    refreshIcons();
}

window.createFamilyGroup = async function() {
    const name = document.getElementById('groupNameInput')?.value.trim() || 'Min familjegrupp';
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const code = `KOLLAD-${randomDigits}`;

    saveFamilyGroup({
        name,
        code,
        shareWarnings: true,
        events: []
    });

    try {
        await fetch(`${API_BASE}/api/group/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                name,
                member: 'Gruppstart',
                text: `Gruppen "${name}" skapades`,
                reason: 'Redo för delade varningar'
            })
        });
        await syncFamilyGroupFromServer();
    } catch (e) {
        console.log('Kunde inte registrera grupp på servern:', e);
    }

    startGroupPolling();
    showToast(`Familjegruppen "${name}" skapades!`);
};

window.joinFamilyGroup = async function() {
    const rawCode = document.getElementById('joinCodeInput')?.value.trim().toUpperCase() || '';
    if (!rawCode) {
        showToast('Skriv in en inbjudningskod först.');
        return;
    }

    const code = rawCode.startsWith('KOLLAD-') ? rawCode : `KOLLAD-${rawCode}`;
    saveFamilyGroup({
        name: 'Familjegrupp',
        code,
        shareWarnings: true,
        events: []
    });
    await syncFamilyGroupFromServer();
    startGroupPolling();
    showToast(`Ansluten till grupp ${code}!`);
};

window.shareGroupInvite = async function() {
    const group = getFamilyGroup();
    if (!group) return;

    const inviteText = `Gå med i vår trygghetsgrupp "${group.name}" i appen Kollad så vi kan hjälpas åt mot bedrägerier.\nInbjudningskod: ${group.code}`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Inbjudan till Kollad Familjegrupp',
                text: inviteText
            });
            return;
        } catch (e) {
            if (e?.name === 'AbortError') return;
        }
    }

    try {
        await navigator.clipboard.writeText(inviteText);
        showToast(`Inbjudningskod ${group.code} kopierad!`);
    } catch (e) {
        showToast(`Din gruppkod är: ${group.code}`);
    }
};

window.toggleGroupWarningSync = function() {
    const group = getFamilyGroup();
    if (!group) return;
    const toggle = document.getElementById('shareWarningsToggle');
    group.shareWarnings = !!(toggle && toggle.checked);
    saveFamilyGroup(group);
    showToast(group.shareWarnings ? 'Varningar delas med gruppen.' : 'Delning med gruppen pausad.');
};

window.leaveFamilyGroup = function() {
    stopGroupPolling();
    localStorage.removeItem('kollad_family_group');
    renderFamilyGroup();
    showToast('Du har lämnat familjegruppen.');
};

async function pushWarningToFamilyGroup(text, reason) {
    const group = getFamilyGroup();
    if (!group || group.shareWarnings === false) return;

    const shortText = text.length > 42 ? text.slice(0, 42) + '...' : text;
    const events = Array.isArray(group.events) ? group.events : [];
    events.unshift({
        member: 'Du',
        text: shortText,
        reason: reason || 'Hög risk upptäckt',
        date: new Date().toLocaleDateString('sv-SE')
    });
    group.events = events.slice(0, 20);
    saveFamilyGroup(group);

    try {
        const res = await fetch(`${API_BASE}/api/group/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: group.code,
                name: group.name,
                member: 'Du',
                text: shortText,
                reason: reason || 'Hög risk upptäckt'
            })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.group && Array.isArray(data.group.events)) {
                saveFamilyGroup({ ...group, events: data.group.events });
            }
        }
    } catch (e) {
        console.log('Kunde inte skicka varning till serverns grupp:', e);
    }
}

// Bluff-radarn logik
function detectScamCategory(text) {
    const lower = text.toLowerCase();
    if (lower.includes('postnord') || lower.includes('paket') || lower.includes('dhl') || lower.includes('bring')) {
        return { id: 'postnord', title: 'PostNord-paket', category: 'Leveransbluff' };
    }
    if (lower.includes('bankid') || lower.includes('bank') || lower.includes('swedbank') || lower.includes('nordea')) {
        return { id: 'bankid', title: 'BankID-inloggning', category: 'Kontokapning' };
    }
    if (lower.includes('faktura') || lower.includes('inkasso') || lower.includes('betalning')) {
        return { id: 'fakturabluff', title: 'Falska fakturor & påminnelser', category: 'Fakturabluff' };
    }
    if (lower.includes('skatteverket') || lower.includes('kivra') || lower.includes('återbäring')) {
        return { id: 'skatteverket', title: 'Skatteåterbäring', category: 'Myndighetsbluff' };
    }
    if (lower.includes('konto') || lower.includes('logga in') || lower.includes('mejl') || lower.includes('delad')) {
        return { id: 'cert-natfiske', title: 'Falska mejl & inloggningssidor', category: 'Nätfiske • CERT-SE' };
    }
    return {
        id: 'custom_' + lower.replace(/[^a-z0-9]/g, '').slice(0, 12),
        title: text.length > 24 ? text.slice(0, 24) + '...' : text,
        category: 'Rapporterad bluff'
    };
}

function getMergedRadarItems() {
    let saved = [];
    try {
        const parsed = JSON.parse(localStorage.getItem('kollad_radar') || '[]');
        if (Array.isArray(parsed)) saved = parsed;
    } catch (e) {
        saved = [];
    }

    const mergedMap = new Map();
    DEFAULT_RADAR_ITEMS.forEach(item => mergedMap.set(item.id, { ...item }));
    saved.forEach(item => {
        if (item && item.id) {
            mergedMap.set(item.id, { ...mergedMap.get(item.id), ...item });
        }
    });

    return Array.from(mergedMap.values());
}

function updateLocalRadar(text) {
    const radar = getMergedRadarItems();
    const matchInfo = detectScamCategory(text);

    const existing = radar.find(item => item.id === matchInfo.id);
    if (existing) {
        if (typeof existing.reports === 'number') {
            existing.reports += 1;
        } else {
            existing.reports = 'Flera nya rapporter';
        }
        existing.sample = text;
    } else {
        radar.unshift({
            ...matchInfo,
            reports: 1,
            sample: text
        });
    }

    radar.sort((a, b) => {
        const aNum = typeof a.reports === 'number' ? a.reports : 999;
        const bNum = typeof b.reports === 'number' ? b.reports : 999;
        return bNum - aNum;
    });

    const trimmed = radar.slice(0, 8);
    localStorage.setItem('kollad_radar', JSON.stringify(trimmed));
    renderScamRadar(trimmed);
}

function formatRadarMeta(item) {
    if (typeof item.reports === 'number') {
        return `${item.reports} rapporter • ${item.category}`;
    }
    return `${item.reports} • ${item.category}`;
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
        subEl.textContent = formatRadarMeta(item);

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
            }
            switchTab('home');
            showToast('Exempel ifyllt – tryck KOLLA för att analysera.');
        });

        radarList.appendChild(row);
    });

    refreshIcons();
}

async function loadScamRadar() {
    const items = getMergedRadarItems();
    localStorage.setItem('kollad_radar', JSON.stringify(items));
    renderScamRadar(items);

    try {
        const res = await fetch(`${API_BASE}/api/radar`);
        if (!res.ok) return;
        const data = await res.json();
        const serverItems = Array.isArray(data) ? data : data.items;
        if (Array.isArray(serverItems) && serverItems.length > 0) {
            localStorage.setItem('kollad_radar', JSON.stringify(serverItems));
            renderScamRadar(serverItems);
        }
    } catch (e) {
        console.log('Kunde inte hämta radar från servern, använder lokal lista:', e);
    }
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
        askRelativeBtn.addEventListener('click', () => {
            const currentVal = document.getElementById('userInput')?.value.trim() || '';
            const relInput = document.getElementById('relativeQuestionInput');
            if (relInput && currentVal) {
                relInput.value = currentVal;
            }
            switchTab('family');
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
    renderRelativeContact();
    renderFamilyGroup();
    syncFamilyGroupFromServer();
    handleIncomingShare();

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
                const response = await fetch(`${API_BASE}/api/check`, {
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
                        await pushWarningToFamilyGroup(textToCheck, data.result.reason);
                        loadScamRadar();
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
        const response = await fetch(`${API_BASE}/api/check-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, userId: getUserId(), plan: subState.plan })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Kunde inte nå servern.');
        }

        container.textContent = data.result || 'Inga kända dataläckor hittades för denna e-postadress.';
    } catch (error) {
        console.error('Fel:', error);
        container.textContent = error.message || 'Kunde inte nå servern för e-postkontroll.';
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
