let searchHistory = [];
let guardLiveActive = false;
let blockedThreatsCount = 3; // Startar på ett snyggt fiktivt värde

// Hantera inställningsmodalen
function openSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// Rensa historik
function clearHistory() {
    searchHistory = [];
    document.getElementById('historySection').classList.add('hidden');
    document.getElementById('historyChips').innerHTML = '';
    closeSettings();
}

// Analysera text (Universell)
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const textarea = document.getElementById('userInput');
    const text = textarea.value.trim();
    const resultCard = document.getElementById('resultCard');
    const resultTitle = document.getElementById('resultTitle');
    const resultDescription = document.getElementById('resultDescription');
    const resultIcon = document.getElementById('resultIcon');
    const btnText = document.querySelector('.primary-btn .btn-text');
    const spinner = document.querySelector('.primary-btn .spinner');

    if (!text) {
        alert("Vänligen skriv eller klistra in en text först.");
        return;
    }

    btnText.style.display = 'none';
    spinner.classList.remove('hidden');
    resultCard.classList.remove('hidden');
    resultIcon.innerText = "⏳";
    resultTitle.innerText = "Analyserar...";
    resultDescription.innerText = "AI-motorn kontrollerar meddelandet...";
    resultCard.style.borderLeftColor = "#00e5ff";

    try {
        const response = await fetch('http://localhost:3000/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        const data = await response.json();

        const isRed = data.status === 'red';
        const borderColor = isRed ? '#ff4d4d' : '#2ed573';
        const icon = isRed ? '🚨' : '✅';

        resultCard.style.borderLeftColor = borderColor;
        resultIcon.innerText = icon;
        resultTitle.innerText = data.title;
        resultDescription.innerText = data.description;

        // Om det var ett hot i manuella sökningen, öka räknaren för att visa att skyddet jobbar
        if (isRed && guardLiveActive) {
            blockedThreatsCount++;
            document.getElementById('blockedCount').innerText = blockedThreatsCount;
        }

        addToHistory(text);

    } catch (error) {
        console.error("Fel:", error);
        resultCard.style.borderLeftColor = '#ff4d4d';
        resultIcon.innerText = '❌';
        resultTitle.innerText = "Anslutningsfel";
        resultDescription.innerText = "Kunde inte nå servern. Kontrollera att server.js körs.";
    } finally {
        btnText.style.display = 'inline';
        spinner.classList.add('hidden');
    }
});

// Styr Guard Live På / Av
function toggleGuardLive() {
    const toggle = document.getElementById('guardToggle');
    const card = document.querySelector('.guard-live-card');
    const subtitle = document.getElementById('guardSubtitle');
    const statusText = document.getElementById('statusText');

    guardLiveActive = toggle.checked;

    if (guardLiveActive) {
        card.classList.add('active-guard');
        subtitle.innerText = "Realtidsskydd är aktivt i bakgrunden";
        statusText.innerText = "Status: Skyddar enhet";
        document.getElementById('blockedCount').innerText = blockedThreatsCount;

        if (window.Notification && Notification.permission !== "granted") {
            Notification.requestPermission();
        }
    } else {
        card.classList.remove('active-guard');
        subtitle.innerText = "Realtidsskydd är avstängt";
        statusText.innerText = "Status: Avstängd";
        document.getElementById('liveAlertModal').classList.add('hidden');
    }
}

function closeAlertModal() {
    document.getElementById('liveAlertModal').classList.add('hidden');
}

// Hantera historik-chips
function addToHistory(text) {
    if (!searchHistory.includes(text)) {
        searchHistory.unshift(text);
        if (searchHistory.length > 3) searchHistory.pop();
    }

    const historySection = document.getElementById('historySection');
    const historyChips = document.getElementById('historyChips');
    
    historySection.classList.remove('hidden');
    historyChips.innerHTML = '';

    searchHistory.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'history-chip';
        chip.innerText = item;
        chip.title = item;
        chip.onclick = () => {
            document.getElementById('userInput').value = item;
        };
        historyChips.appendChild(chip);
    });
}

// ID-skydd läckokoll
async function checkEmailLeak() {
    const emailInput = document.getElementById('leakEmailInput');
    const resultContainer = document.getElementById('leakResultContainer');
    const email = emailInput.value.trim();

    if (!email || !email.includes('@')) {
        alert("Vänligen ange en giltig e-postadress.");
        return;
    }

    resultContainer.classList.remove('hidden');
    resultContainer.style.background = '#171721';
    resultContainer.style.borderLeft = '4px solid #00e5ff';
    resultContainer.innerHTML = "<p style='color: #9e9eb0;'>Kontrollerar läckoregister säkert...</p>";

    try {
        const response = await fetch('http://localhost:3000/api/check-leak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        const isRed = data.status === 'red';
        const borderColor = isRed ? '#ff4d4d' : '#2ed573';
        const bgColor = isRed ? 'rgba(255, 77, 77, 0.1)' : 'rgba(46, 213, 115, 0.1)';
        const icon = isRed ? '🚨' : '🛡️';

        resultContainer.style.background = bgColor;
        resultContainer.style.borderLeft = `4px solid ${borderColor}`;
        resultContainer.innerHTML = `
            <h4 style="margin: 0 0 4px 0; color: ${borderColor}; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                <span>${icon}</span> ${data.title}
            </h4>
            <p style="margin: 0; font-size: 12px; color: #d0d0e0; line-height: 1.4;">${data.description}</p>
        `;

    } catch (error) {
        console.error("Fel vid läckokoll:", error);
        resultContainer.style.background = 'rgba(255, 77, 77, 0.1)';
        resultContainer.style.borderLeft = '4px solid #ff4d4d';
        resultContainer.innerHTML = "<p style='color: #ff4d4d;'>Kunde inte nå servern för läckokontroll.</p>";
    }
}