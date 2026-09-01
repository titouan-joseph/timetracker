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
let initialTodaySeconds = 0;

// Day names for history display
const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const weekTime = document.getElementById('weekTime');
let weeklyChart = null;  // Pour le graphique

// Ajoutez aussi ces tableaux (si pas déjà présents)
const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

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
            // Get initial today time before starting live update
            fetch('/api/sessions/today')
                .then(response => response.json())
                .then(todayData => {
                    initialTodaySeconds = todayData.totalSeconds;
                    startLiveUpdate();
                })
                .catch(error => {
                    console.error('Error getting initial today time:', error);
                });
        }
    } catch (error) {
        console.error('Error checking active session:', error);
    }
}

// Start live time update
function startLiveUpdate() {
    if (updateInterval) clearInterval(updateInterval);

    updateInterval = setInterval(() => {
        if (isRunning && currentSessionStart) {
            const now = new Date();
            const elapsed = Math.floor((now - currentSessionStart) / 1000);
            const total = initialTodaySeconds + elapsed;
            todayTime.textContent = formatTime(total);
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
                // Refresh initial data for live update
                const todayResponse = await fetch('/api/sessions/today');
                const todayData = await todayResponse.json();
                initialTodaySeconds = todayData.totalSeconds;
                todayTime.textContent = formatTime(todayData.totalSeconds);
                updateWeekTotal();
                updateHistory();
                updateChart();
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
                // Get initial today time for live update
                const todayResponse = await fetch('/api/sessions/today');
                const todayData = await todayResponse.json();
                initialTodaySeconds = todayData.totalSeconds;
                startLiveUpdate();
            }
        } catch (error) {
            console.error('Error starting session:', error);
        }
    }
}

// Format seconds to hours (decimal) - pour le graphique
function formatHours(seconds) {
    return (seconds / 3600).toFixed(1);
}

// Format week range (ex: "15-21 Jan")
function formatWeekRange(mondayStr, sundayStr) {
    const monday = new Date(mondayStr + 'T00:00:00');
    const sunday = new Date(sundayStr + 'T00:00:00');
    
    const mondayDay = monday.getDate();
    const sundayDay = sunday.getDate();
    const month = monthNames[monday.getMonth()];
    
    return `${mondayDay}-${sundayDay} ${month}`;
}

// Update week total display
async function updateWeekTotal() {
    try {
        const response = await fetch('/api/sessions/week-total');
        const data = await response.json();
        weekTime.textContent = formatTime(data.totalSeconds);
    } catch (error) {
        console.error('Error updating week total:', error);
    }
}

// Update chart with weekly history
async function updateChart() {
    try {
        const response = await fetch('/api/sessions/weekly-history');
        const data = await response.json();

        const ctx = document.getElementById('weeklyChart').getContext('2d');

        // Destroy previous chart if it exists
        if (weeklyChart) {
            weeklyChart.destroy();
        }

        const labels = data.weeklyData.map(week => formatWeekRange(week.monday, week.sunday));
        const times = data.weeklyData.map(week => formatHours(week.totalSeconds));

        weeklyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Heures travaillées',
                    data: times,
                    backgroundColor: [
                        'rgba(102, 126, 234, 0.7)',
                        'rgba(118, 75, 162, 0.7)',
                        'rgba(255, 107, 107, 0.7)',
                        'rgba(238, 90, 36, 0.7)'
                    ],
                    borderColor: [
                        'rgba(102, 126, 234, 1)',
                        'rgba(118, 75, 162, 1)',
                        'rgba(255, 107, 107, 1)',
                        'rgba(238, 90, 36, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Heures'
                        },
                        // Masquer les valeurs de l'axe Y pour éviter la redondance
                        ticks: {
                            display: false
                        },
                        grid: {
                            display: true
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Semaines'
                        }
                    }
                },
            plugins: {
                datalabels: {
                    display: true,
                    anchor: 'center',       // Centre le label dans la barre
                    align: 'center',        // Alignement centré
                    formatter: function(value) {
                        const hours = parseFloat(value);
                        const totalSeconds = Math.round(hours * 3600);
                        return formatTime(totalSeconds);
                    },
                    color: '#fff',           // Blanc pour mieux contraster
                    font: {
                        weight: 'bold',
                        size: 12             // Légèrement plus petit
                    },
                    padding: 2,
                    // Afficher seulement si la barre est assez haute
                    display: function(context) {
                        return context.dataset.data[context.dataIndex] > 0.5; // Affiche si > 0.5h
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const hours = parseFloat(context.parsed.y);
                            const totalSeconds = Math.round(hours * 3600);
                            return `Temps: ${formatTime(totalSeconds)}`;
                        }
                    }
                }
            }
            },
            plugins: [ChartDataLabels] // Active le plugin
        });
    } catch (error) {
        console.error('Error updating chart:', error);
    }
}

// Event listeners
toggleButton.addEventListener('click', toggleSession);

// Initialize the app
async function init() {
    await updateTodayTime();
    await updateWeekTotal();
    await updateHistory();
    await checkActiveSession();
    await updateChart();
}
// Start the app
init();

// Update every minute to keep history fresh
setInterval(() => {
    updateTodayTime();
    updateWeekTotal();
    updateHistory();
    updateChart();
}, 60000);