// ==========================================
// KOLLAD v1.9.4 – Klientlogik (iOS / Android)
// ==========================================

const API_BASE = 'https://kollad.onrender.com';
// Byt ut denna nyckel mot samma värde som APP_API_KEY i Renders miljövariabler
const APP_API_KEY = 'kollad-mobile-secret-2026';

const STORAGE_KEYS = {
  guardEnabled: 'kollad_guard_enabled',
  blockedStats: 'kollad_blocked_stats',
  recentChecks: 'kollad_recent_checks',
  alerts: 'kollad_alerts',
  trustedContact: 'kollad_trusted_contact',
  familyGroup: 'kollad_family_group',
  largeText: 'kollad_large_text',
  soundVibrate: 'kollad_sound_vibrate',
  proActive: 'kollad_pro_active'
};

const DAILY_TIPS = [
  'Banker och myndigheter ber dig aldrig logga in eller signera med BankID via en länk i ett SMS.',
  'Säljare som kräver förskottsswish ("swisha så skickar jag sen") och sedan blockar är ett klassiskt Marketplace-bedrägeri.',
  'Ska du sälja på Marketplace? Du behöver aldrig klicka på en fraktlänk eller fylla i kortuppgifter för att ta emot pengar.',
  'Lämna aldrig ut en vara på Marketplace enbart utifrån en Swish-skärmdump – kontrollera alltid i din egen bankapp.',
  'Ta hellre ett djupt andetag och fråga en anhörig i familjegruppen innan du klickar eller betalar.'
];

const MARKETPLACE_CHECKS = {
  sell: [
    {
      text: 'Köparen vill skicka ett bud (PostNord/UPS/GLS) och ber dig öppna en länk för att ta emot pengar.',
      critical: true,
      warning: '100 % BEDRÄGERI: Du behöver aldrig klicka på en länk, ange kortnummer eller signera med BankID för att ta emot en betalning.'
    },
    {
      text: 'Köparen har bara skickat en skärmdump på en Swish-betalning men pengarna syns inte i din bankapp.',
      critical: true,
      warning: 'STOPPA ÖVERLÄMNING: Falska Swish-kvitton är mycket vanliga på Marketplace. Lämna inte varan förrän pengarna syns på ditt konto.'
    },
    {
      text: 'Köparen vill flytta konversationen till WhatsApp, SMS eller mejl direkt och ställer inga frågor om varan.',
      critical: false,
      warning: 'VARNINGSSIGNAL: Bedragare flyttar ofta chatten från Messenger för att skicka nätfiskelänkar.'
    }
  ],
  buy: [
    {
      text: 'Säljaren kräver att du swishar förskott eller frakt ("swisha så skickar jag sen") innan du fått varan.',
      critical: true,
      warning: 'HÖG RISK: "Swisha så skickar jag sen" är en av de vanligaste bluffarna – många blockar direkt efter betalning. Swisha aldrig i förskott till okända.'
    },
    {
      text: 'Swish-namnet som dyker upp i appen stämmer inte överens med säljarens namn på Facebook.',
      critical: true,
      warning: 'HÖG RISK: Avbryt betalningen om mottagarens namn inte matchar profilen – bedragare använder ofta målvakter.'
    },
    {
      text: 'Priset är orimligt lågt och säljaren stressar med att "många andra står på kö".',
      critical: false,
      warning: 'VARNINGSSIGNAL: Konstgjord tidspress används för att få dig att swisha utan att tänka efter.'
    }
  ]
};

const QUIZ_QUESTIONS = [
  {
    scenario: 'Du vill köpa en spelkonsol på Marketplace. Säljaren skriver: "Swisha 1 200 kr nu så bokar jag frakten och skickar kollinummer direkt."',
    isScam: true,
    explanation: 'Bluff! Klassiskt förskottsbedrägeri ("swisha så skickar jag sen"). Bedragare tar pengarna och blockar ofta direkt efteråt.'
  },
  {
    scenario: 'Du har själv beställt varor och får ett mejl från noreply@postnord.se utan betalningslänk som ber dig öppna den officiella PostNord-appen för att spåra.',
    isScam: false,
    explanation: 'Äkta mönster! Officiell avsändare och hänvisning till att själv öppna den riktiga appen utan press på betalning eller BankID.'
  },
  {
    scenario: 'En person ringer från ett svenskt mobilnummer, säger att de ringer från "Bankens säkerhetsavdelning" och ber dig legitimera dig med BankID för att stoppa ett lån.',
    isScam: true,
    explanation: 'Bluff! Banker och myndigheter ringer aldrig upp och ber dig logga in eller signera med BankID på deras uppmaning.'
  }
];

let lastCheckResult = null;
let lastCooldownTs = 0;
let groupPollTimer = null;
let quizIndex = 0;
let quizScore = 0;
let currentTipIndex = 0;
let currentMpRole = 'sell';

function isProUser() {
  return localStorage.getItem(STORAGE_KEYS.proActive) === 'true';
}

// Hjälpfunktion för säkra API-anrop med x-app-key
async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-app-key': APP_API_KEY,
    ...(options.headers || {})
  };
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Serverfel (${response.status})`);
  }
  return data;
}

// ==========================================
// INITIERING
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initNavigation();
  initDailyTip();
  initMarketplaceCheck();
  initGuard();
  initQuickCheck();
  initScreenshotScanner();
  initEmailCheck();
  initRadar();
  initQuiz();
  initTrustedContact();
  initFamilyGroup();
  renderAlerts();
  renderRecentHistory();
  handleIncomingShare();
});

// ==========================================
// DAGENS SÄKERHETSTIPS
// ==========================================
function initDailyTip() {
  const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  currentTipIndex = daySeed % DAILY_TIPS.length;
  renderDailyTip();

  document.getElementById('nextTipBtn').addEventListener('click', () => {
    currentTipIndex = (currentTipIndex + 1) % DAILY_TIPS.length;
    renderDailyTip();
  });

  document.getElementById('openMarketplaceQuickBtn').addEventListener('click', () => {
    switchTab('radar');
    const mpCard = document.getElementById('marketplaceCard');
    if (mpCard) mpCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function renderDailyTip() {
  const el = document.getElementById('dailyTipText');
  if (el) {
    el.textContent = DAILY_TIPS[currentTipIndex];
  }
}

// ==========================================
// MARKETPLACE- & KÖP/SÄLJ-KOLL + SWISH-BROMS
// ==========================================
function initMarketplaceCheck() {
  const sellBtn = document.getElementById('mpRoleSellBtn');
  const buyBtn = document.getElementById('mpRoleBuyBtn');

  sellBtn.addEventListener('click', () => {
    currentMpRole = 'sell';
    sellBtn.classList.add('active');
    buyBtn.classList.remove('active');
    renderMarketplaceChecklist();
  });

  buyBtn.addEventListener('click', () => {
    currentMpRole = 'buy';
    buyBtn.classList.add('active');
    sellBtn.classList.remove('active');
    renderMarketplaceChecklist();
  });

  // Swish-bromsen: skicka nummer/namn/text till Snabbkollen
  document.getElementById('mpCheckSwishBtn').addEventListener('click', async () => {
    const swishInput = document.getElementById('mpSwishCheckInput');
    const val = swishInput.value.trim();
    if (!val) {
      alert('Skriv in mottagarens nummer, Swish-namn eller meddelande först.');
      return;
    }
    const checkInput = document.getElementById('checkInput');
    checkInput.value = val.slice(0, 500);
    document.getElementById('charCount').textContent = `${checkInput.value.length} / 500`;
    switchTab('home');
    await runTextCheck();
  });

  // Swish-bromsen: fråga familjegruppen / anhörig innan swish
  document.getElementById('mpAskBeforeSwishBtn').addEventListener('click', async () => {
    const swishVal = document.getElementById('mpSwishCheckInput').value.trim();
    const counterparty = document.getElementById('mpCounterpartyInput').value.trim();
    const itemPrice = document.getElementById('mpItemPriceInput').value.trim();
    const snippet = swishVal || `${counterparty || 'Okänd säljare'} – ${itemPrice || 'Marketplace-swish'}`;
    const summary = 'Swish-bromsen: Vill kolla med dig innan jag swishar på Marketplace.';

    const group = JSON.parse(localStorage.getItem(STORAGE_KEYS.familyGroup) || 'null');
    if (group && group.code) {
      await askFamilyForHelp(snippet, summary);
      return;
    }

    const contact = JSON.parse(localStorage.getItem(STORAGE_KEYS.trustedContact) || 'null');
    if (contact && contact.phone) {
      const msg = `Hej ${contact.name}! Jag funderar på att swisha på Marketplace (${snippet}). Kan du kika med mig innan jag betalar?`;
      window.location.href = `sms:${contact.phone}?body=${encodeURIComponent(msg)}`;
      return;
    }

    alert('Spara en trygghetskontakt eller gå med i en familjegrupp under fliken "Anhörig" först!');
    switchTab('family');
  });

  document.getElementById('mpScanChatBtn').addEventListener('click', () => {
    switchTab('home');
    document.getElementById('screenshotInput').click();
  });

  document.getElementById('mpToggleMeetBtn').addEventListener('click', () => {
    document.getElementById('mpMeetForm').classList.toggle('hidden');
  });

  document.getElementById('mpSendMeetBtn').addEventListener('click', async () => {
    const counterparty = document.getElementById('mpCounterpartyInput').value.trim();
    const itemPrice = document.getElementById('mpItemPriceInput').value.trim();
    const location = document.getElementById('mpLocationInput').value.trim();

    if (!counterparty && !itemPrice && !location) {
      alert('Fyll i minst motpart, vara eller plats innan du skickar.');
      return;
    }

    const roleText = currentMpRole === 'sell' ? 'sälja' : 'köpa';
    const summary = `Trygghetsinfo (Marketplace): Ska ${roleText} ${itemPrice || 'vara'}`;
    const snippet = `Motpart: ${counterparty || 'Ej angivet'} | Plats/tid: ${location || 'Ej angivet'}`;

    const group = JSON.parse(localStorage.getItem(STORAGE_KEYS.familyGroup) || 'null');
    if (group && group.code) {
      await askFamilyForHelp(snippet, summary);
      return;
    }

    const contact = JSON.parse(localStorage.getItem(STORAGE_KEYS.trustedContact) || 'null');
    if (contact && contact.phone) {
      const msg = `Hej ${contact.name}! Jag ska ${roleText} på Marketplace.\n${summary}\n${snippet}`;
      window.location.href = `sms:${contact.phone}?body=${encodeURIComponent(msg)}`;
      return;
    }

    alert('Spara en trygghetskontakt eller gå med i en familjegrupp under fliken "Anhörig" först!');
    switchTab('family');
  });

  document.getElementById('mpGoEmergencyBtn').addEventListener('click', () => {
    switchTab('emergency');
  });

  renderMarketplaceChecklist();
}

function renderMarketplaceChecklist() {
  const container = document.getElementById('mpChecklistContainer');
  const verdictBox = document.getElementById('mpVerdictBox');
  const items = MARKETPLACE_CHECKS[currentMpRole] || [];

  verdictBox.classList.add('hidden');
  verdictBox.innerHTML = '';

  container.innerHTML = items.map((item, idx) => `
    <label class="check-item">
      <input type="checkbox" data-idx="${idx}" />
      <span>${escapeHtml(item.text)}</span>
    </label>
  `).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', evaluateMarketplaceChecklist);
  });
}

function evaluateMarketplaceChecklist() {
  const container = document.getElementById('mpChecklistContainer');
  const verdictBox = document.getElementById('mpVerdictBox');
  const items = MARKETPLACE_CHECKS[currentMpRole] || [];
  const checkedIndices = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
    .map((el) => Number(el.dataset.idx));

  if (!checkedIndices.length) {
    verdictBox.classList.add('hidden');
    return;
  }

  const selected = checkedIndices.map((i) => items[i]);
  const hasCritical = selected.some((x) => x.critical);
  const topWarning = selected.find((x) => x.critical) || selected[0];

  verdictBox.classList.remove('hidden');
  verdictBox.style.borderColor = hasCritical ? 'var(--danger)' : 'var(--warning)';
  verdictBox.innerHTML = `
    <strong>${hasCritical ? '🚨 Hög risk för bedrägeri' : '⚠️ Var extra försiktig'}</strong>
    <p class="mt-6">${escapeHtml(topWarning.warning)}</p>
  `;
}

// ==========================================
// INSTÄLLNINGAR & PRO
// ==========================================
function updateProUI() {
  const proBtn = document.getElementById('openProBtn');
  const activateBtn = document.getElementById('activateProDemoBtn');
  const modalTitle = document.getElementById('proModalTitle');
  const active = isProUser();

  if (proBtn) {
    proBtn.textContent = active ? 'PRO ✓' : 'PRO';
    proBtn.classList.toggle('is-active', active);
  }

  if (modalTitle) {
    modalTitle.textContent = active ? '⭐ Kollad PRO (Aktivt)' : '⭐ Kollad PRO';
  }

  if (activateBtn) {
    activateBtn.textContent = active ? 'PRO är aktivt ✓' : 'Starta 7 dagars gratis test';
    activateBtn.disabled = active;
  }
}

function initSettings() {
  const largeText = localStorage.getItem(STORAGE_KEYS.largeText) === 'true';
  const soundVibrate = localStorage.getItem(STORAGE_KEYS.soundVibrate) !== 'false';

  const largeTextToggle = document.getElementById('largeTextToggle');
  const soundVibrateToggle = document.getElementById('soundVibrateToggle');

  largeTextToggle.checked = largeText;
  soundVibrateToggle.checked = soundVibrate;
  document.body.classList.toggle('large-text', largeText);

  largeTextToggle.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEYS.largeText, String(largeTextToggle.checked));
    document.body.classList.toggle('large-text', largeTextToggle.checked);
  });

  soundVibrateToggle.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEYS.soundVibrate, String(soundVibrateToggle.checked));
  });

  updateProUI();

  // Modaler
  const settingsModal = document.getElementById('settingsModal');
  const proModal = document.getElementById('proModal');

  document.getElementById('openSettingsBtn').addEventListener('click', () => settingsModal.classList.remove('hidden'));
  document.getElementById('closeSettingsBtn').addEventListener('click', () => settingsModal.classList.add('hidden'));

  document.getElementById('openProBtn').addEventListener('click', () => {
    updateProUI();
    proModal.classList.remove('hidden');
  });
  document.getElementById('closeProBtn').addEventListener('click', () => proModal.classList.add('hidden'));

  document.getElementById('activateProDemoBtn').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEYS.proActive, 'true');
    updateProUI();
    proModal.classList.add('hidden');
    alert('Kollad PRO är nu aktiverat!');
  });

  document.getElementById('clearAllDataBtn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.recentChecks);
    localStorage.removeItem(STORAGE_KEYS.alerts);
    renderRecentHistory();
    renderAlerts();
    settingsModal.classList.add('hidden');
  });
}

// ==========================================
// FLIKNAVIGERING
// ==========================================
function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tabName) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `tab-${tabName}`);
  });

  if (tabName === 'family') {
    loadGroupFeed();
    startGroupPolling();
  } else {
    stopGroupPolling();
  }
}

// ==========================================
// GUARD LIVE & DYGNSRÄKNARE
// ==========================================
function initGuard() {
  const toggle = document.getElementById('guardToggle');
  const enabled = localStorage.getItem(STORAGE_KEYS.guardEnabled) !== 'false';
  toggle.checked = enabled;
  updateGuardUI(enabled);
  updateBlockedTodayDisplay();

  toggle.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEYS.guardEnabled, String(toggle.checked));
    updateGuardUI(toggle.checked);
  });
}

function updateGuardUI(enabled) {
  const badge = document.getElementById('guardStatusBadge');
  badge.textContent = enabled ? '● Guard Live Aktivt' : '○ Guard Live Pausat';
  badge.className = `status-pill ${enabled ? 'status-on' : 'status-off'}`;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function incrementBlockedToday() {
  const today = getTodayKey();
  const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.blockedStats) || '{}');
  const count = raw.date === today ? (raw.count || 0) + 1 : 1;
  localStorage.setItem(STORAGE_KEYS.blockedStats, JSON.stringify({ date: today, count }));
  updateBlockedTodayDisplay();
}

function updateBlockedTodayDisplay() {
  const today = getTodayKey();
  const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.blockedStats) || '{}');
  const count = raw.date === today ? (raw.count || 0) : 0;
  document.getElementById('blockedTodayCount').textContent = String(count);
}

// ==========================================
// SNABBKOLL (TEXT, LÄNK, TELEFONNUMMER)
// ==========================================
function initQuickCheck() {
  const input = document.getElementById('checkInput');
  const charCount = document.getElementById('charCount');
  const submitBtn = document.getElementById('checkSubmitBtn');

  input.addEventListener('input', () => {
    charCount.textContent = `${input.value.length} / 500`;
  });

  document.getElementById('pasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      input.value = text.slice(0, 500);
      charCount.textContent = `${input.value.length} / 500`;
    } catch {
      alert('Kunde inte läsa urklipp automatiskt. Klistra in manuellt i rutan.');
    }
  });

  document.getElementById('clearInputBtn').addEventListener('click', () => {
    input.value = '';
    charCount.textContent = '0 / 500';
    document.getElementById('checkResultBox').classList.add('hidden');
  });

  document.querySelectorAll('.example-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.example || '';
      charCount.textContent = `${input.value.length} / 500`;
    });
  });

  submitBtn.addEventListener('click', () => runTextCheck());

  document.getElementById('shareResultBtn').addEventListener('click', async () => {
    if (!lastCheckResult) return;
    const shareText = `Kollad-varning (${lastCheckResult.riskLabel}): ${lastCheckResult.summary}\n\nGranskat innehåll: "${lastCheckResult.input}"`;
    if (navigator.share) {
      await navigator.share({ title: 'Kollad Säkerhetsvarning', text: shareText }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareText).catch(() => {});
      alert('Varningstexten är kopierad till urklipp!');
    }
  });

  document.getElementById('askFamilyResultBtn').addEventListener('click', async () => {
    if (!lastCheckResult) return;
    await askFamilyForHelp(lastCheckResult.input, lastCheckResult.summary);
  });
}

async function runTextCheck() {
  const inputEl = document.getElementById('checkInput');
  const text = inputEl.value.trim();
  if (!text) {
    alert('Klistra in en länk, ett SMS, mejl eller telefonnummer först.');
    return;
  }

  const now = Date.now();
  const cooldownMs = isProUser() ? 800 : 2500;
  if (now - lastCooldownTs < cooldownMs) {
    alert('Vänta ett ögonblick mellan kontrollerna.');
    return;
  }
  lastCooldownTs = now;

  const btn = document.getElementById('checkSubmitBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Analyserar...';

  try {
    const data = await apiFetch('/api/check', {
      method: 'POST',
      body: JSON.stringify({ text })
    });

    displayCheckResult({
      input: text,
      riskLevel: data.riskLevel,
      riskLabel: data.riskLabel,
      summary: data.summary,
      advice: data.advice,
      source: data.source || 'AI-analys'
    });

    saveRecentCheck(text);
  } catch (err) {
    alert(`Kunde inte genomföra kontrollen: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 KOLLA NU';
  }
}

// ==========================================
// SKÄRMDUMPS-SKANNER (OCR / BILDANALYS)
// ==========================================
function initScreenshotScanner() {
  const fileInput = document.getElementById('screenshotInput');
  const scanBtn = document.getElementById('scanScreenshotBtn');

  scanBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Läser av skärmdump...';

    try {
      const maxDim = isProUser() ? 1400 : 1024;
      const base64Image = await resizeImageToBase64(file, maxDim);
      const data = await apiFetch('/api/check-image', {
        method: 'POST',
        body: JSON.stringify({ imageBase64: base64Image })
      });

      if (data.extractedText) {
        const inputEl = document.getElementById('checkInput');
        inputEl.value = data.extractedText.slice(0, 500);
        document.getElementById('charCount').textContent = `${inputEl.value.length} / 500`;
      }

      displayCheckResult({
        input: data.extractedText || '[Skärmdump]',
        riskLevel: data.riskLevel,
        riskLabel: data.riskLabel,
        summary: data.summary,
        advice: data.advice,
        source: 'Skärmdumps-skanner'
      });
    } catch (err) {
      alert(`Kunde inte läsa bilden: ${err.message}`);
    } finally {
      fileInput.value = '';
      scanBtn.disabled = false;
      scanBtn.textContent = '📸 Välj skärmdump / Foto att granska';
    }
  });
}

function resizeImageToBase64(file, maxDim) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Kunde inte läsa bildfilen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Ogiltigt bildformat.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function displayCheckResult(result) {
  lastCheckResult = result;
  const box = document.getElementById('checkResultBox');
  const badge = document.getElementById('resultRiskBadge');
  const sourceTag = document.getElementById('resultSourceTag');
  const summaryEl = document.getElementById('resultSummary');
  const adviceEl = document.getElementById('resultAdvice');

  box.className = `result-box risk-${result.riskLevel}`;
  badge.textContent = result.riskLabel || 'BEDÖMNING';
  sourceTag.textContent = result.source || '';
  summaryEl.textContent = result.summary;
  adviceEl.textContent = result.advice;
  box.classList.remove('hidden');

  if (result.riskLevel === 'high' || result.riskLevel === 'medium') {
    incrementBlockedToday();
    saveAlert(result);
    triggerWarningFeedback(result.summary);
  }
}

function triggerWarningFeedback(summary) {
  const soundVibrate = localStorage.getItem(STORAGE_KEYS.soundVibrate) !== 'false';
  if (soundVibrate && navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Kollad Varning', { body: summary });
  }
}

// ==========================================
// HISTORIK & VARNINGAR
// ==========================================
function saveRecentCheck(text) {
  let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentChecks) || '[]');
  list = [text, ...list.filter((item) => item !== text)].slice(0, 5);
  localStorage.setItem(STORAGE_KEYS.recentChecks, JSON.stringify(list));
  renderRecentHistory();
}

function renderRecentHistory() {
  const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentChecks) || '[]');
  const wrap = document.getElementById('recentHistoryWrap');
  const container = document.getElementById('recentHistoryList');

  if (!list.length) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  container.innerHTML = '';
  list.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = item.length > 34 ? `${item.slice(0, 34)}…` : item;
    btn.addEventListener('click', () => {
      const input = document.getElementById('checkInput');
      input.value = item;
      document.getElementById('charCount').textContent = `${item.length} / 500`;
    });
    container.appendChild(btn);
  });
}

function saveAlert(result) {
  const alerts = JSON.parse(localStorage.getItem(STORAGE_KEYS.alerts) || '[]');
  alerts.unshift({
    date: new Date().toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }),
    riskLevel: result.riskLevel,
    riskLabel: result.riskLabel,
    summary: result.summary,
    snippet: result.input.slice(0, 90)
  });
  localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(alerts.slice(0, 30)));
  renderAlerts();
}

function renderAlerts() {
  const alerts = JSON.parse(localStorage.getItem(STORAGE_KEYS.alerts) || '[]');
  const container = document.getElementById('alertsList');

  document.getElementById('clearAlertsBtn').onclick = () => {
    localStorage.removeItem(STORAGE_KEYS.alerts);
    renderAlerts();
  };

  if (!alerts.length) {
    container.innerHTML = '<p class="muted small">Inga varningar loggade ännu.</p>';
    return;
  }

  container.innerHTML = alerts.map((a) => `
    <div class="list-item">
      <div class="card-header-row">
        <strong>${escapeHtml(a.riskLabel)}</strong>
        <span class="muted tiny">${escapeHtml(a.date)}</span>
      </div>
      <p class="small mt-6">${escapeHtml(a.summary)}</p>
      <p class="muted tiny mt-6">"${escapeHtml(a.snippet)}"</p>
    </div>
  `).join('');
}

// ==========================================
// DATALÄCKAGEKOLL (E-POST)
// ==========================================
function initEmailCheck() {
  const btn = document.getElementById('emailCheckBtn');
  const input = document.getElementById('emailCheckInput');
  const resultEl = document.getElementById('emailCheckResult');

  btn.addEventListener('click', async () => {
    const email = input.value.trim();
    if (!email || !email.includes('@')) {
      alert('Skriv in en giltig e-postadress.');
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Kontrollerar...';
    try {
      const data = await apiFetch('/api/check-email', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = data.breached
        ? `⚠️ <strong>Hittades i ${data.count} kända dataläckor.</strong> Byt lösenord om du återanvänder samma lösenord på flera sidor.`
        : `✅ <strong>Inga kända dataläckor hittades</strong> för den här adressen.`;
    } catch (err) {
      resultEl.classList.remove('hidden');
      resultEl.textContent = `Kunde inte kontrollera e-post: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Kontrollera e-postadress';
    }
  });
}

// ==========================================
// BLUFF-RADARN
// ==========================================
function initRadar() {
  document.getElementById('refreshRadarBtn').addEventListener('click', loadRadar);
  loadRadar();
}

async function loadRadar() {
  const container = document.getElementById('radarList');
  container.innerHTML = '<p class="muted small">Hämtar bluff-radarn...</p>';

  try {
    const data = await apiFetch('/api/radar');
    const items = data.items || [];
    container.innerHTML = items.map((item) => `
      <div class="list-item">
        <div class="card-header-row">
          <strong>${escapeHtml(item.title)}</strong>
          <span class="status-pill status-off">${escapeHtml(item.trend || 'Aktiv')}</span>
        </div>
        <p class="muted small mt-6">${escapeHtml(item.description)}</p>
        <button class="text-btn mt-8 radar-try-btn" type="button" data-sample="${escapeHtml(item.sample)}">
          🔍 Testa exempel i snabbkollen →
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.radar-try-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('checkInput');
        input.value = btn.dataset.sample || '';
        document.getElementById('charCount').textContent = `${input.value.length} / 500`;
        switchTab('home');
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="muted small">Kunde inte ladda radarn just nu (${escapeHtml(err.message)}).</p>`;
  }
}

// ==========================================
// BLUFF-TRÄNING (3 FRÅGOR)
// ==========================================
function initQuiz() {
  const safeBtn = document.getElementById('quizSafeBtn');
  const scamBtn = document.getElementById('quizScamBtn');
  const nextBtn = document.getElementById('quizNextBtn');

  renderQuizQuestion();

  safeBtn.addEventListener('click', () => answerQuiz(false));
  scamBtn.addEventListener('click', () => answerQuiz(true));
  nextBtn.addEventListener('click', () => {
    quizIndex = (quizIndex + 1) % QUIZ_QUESTIONS.length;
    if (quizIndex === 0) quizScore = 0;
    renderQuizQuestion();
  });
}

function renderQuizQuestion() {
  const q = QUIZ_QUESTIONS[quizIndex];
  document.getElementById('quizProgressBadge').textContent = `Fråga ${quizIndex + 1} / ${QUIZ_QUESTIONS.length}`;
  document.getElementById('quizScenario').textContent = q.scenario;
  document.getElementById('quizFeedback').classList.add('hidden');
  document.getElementById('quizNextBtn').classList.add('hidden');
  document.getElementById('quizSafeBtn').disabled = false;
  document.getElementById('quizScamBtn').disabled = false;
}

function answerQuiz(userGuessedScam) {
  const q = QUIZ_QUESTIONS[quizIndex];
  const isCorrect = userGuessedScam === q.isScam;
  if (isCorrect) quizScore++;

  const feedback = document.getElementById('quizFeedback');
  feedback.classList.remove('hidden');
  feedback.innerHTML = `${isCorrect ? '🎉 <strong>Rätt svar!</strong>' : '💡 <strong>Inte riktigt!</strong>'} ${escapeHtml(q.explanation)}`;

  document.getElementById('quizSafeBtn').disabled = true;
  document.getElementById('quizScamBtn').disabled = true;

  const nextBtn = document.getElementById('quizNextBtn');
  nextBtn.classList.remove('hidden');
  nextBtn.textContent = quizIndex === QUIZ_QUESTIONS.length - 1
    ? `Klart! (${quizScore}/${QUIZ_QUESTIONS.length} rätt) – Börja om ↻`
    : 'Nästa fråga →';
}

// ==========================================
// TRYGGHETSKONTAKT & FAMILJEGRUPP
// ==========================================
function initTrustedContact() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.trustedContact) || 'null');
  const nameInput = document.getElementById('trustedNameInput');
  const phoneInput = document.getElementById('trustedPhoneInput');

  if (saved) {
    nameInput.value = saved.name || '';
    phoneInput.value = saved.phone || '';
    updateTrustedUI(saved);
  }

  document.getElementById('saveTrustedBtn').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    if (!name || !phone) {
      alert('Fyll i både namn och mobilnummer till din anhörig.');
      return;
    }
    const contact = { name, phone };
    localStorage.setItem(STORAGE_KEYS.trustedContact, JSON.stringify(contact));
    updateTrustedUI(contact);
    alert('Trygghetskontakt sparad!');
  });

  document.getElementById('smsTrustedBtn').addEventListener('click', () => {
    const contact = JSON.parse(localStorage.getItem(STORAGE_KEYS.trustedContact) || 'null');
    if (!contact) return;
    const msg = lastCheckResult
      ? `Hej ${contact.name}! Jag är osäker på ett meddelande jag fått. Kollad säger: "${lastCheckResult.summary}". Innehåll: ${lastCheckResult.input}`
      : `Hej ${contact.name}! Kan du hjälpa mig att titta på ett meddelande jag fått?`;
    window.location.href = `sms:${contact.phone}?body=${encodeURIComponent(msg)}`;
  });
}

function updateTrustedUI(contact) {
  const actionsRow = document.getElementById('trustedActionsRow');
  const callLink = document.getElementById('callTrustedLink');
  const emergencyBtn = document.getElementById('emergencyCallTrustedBtn');

  if (contact && contact.phone) {
    actionsRow.classList.remove('hidden');
    callLink.href = `tel:${contact.phone}`;
    callLink.textContent = `📞 Ring ${contact.name}`;

    emergencyBtn.classList.remove('hidden');
    emergencyBtn.href = `tel:${contact.phone}`;
    emergencyBtn.textContent = `📞 Ring ${contact.name} nu`;
  }
}

function initFamilyGroup() {
  const savedGroup = JSON.parse(localStorage.getItem(STORAGE_KEYS.familyGroup) || 'null');
  if (savedGroup) {
    document.getElementById('groupMemberNameInput').value = savedGroup.memberName || '';
    document.getElementById('groupCodeInput').value = savedGroup.code || '';
    updateGroupBadge(savedGroup.code);
  }

  document.getElementById('createGroupBtn').addEventListener('click', () => {
    const randomCode = 'KOLLAD-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('groupCodeInput').value = randomCode;
  });

  document.getElementById('joinGroupBtn').addEventListener('click', () => {
    const memberName = document.getElementById('groupMemberNameInput').value.trim() || 'Medlem';
    const code = document.getElementById('groupCodeInput').value.trim().toUpperCase();
    if (!code) {
      alert('Skriv in en gruppkod eller tryck på "Skapa ny familjegrupp".');
      return;
    }
    localStorage.setItem(STORAGE_KEYS.familyGroup, JSON.stringify({ code, memberName }));
    updateGroupBadge(code);
    loadGroupFeed();
    startGroupPolling();
  });

  document.getElementById('refreshGroupBtn').addEventListener('click', loadGroupFeed);
}

function updateGroupBadge(code) {
  const badge = document.getElementById('activeGroupBadge');
  badge.textContent = code ? `Grupp: ${code}` : 'Ej ansluten';
  badge.className = `status-pill ${code ? 'status-on' : 'status-neutral'}`;
}

async function askFamilyForHelp(snippet, summary) {
  const group = JSON.parse(localStorage.getItem(STORAGE_KEYS.familyGroup) || 'null');
  if (!group || !group.code) {
    alert('Gå med i eller skapa en familjegrupp under fliken "Anhörig" först!');
    switchTab('family');
    return;
  }

  try {
    await apiFetch('/api/group/event', {
      method: 'POST',
      body: JSON.stringify({
        code: group.code,
        sender: group.memberName || 'Anhörig',
        type: 'question',
        snippet: snippet.slice(0, 220),
        summary
      })
    });
    alert('Delat med din familjegrupp!');
    switchTab('family');
  } catch (err) {
    alert(`Kunde inte skicka till gruppen: ${err.message}`);
  }
}

async function loadGroupFeed() {
  const group = JSON.parse(localStorage.getItem(STORAGE_KEYS.familyGroup) || 'null');
  const section = document.getElementById('groupFeedSection');
  const listEl = document.getElementById('groupEventsList');

  if (!group || !group.code) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  try {
    const data = await apiFetch(`/api/group/${encodeURIComponent(group.code)}`);
    const events = data.events || [];

    if (!events.length) {
      listEl.innerHTML = '<p class="muted small">Inga delade frågor eller varningar i gruppen ännu.</p>';
      return;
    }

    listEl.innerHTML = events.map((ev) => {
      const replyHtml = ev.reply
        ? `<div class="group-reply-badge ${ev.reply.verdict === 'safe' ? 'reply-safe' : 'reply-scam'}">
             ${ev.reply.verdict === 'safe' ? '✅' : '🚨'} Svar från ${escapeHtml(ev.reply.by)}: ${escapeHtml(ev.reply.text)}
           </div>`
        : `<div class="two-col-actions mt-8">
             <button class="btn btn-success btn-sm group-reply-btn" type="button" data-id="${escapeHtml(ev.id)}" data-verdict="safe">
               ✅ Ser säkert ut
             </button>
             <button class="btn btn-danger btn-sm group-reply-btn" type="button" data-id="${escapeHtml(ev.id)}" data-verdict="scam">
               🚨 Rör ej – bluff!
             </button>
           </div>`;

      return `
        <div class="list-item">
          <div class="card-header-row">
            <strong>❓ Från ${escapeHtml(ev.sender)}</strong>
            <span class="muted tiny">${escapeHtml(ev.time || '')}</span>
          </div>
          <p class="small mt-6">${escapeHtml(ev.summary || '')}</p>
          <p class="muted tiny mt-6">"${escapeHtml(ev.snippet || '')}"</p>
          ${replyHtml}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.group-reply-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await replyToGroupEvent(group.code, btn.dataset.id, btn.dataset.verdict, group.memberName || 'Anhörig');
      });
    });
  } catch (err) {
    listEl.innerHTML = `<p class="muted small">Kunde inte hämta gruppflödet: ${escapeHtml(err.message)}</p>`;
  }
}

async function replyToGroupEvent(code, eventId, verdict, by) {
  try {
    await apiFetch('/api/group/reply', {
      method: 'POST',
      body: JSON.stringify({
        code,
        eventId,
        verdict,
        by,
        text: verdict === 'safe' ? 'Ser säkert ut' : 'Rör ej – det är en bluff!'
      })
    });
    loadGroupFeed();
  } catch (err) {
    alert(`Kunde inte skicka svar: ${err.message}`);
  }
}

function startGroupPolling() {
  stopGroupPolling();
  groupPollTimer = setInterval(loadGroupFeed, 15000);
}

function stopGroupPolling() {
  if (groupPollTimer) {
    clearInterval(groupPollTimer);
    groupPollTimer = null;
  }
}

// ==========================================
// DELNINGSMOTTAGNING (SHARE TARGET)
// ==========================================
function handleIncomingShare() {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get('share') || params.get('text') || params.get('url') || params.get('q');
  if (shared) {
    const input = document.getElementById('checkInput');
    input.value = shared.slice(0, 500);
    document.getElementById('charCount').textContent = `${input.value.length} / 500`;
    switchTab('home');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
