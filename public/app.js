// DOM Elements
const toggleButton = document.getElementById('toggleButton');
const buttonText = document.getElementById('buttonText');
const statusText = document.getElementById('statusText');
const todayTime = document.getElementById('todayTime');
const historyGrid = document.getElementById('historyGrid');
const statusIndicator = document.getElementById('statusIndicator');

// State
let isRunning = false;
let currentSessionStart = null;
let updateInterval = null;

// Day names for history display
const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Format seconds to HH:MM:SS
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Format date to display format
function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`;
}

// Get day name
function getDayName(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return dayNames[date.getDay()];
}

// Update today's time display
async function updateTodayTime() {
    try {
        const response = await fetch('/api/sessions/today');
        const data = await response.json();
        todayTime.textContent = formatTime(data.totalSeconds);
    } catch (error) {
        console.error('Error updating today time:', error);
    }
}

// Update history display
async function updateHistory() {
    try {
        const response = await fetch('/api/sessions/history');
        const data = await response.json();

        historyGrid.innerHTML = '';

        data.history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';

            const date = formatDate(item.date);
            const dayName = getDayName(item.date);
            const time = formatTime(item.totalSeconds);

            historyItem.innerHTML = `
                <div class="date">${date}</div>
                <div class="time">${time}</div>
                <div class="day-name">${dayName}</div>
            `;

            historyGrid.appendChild(historyItem);
        });
    } catch (error) {
        console.error('Error updating history:', error);
    }
}

// Check active session
async function checkActiveSession() {
    try {
        const response = await fetch('/api/sessions/active');
        const data = await response.json();

        if (data.active) {
            isRunning = true;
            currentSessionStart = new Date(data.session.start_time);
            updateButtonState();
            startLiveUpdate();
        }
    } catch (error) {
        console.error('Error checking active session:', error);
    }
}

// Start live time update
function startLiveUpdate() {
    if (updateInterval) clearInterval(updateInterval);

    updateInterval = setInterval(async () => {
        if (isRunning && currentSessionStart) {
            const now = new Date();
            const elapsed = Math.floor((now - currentSessionStart) / 1000);

            try {
                const response = await fetch('/api/sessions/today');
                const data = await response.json();
                const total = data.totalSeconds + elapsed;
                todayTime.textContent = formatTime(total);
            } catch (error) {
                console.error('Error in live update:', error);
            }
        }
    }, 1000);
}

// Update button state
function updateButtonState() {
    if (isRunning) {
        toggleButton.classList.add('active');
        buttonText.textContent = 'Arrêter';
        statusText.textContent = 'En cours';
        statusText.classList.add('active');
    } else {
        toggleButton.classList.remove('active');
        buttonText.textContent = 'Démarrer';
        statusText.textContent = 'Arrêté';
        statusText.classList.remove('active');

        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    }
}

// Toggle session
async function toggleSession() {
    if (isRunning) {
        try {
            const response = await fetch('/api/sessions/end', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                isRunning = false;
                currentSessionStart = null;
                updateButtonState();
                updateTodayTime();
                updateHistory();
            }
        } catch (error) {
            console.error('Error ending session:', error);
        }
    } else {
        try {
            const response = await fetch('/api/sessions/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                isRunning = true;
                currentSessionStart = new Date();
                updateButtonState();
                startLiveUpdate();
            }
        } catch (error) {
            console.error('Error starting session:', error);
        }
    }
}

// Event listeners
toggleButton.addEventListener('click', toggleSession);

// Initialize the app
async function init() {
    await updateTodayTime();
    await updateHistory();
    await checkActiveSession();
}

// Start the app
init();

// Update every minute to keep history fresh
setInterval(() => {
    updateTodayTime();
    updateHistory();
}, 60000);