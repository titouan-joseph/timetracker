// DOM Elements
const toggleButton = document.getElementById('toggleButton');
const buttonText = document.getElementById('buttonText');
const statusText = document.getElementById('statusText');
const todayTime = document.getElementById('todayTime');
const historyGrid = document.getElementById('historyGrid');
const statusIndicator = document.getElementById('statusIndicator');
const todayProgressBar = document.getElementById('todayProgressBar');
const todayProgressText = document.getElementById('todayProgressText');
const weekProgressBar = document.getElementById('weekProgressBar');
const weekProgressText = document.getElementById('weekProgressText');
const weekOverflow = document.getElementById('weekOverflow');

// State
let isRunning = false;
let currentSessionStart = null;
let updateInterval = null;
let initialTodaySeconds = 0;
let initialWeekSeconds = 0;

// Daily and weekly targets in seconds
const DAILY_TARGET = 7 * 3600 + 42 * 60; // 7h42min = 27840 seconds
const WEEKLY_TARGET = 38 * 3600 + 30 * 60; // 38h30 = 138600 seconds

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

// Update today's time display and progress bar
async function updateTodayTime() {
    try {
        const response = await fetch('/api/sessions/today');
        const data = await response.json();
        todayTime.textContent = formatTime(data.totalSeconds);
        updateTodayProgress(data.totalSeconds);
    } catch (error) {
        console.error('Error updating today time:', error);
    }
}

// Update today's progress bar
function updateTodayProgress(todaySeconds) {
    const percentage = (todaySeconds / DAILY_TARGET) * 100;
    todayProgressBar.style.width = `${Math.min(percentage, 100)}%`;
    todayProgressText.textContent = `${Math.round(Math.min(percentage, 100))}%`;
    
    // Apply warning style if exceeded
    if (todaySeconds > DAILY_TARGET) {
        todayProgressBar.classList.add('warning');
        todayProgressText.classList.add('warning');
        todayProgressText.textContent = `${Math.round(percentage)}%`;
    } else {
        todayProgressBar.classList.remove('warning');
        todayProgressText.classList.remove('warning');
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
            const percentage = (item.totalSeconds / DAILY_TARGET) * 100;
            const progressClass = item.totalSeconds > DAILY_TARGET ? 'warning' : '';
            const overflowSeconds = Math.max(0, item.totalSeconds - DAILY_TARGET);
            const overflowText = overflowSeconds > 0 ? ` (+${formatTime(overflowSeconds)})` : '';

            historyItem.innerHTML = `
                <div class="date">${date}</div>
                <div class="time">${time}${overflowText}</div>
                <div class="day-name">${dayName}</div>
                <div class="history-progress-container">
                    <div class="history-progress-bar-wrapper">
                        <div class="history-progress-bar ${progressClass}" style="width: ${percentage}%"></div>
                        <div class="history-progress-text ${progressClass}">${Math.round(percentage)}%</div>
                    </div>
                </div>
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
            // Get initial today and week time before starting live update
            Promise.all([
                fetch('/api/sessions/today').then(r => r.json()),
                fetch('/api/sessions/week-total').then(r => r.json())
            ]).then(([todayData, weekData]) => {
                initialTodaySeconds = todayData.totalSeconds;
                initialWeekSeconds = weekData.currentWeekSeconds;
                updateWeekOverflow(weekData.overflowFromPrevious);
                startLiveUpdate();
            }).catch(error => {
                console.error('Error getting initial times:', error);
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
            const totalToday = initialTodaySeconds + elapsed;
            const totalWeek = initialWeekSeconds + elapsed;
            todayTime.textContent = formatTime(totalToday);
            updateTodayProgress(totalToday);
            weekTime.textContent = formatTime(totalWeek);
            updateWeekProgress(totalWeek);
            // Overflow stays the same during live update (it's from previous week)
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
                const weekResponse = await fetch('/api/sessions/week-total');
                const weekData = await weekResponse.json();
                initialTodaySeconds = todayData.totalSeconds;
                initialWeekSeconds = weekData.currentWeekSeconds;
                todayTime.textContent = formatTime(todayData.totalSeconds);
                weekTime.textContent = formatTime(weekData.totalSeconds);
                updateTodayProgress(todayData.totalSeconds);
                updateWeekProgress(weekData.totalSeconds);
                updateWeekOverflow(weekData.overflowFromPrevious);
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
                // Get initial today and week time for live update
                const todayResponse = await fetch('/api/sessions/today');
                const todayData = await todayResponse.json();
                const weekResponse = await fetch('/api/sessions/week-total');
                const weekData = await weekResponse.json();
                initialTodaySeconds = todayData.totalSeconds;
                initialWeekSeconds = weekData.currentWeekSeconds;
                updateTodayProgress(initialTodaySeconds);
                updateWeekProgress(weekData.totalSeconds);
                updateWeekOverflow(weekData.overflowFromPrevious);
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

// Update week overflow indicator
function updateWeekOverflow(overflowSeconds) {
    if (overflowSeconds > 0) {
        weekOverflow.textContent = ` (+${formatTime(overflowSeconds)})`;
        weekOverflow.className = 'overflow-indicator';
    } else if (overflowSeconds < 0) {
        weekOverflow.textContent = ` (${formatTime(Math.abs(overflowSeconds))})`;
        weekOverflow.className = 'overflow-indicator positive';
    } else {
        weekOverflow.textContent = '';
    }
}

// Update week total display and progress bar
async function updateWeekTotal() {
    try {
        const response = await fetch('/api/sessions/week-total');
        const data = await response.json();
        weekTime.textContent = formatTime(data.totalSeconds);
        updateWeekProgress(data.totalSeconds);
        updateWeekOverflow(data.overflowFromPrevious);
    } catch (error) {
        console.error('Error updating week total:', error);
    }
}

// Update week's progress bar
function updateWeekProgress(weekSeconds) {
    const percentage = (weekSeconds / WEEKLY_TARGET) * 100;
    weekProgressBar.style.width = `${Math.min(percentage, 100)}%`;
    weekProgressText.textContent = `${Math.round(Math.min(percentage, 100))}%`;
    
    // Apply warning style if exceeded
    if (weekSeconds > WEEKLY_TARGET) {
        weekProgressBar.classList.add('warning');
        weekProgressText.classList.add('warning');
        weekProgressText.textContent = `${Math.round(percentage)}%`;
    } else {
        weekProgressBar.classList.remove('warning');
        weekProgressText.classList.remove('warning');
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
        const times = data.weeklyData.map(week => week.totalSeconds);
        const overflows = data.weeklyData.map(week => week.overflowSeconds);
        const isOver = data.weeklyData.map(week => week.isOver);

        // Generate colors based on overflow
        const backgroundColors = times.map((time, idx) => 
            isOver[idx] ? 'rgba(255, 107, 107, 0.7)' : 'rgba(102, 126, 234, 0.7)'
        );
        const borderColors = times.map((time, idx) => 
            isOver[idx] ? 'rgba(255, 107, 107, 1)' : 'rgba(102, 126, 234, 1)'
        );

        weeklyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Heures travaillées',
                    data: times,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
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
                            callback: function(value) {
                                const hours = Math.floor(value / 3600);
                                const minutes = Math.floor((value % 3600) / 60);
                                return `${hours}h${minutes > 0 ? minutes : ''}`;
                            }
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
                    formatter: function(value, context) {
                        const overflow = overflows[context.dataIndex] || 0;
                        if (overflow > 0) {
                            return formatTime(value) + '\n+' + formatTime(overflow);
                        }
                        return formatTime(value);
                    },
                    color: '#fff',           // Blanc pour mieux contraster
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    padding: 2,
                    // Afficher seulement si la barre est assez haute
                    display: function(context) {
                        return context.dataset.data[context.dataIndex] > 1800; // Affiche si > 30min
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Temps: ${formatTime(context.parsed.y)}`;
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
    dayObjective.textContent = formatTime(DAILY_TARGET);
    weekObjective.textContent = formatTime(WEEKLY_TARGET);
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