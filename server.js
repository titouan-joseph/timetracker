const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const db = new sqlite3.Database('./work_time.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        duration INTEGER,
        date DATE NOT NULL
      )
    `);
  });
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.post('/api/sessions/start', (req, res) => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  
  db.run(
    'INSERT INTO sessions (start_time, date) VALUES (?, ?)',
    [now.toISOString(), dateStr],
    function(err) {
      if (err) {
        console.error('Error starting session:', err.message);
        return res.status(500).json({ error: 'Failed to start session' });
      }
      res.json({ 
        sessionId: this.lastID,
        startTime: now.toISOString(),
        message: 'Session started' 
      });
    }
  );
});

app.post('/api/sessions/end', (req, res) => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  
  db.get(
    'SELECT * FROM sessions WHERE end_time IS NULL AND date = ? ORDER BY start_time DESC LIMIT 1',
    [dateStr],
    (err, row) => {
      if (err) {
        console.error('Error finding session:', err.message);
        return res.status(500).json({ error: 'Failed to find active session' });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'No active session found' });
      }
      
      const startTime = new Date(row.start_time);
      const duration = Math.floor((now - startTime) / 1000);
      
      db.run(
        'UPDATE sessions SET end_time = ?, duration = ? WHERE id = ?',
        [now.toISOString(), duration, row.id],
        function(err) {
          if (err) {
            console.error('Error ending session:', err.message);
            return res.status(500).json({ error: 'Failed to end session' });
          }
          res.json({ 
            sessionId: row.id,
            endTime: now.toISOString(),
            duration: duration,
            message: 'Session ended' 
          });
        }
      );
    }
  );
});

app.get('/api/sessions/today', (req, res) => {
  const dateStr = new Date().toISOString().split('T')[0];
  
  db.all(
    'SELECT * FROM sessions WHERE date = ? AND end_time IS NOT NULL',
    [dateStr],
    (err, rows) => {
      if (err) {
        console.error('Error fetching sessions:', err.message);
        return res.status(500).json({ error: 'Failed to fetch sessions' });
      }
      
      const totalSeconds = rows.reduce((sum, session) => sum + (session.duration || 0), 0);
      res.json({ totalSeconds, sessions: rows });
    }
  );
});

app.get('/api/sessions/history', (req, res) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  
  const dates = [];
  for (let i = 1; i <= 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  db.all(
    'SELECT date, SUM(duration) as totalSeconds FROM sessions WHERE date IN (' + dates.map(() => '?').join(',') + ') GROUP BY date',
    dates,
    (err, rows) => {
      if (err) {
        console.error('Error fetching history:', err.message);
        return res.status(500).json({ error: 'Failed to fetch history' });
      }
      
      const historyMap = {};
      rows.forEach(row => {
        historyMap[row.date] = row.totalSeconds || 0;
      });
      
      const history = dates.map(date => ({
        date: date,
        totalSeconds: historyMap[date] || 0
      }));
      
      res.json({ history });
    }
  );
});

app.get('/api/sessions/active', (req, res) => {
  const dateStr = new Date().toISOString().split('T')[0];
  
  db.get(
    'SELECT * FROM sessions WHERE end_time IS NULL AND date = ? ORDER BY start_time DESC LIMIT 1',
    [dateStr],
    (err, row) => {
      if (err) {
        console.error('Error checking active session:', err.message);
        return res.status(500).json({ error: 'Failed to check active session' });
      }
      
      res.json({ active: !!row, session: row });
    }
  );
});

// Helper function to get week range (Monday to Sunday)
function getWeekRange(offsetWeeks = 0) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() - (offsetWeeks * 7) + (today.getDay() === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    monday: monday.toISOString().split('T')[0],
    sunday: sunday.toISOString().split('T')[0]
  };
}

// Get current week total (Monday to Sunday) with carry-over from previous week
app.get('/api/sessions/week-total', (req, res) => {
  const currentWeek = getWeekRange(0);
  const previousWeek = getWeekRange(-1);

  const WEEKLY_TARGET = 38 * 3600 + 30 * 60; // 38h30 = 138600 seconds

  // Get current week total
  db.get(
    'SELECT SUM(duration) as totalSeconds FROM sessions WHERE date BETWEEN ? AND ?',
    [currentWeek.monday, currentWeek.sunday],
    (err, currentRow) => {
      if (err) {
        console.error('Error fetching current week total:', err.message);
        return res.status(500).json({ error: 'Failed to fetch week total' });
      }

      const currentTotal = currentRow?.totalSeconds || 0;

      // Get previous week total to calculate overflow
      db.get(
        'SELECT SUM(duration) as totalSeconds FROM sessions WHERE date BETWEEN ? AND ?',
        [previousWeek.monday, previousWeek.sunday],
        (err, previousRow) => {
          if (err) {
            console.error('Error fetching previous week total:', err.message);
            return res.status(500).json({ error: 'Failed to fetch previous week total' });
          }

          const previousTotal = previousRow?.totalSeconds || 0;
          const overflowFromPrevious = Math.max(0, previousTotal - WEEKLY_TARGET);
          const totalWithCarryOver = currentTotal + overflowFromPrevious;

          res.json({
            totalSeconds: totalWithCarryOver,
            currentWeekSeconds: currentTotal,
            overflowFromPrevious: overflowFromPrevious,
            startDate: currentWeek.monday,
            endDate: currentWeek.sunday
          });
        }
      );
    }
  );
});

// Get week overflow (how much time was exceeded)
app.get('/api/sessions/week-overflow', (req, res) => {
  const WEEKLY_TARGET = 38 * 3600 + 30 * 60; // 38h30 = 138600 seconds
  const currentWeek = getWeekRange(0);

  db.get(
    'SELECT SUM(duration) as totalSeconds FROM sessions WHERE date BETWEEN ? AND ?',
    [currentWeek.monday, currentWeek.sunday],
    (err, row) => {
      if (err) {
        console.error('Error fetching week overflow:', err.message);
        return res.status(500).json({ error: 'Failed to fetch week overflow' });
      }

      const totalSeconds = row?.totalSeconds || 0;
      const overflow = Math.max(0, totalSeconds - WEEKLY_TARGET);
      
      res.json({ 
        overflowSeconds: overflow,
        isOver: totalSeconds > WEEKLY_TARGET
      });
    }
  );
});

// Get weekly data for the last 4 weeks
app.get('/api/sessions/weekly-history', (req, res) => {
  const today = new Date();
  const weeks = [];

  // Get the last 4 weeks (Monday to Sunday) - oldest to newest
  for (let i = 3; i >= 0; i--) {
    const weekRange = getWeekRange(-i);
    weeks.push({
      monday: weekRange.monday,
      sunday: weekRange.sunday,
      weekNumber: i
    });
  }

  const results = [];
  let completed = 0;

  weeks.forEach((week, index) => {
    db.get(
      'SELECT SUM(duration) as totalSeconds FROM sessions WHERE date BETWEEN ? AND ?',
      [week.monday, week.sunday],
      (err, row) => {
        if (err) {
          console.error('Error fetching weekly data:', err.message);
          results[index] = { ...week, totalSeconds: 0 };
        } else {
          results[index] = { ...week, totalSeconds: row?.totalSeconds || 0 };
        }

        completed++;
        if (completed === weeks.length) {
          res.json({ weeklyData: results });
        }
      }
    );
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit();
});