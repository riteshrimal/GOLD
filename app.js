/* ============================================
   GOLD TRADER PRO — Application Logic
   ============================================ */

// ============= STATE =============
const APP_KEY = 'goldtrader_pro_data';

let state = {
  trades: [],
  settings: {
    dailyGoal: 100,
    currency: 'GBP',
    symbol: '£'
  },
  ui: {
    currentView: 'dashboard',
    selectedDate: todayStr(),
    selectedWeekOffset: 0,
    chartPeriod: 7,
    editingTradeId: null
  }
};

// ============= UTILITIES =============
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatCurrency(amount) {
  const sign = amount >= 0 ? '' : '-';
  return `${sign}${state.settings.symbol}${Math.abs(amount).toFixed(2)}`;
}

function uuid() {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function isToday(dateStr) {
  return dateStr === todayStr();
}

function getWeekRange(offset) {
  const today = new Date();
  const monday = new Date(today);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1) + (offset * 7);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
    label: `${formatDateShort(monday.toISOString().slice(0, 10))} — ${formatDateShort(sunday.toISOString().slice(0, 10))}`
  };
}

// ============= DATA LAYER =============
function loadData() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.trades = parsed.trades || [];
      state.settings = { ...state.settings, ...(parsed.settings || {}) };
    }
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

function saveData() {
  try {
    localStorage.setItem(APP_KEY, JSON.stringify({
      trades: state.trades,
      settings: state.settings
    }));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

function addTrade(trade) {
  state.trades.push({ ...trade, id: uuid() });
  state.trades.sort((a, b) => b.date.localeCompare(a.date));
  saveData();
}

function updateTrade(id, updates) {
  const idx = state.trades.findIndex(t => t.id === id);
  if (idx !== -1) {
    state.trades[idx] = { ...state.trades[idx], ...updates };
    saveData();
  }
}

function deleteTrade(id) {
  state.trades = state.trades.filter(t => t.id !== id);
  saveData();
}

// ============= CALCULATIONS =============
function tradesForDate(dateStr) {
  return state.trades.filter(t => t.date === dateStr);
}

function tradesInRange(startStr, endStr) {
  return state.trades.filter(t => t.date >= startStr && t.date <= endStr);
}

function dailyPnL(dateStr) {
  return tradesForDate(dateStr).reduce((sum, t) => sum + t.amount, 0);
}

function getDailyPnLMap() {
  const map = {};
  state.trades.forEach(t => {
    map[t.date] = (map[t.date] || 0) + t.amount;
  });
  return map;
}

function getTodayPnL() {
  return dailyPnL(todayStr());
}

function getWeekPnL(offset = 0) {
  const { start, end } = getWeekRange(offset);
  return tradesInRange(start, end).reduce((sum, t) => sum + t.amount, 0);
}

function getMonthPnL() {
  const today = todayStr();
  const start = today.slice(0, 8) + '01';
  return tradesInRange(start, today).reduce((sum, t) => sum + t.amount, 0);
}

function getTradingDays() {
  const days = new Set();
  state.trades.forEach(t => days.add(t.date));
  return [...days].sort();
}

function getStreak() {
  const pnlMap = getDailyPnLMap();
  let streak = 0;
  let date = todayStr();
  // Check today first; if no trades today, start from yesterday
  if (!(date in pnlMap)) {
    date = addDays(date, -1);
  }
  while (pnlMap[date] !== undefined && pnlMap[date] >= state.settings.dailyGoal) {
    streak++;
    date = addDays(date, -1);
  }
  return streak;
}

function getWinRate() {
  const pnlMap = getDailyPnLMap();
  const days = Object.keys(pnlMap);
  if (days.length === 0) return 0;
  const wins = days.filter(d => pnlMap[d] > 0).length;
  return Math.round((wins / days.length) * 100);
}

function getDailyWinRate(dateStr) {
  const trades = tradesForDate(dateStr);
  if (trades.length === 0) return 0;
  const wins = trades.filter(t => t.amount > 0).length;
  return Math.round((wins / trades.length) * 100);
}

function getAnalytics() {
  const pnlMap = getDailyPnLMap();
  const days = Object.keys(pnlMap);
  if (days.length === 0) {
    return {
      winRate: 0, avgProfit: 0, avgLoss: 0, profitFactor: 0,
      bestDay: null, bestDayAmount: 0, worstDay: null, worstDayAmount: 0,
      totalTrades: 0, totalPnL: 0
    };
  }

  const winDays = days.filter(d => pnlMap[d] > 0);
  const lossDays = days.filter(d => pnlMap[d] < 0);

  const grossProfit = winDays.reduce((s, d) => s + pnlMap[d], 0);
  const grossLoss = Math.abs(lossDays.reduce((s, d) => s + pnlMap[d], 0));

  let bestDay = days[0], worstDay = days[0];
  days.forEach(d => {
    if (pnlMap[d] > pnlMap[bestDay]) bestDay = d;
    if (pnlMap[d] < pnlMap[worstDay]) worstDay = d;
  });

  return {
    winRate: Math.round((winDays.length / days.length) * 100),
    avgProfit: winDays.length > 0 ? grossProfit / winDays.length : 0,
    avgLoss: lossDays.length > 0 ? grossLoss / lossDays.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    bestDay,
    bestDayAmount: pnlMap[bestDay] || 0,
    worstDay,
    worstDayAmount: pnlMap[worstDay] || 0,
    totalTrades: state.trades.length,
    totalPnL: state.trades.reduce((s, t) => s + t.amount, 0)
  };
}

function getMonthlyData() {
  const map = {};
  state.trades.forEach(t => {
    const month = t.date.slice(0, 7);
    map[month] = (map[month] || 0) + t.amount;
  });
  const months = Object.keys(map).sort();
  return { months, values: months.map(m => map[m]) };
}

function getCumulativePnL() {
  const pnlMap = getDailyPnLMap();
  const days = Object.keys(pnlMap).sort();
  let cumulative = 0;
  return days.map(d => {
    cumulative += pnlMap[d];
    return { date: d, value: cumulative };
  });
}

// ============= NAVIGATION =============
function navigateTo(view) {
  state.ui.currentView = view;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const viewEl = document.getElementById(`view-${view}`);
  const navEl = document.querySelector(`.nav-link[data-view="${view}"]`);

  if (viewEl) {
    viewEl.classList.add('active');
    // Re-trigger animations
    viewEl.querySelectorAll('.animate-in').forEach(el => {
      el.style.animation = 'none';
      el.offsetHeight; // force reflow
      el.style.animation = '';
    });
  }
  if (navEl) navEl.classList.add('active');

  // Render view content
  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'daily': renderDaily(); break;
    case 'weekly': renderWeekly(); break;
    case 'analytics': renderAnalytics(); break;
    case 'settings': renderSettings(); break;
  }
}

// ============= RENDER DASHBOARD =============
let pnlLineChart = null;

function renderDashboard() {
  const todayPnl = getTodayPnL();
  const weekPnl = getWeekPnL();
  const monthPnl = getMonthPnL();
  const streak = getStreak();
  const goal = state.settings.dailyGoal;
  const todayTrades = tradesForDate(todayStr());

  // Today's P&L
  const todayValEl = document.getElementById('stat-today-value');
  todayValEl.textContent = formatCurrency(todayPnl);
  todayValEl.className = `stat-value ${todayPnl > 0 ? 'profit' : todayPnl < 0 ? 'loss' : ''}`;
  document.getElementById('stat-today-trades').textContent = `${todayTrades.length} trade${todayTrades.length !== 1 ? 's' : ''}`;
  setIndicator('stat-today-indicator', todayPnl);

  // Week P&L
  const weekValEl = document.getElementById('stat-week-value');
  weekValEl.textContent = formatCurrency(weekPnl);
  weekValEl.className = `stat-value ${weekPnl > 0 ? 'profit' : weekPnl < 0 ? 'loss' : ''}`;
  document.getElementById('stat-week-goal').textContent = `${formatCurrency(weekPnl)} / ${formatCurrency(goal * 7)} goal`;
  setIndicator('stat-week-indicator', weekPnl);

  // Month P&L
  const monthValEl = document.getElementById('stat-month-value');
  monthValEl.textContent = formatCurrency(monthPnl);
  monthValEl.className = `stat-value ${monthPnl > 0 ? 'profit' : monthPnl < 0 ? 'loss' : ''}`;
  const tradingDaysThisMonth = [...new Set(tradesInRange(todayStr().slice(0, 8) + '01', todayStr()).map(t => t.date))].length;
  document.getElementById('stat-month-days').textContent = `${tradingDaysThisMonth} trading days`;
  setIndicator('stat-month-indicator', monthPnl);

  // Streak
  document.getElementById('stat-streak-value').textContent = streak;

  // Goal Ring
  const pct = Math.min(100, Math.max(0, (todayPnl / goal) * 100));
  const ring = document.getElementById('goal-ring-progress');
  const circumference = 2 * Math.PI * 85;
  const offset = circumference - (pct / 100) * circumference;
  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = offset;

  if (todayPnl >= goal) {
    ring.classList.add('profit-ring');
  } else {
    ring.classList.remove('profit-ring');
  }

  document.getElementById('goal-percent').textContent = `${Math.round(pct)}%`;
  document.getElementById('goal-amount').textContent = `${formatCurrency(todayPnl)} / ${formatCurrency(goal)}`;

  const goalStatus = document.getElementById('goal-status');
  if (todayPnl >= goal * 1.5) {
    const reward = todayPnl * 0.25;
    goalStatus.innerHTML = `🏆 Target crushed! Spend <strong>${formatCurrency(reward)}</strong> on yourself!`;
    goalStatus.className = 'goal-status achieved reward-unlocked';
  } else if (todayPnl >= goal) {
    goalStatus.textContent = '🎉 Goal achieved! Amazing work!';
    goalStatus.className = 'goal-status achieved';
  } else if (todayPnl > 0) {
    goalStatus.textContent = `${formatCurrency(goal - todayPnl)} more to hit your goal`;
    goalStatus.className = 'goal-status';
  } else if (todayTrades.length === 0) {
    goalStatus.textContent = 'Start trading to hit your goal!';
    goalStatus.className = 'goal-status';
  } else {
    goalStatus.textContent = `In the red. ${formatCurrency(goal - todayPnl)} needed for goal`;
    goalStatus.className = 'goal-status';
  }

  // P&L Line Chart
  renderPnLChart();

  // Recent Trades
  renderRecentTrades();
}

function setIndicator(id, value) {
  const el = document.getElementById(id);
  el.className = `stat-indicator ${value > 0 ? 'positive' : value < 0 ? 'negative' : ''}`;
}

function renderPnLChart() {
  const pnlMap = getDailyPnLMap();
  const period = state.ui.chartPeriod;

  let dates = [];
  if (period === 'all') {
    dates = Object.keys(pnlMap).sort();
  } else {
    for (let i = period - 1; i >= 0; i--) {
      dates.push(addDays(todayStr(), -i));
    }
  }

  const labels = dates.map(d => formatDateShort(d));
  const data = dates.map(d => pnlMap[d] || 0);
  const goalLine = dates.map(() => state.settings.dailyGoal);

  const ctx = document.getElementById('pnl-line-chart');
  if (!ctx) return;

  if (pnlLineChart) {
    pnlLineChart.data.labels = labels;
    pnlLineChart.data.datasets[0].data = data;
    pnlLineChart.data.datasets[1].data = goalLine;
    pnlLineChart.update('active');
    return;
  }

  pnlLineChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Daily P&L',
          data,
          backgroundColor: data.map(v => v >= 0 ? 'rgba(0, 230, 118, 0.6)' : 'rgba(255, 82, 82, 0.6)'),
          borderColor: data.map(v => v >= 0 ? '#00E676' : '#FF5252'),
          borderWidth: 1,
          borderRadius: 4,
          order: 2
        },
        {
          label: `£${state.settings.dailyGoal} Goal`,
          data: goalLine,
          type: 'line',
          borderColor: 'rgba(212, 175, 55, 0.5)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#9999AA',
            font: { family: 'Inter', size: 11 },
            boxWidth: 12,
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: 'rgba(16, 16, 26, 0.95)',
          titleColor: '#EAEAEA',
          bodyColor: '#9999AA',
          borderColor: 'rgba(212, 175, 55, 0.2)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: 'Outfit', size: 13, weight: 600 },
          bodyFont: { family: 'Inter', size: 12 },
          callbacks: {
            label: function(ctx) {
              if (ctx.datasetIndex === 1) return `Goal: £${state.settings.dailyGoal}`;
              const val = ctx.raw;
              return `P&L: ${val >= 0 ? '+' : ''}£${val.toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#555566', font: { family: 'Inter', size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: {
            color: '#555566',
            font: { family: 'Inter', size: 10 },
            callback: v => `£${v}`
          }
        }
      },
      animation: { duration: 800, easing: 'easeOutQuart' }
    }
  });
}

function renderRecentTrades() {
  const tbody = document.getElementById('recent-trades-body');
  const recent = [...state.trades].slice(0, 8);

  if (recent.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No trades yet. Click + to add your first trade!</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map(t => `
    <tr class="clickable-row" onclick="editTrade('${t.id}')">
      <td>${formatDate(t.date)}</td>
      <td><span class="badge ${t.mode === 'detailed' ? t.direction : 'quick'}">${t.mode === 'detailed' ? t.direction : 'P&L'}</span></td>
      <td class="${t.amount >= 0 ? 'amount-profit' : 'amount-loss'}">${t.amount >= 0 ? '+' : ''}${formatCurrency(t.amount)}</td>
      <td>${t.notes || '—'}</td>
      <td onclick="event.stopPropagation()">
        <div class="trade-actions">
          <button class="btn-icon" onclick="editTrade('${t.id}')" title="Edit">✎</button>
          <button class="btn-icon delete" onclick="confirmDeleteTrade('${t.id}')" title="Delete">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ============= RENDER DAILY =============
function renderDaily() {
  const dateStr = state.ui.selectedDate;
  const trades = tradesForDate(dateStr);
  const pnl = dailyPnL(dateStr);
  const goal = state.settings.dailyGoal;

  // Set date picker
  document.getElementById('date-picker').value = dateStr;
  document.getElementById('date-label').textContent = isToday(dateStr) ? 'Today' : formatDate(dateStr);

  // Stats
  const pnlEl = document.getElementById('daily-pnl');
  pnlEl.textContent = formatCurrency(pnl);
  pnlEl.className = `stat-value ${pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : ''}`;

  document.getElementById('daily-trades-count').textContent = trades.length;
  document.getElementById('daily-win-rate').textContent = `${getDailyWinRate(dateStr)}%`;

  const goalEl = document.getElementById('daily-goal-status');
  if (trades.length === 0) {
    goalEl.textContent = '—';
    goalEl.className = 'stat-value';
  } else if (pnl >= goal * 1.5) {
    goalEl.innerHTML = `🏆 ${formatCurrency(pnl * 0.25)}`;
    goalEl.className = 'stat-value profit reward-text';
  } else if (pnl >= goal) {
    goalEl.textContent = '✓ Hit!';
    goalEl.className = 'stat-value profit';
  } else {
    goalEl.textContent = `${Math.round((pnl / goal) * 100)}%`;
    goalEl.className = `stat-value ${pnl >= 0 ? '' : 'loss'}`;
  }

  // Trades table
  const tbody = document.getElementById('daily-trades-body');
  if (trades.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No trades for this day</td></tr>';
    return;
  }

  tbody.innerHTML = trades.map(t => `
    <tr class="clickable-row" onclick="editTrade('${t.id}')">
      <td>${t.time || '—'}</td>
      <td><span class="badge ${t.mode === 'detailed' ? t.direction : 'quick'}">${t.mode === 'detailed' ? 'Detailed' : 'Quick'}</span></td>
      <td>${t.mode === 'detailed' ? `<span class="badge ${t.direction}">${t.direction}</span>` : '—'}</td>
      <td>${t.mode === 'detailed' ? t.entryPrice : '—'}</td>
      <td>${t.mode === 'detailed' ? t.exitPrice : '—'}</td>
      <td>${t.mode === 'detailed' ? t.lotSize : '—'}</td>
      <td class="${t.amount >= 0 ? 'amount-profit' : 'amount-loss'}">${t.amount >= 0 ? '+' : ''}${formatCurrency(t.amount)}</td>
      <td>${t.notes || '—'}</td>
      <td onclick="event.stopPropagation()">
        <div class="trade-actions">
          <button class="btn-icon" onclick="editTrade('${t.id}')" title="Edit">✎</button>
          <button class="btn-icon delete" onclick="confirmDeleteTrade('${t.id}')" title="Delete">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ============= RENDER WEEKLY =============
let weeklyBarChart = null;

function renderWeekly() {
  const offset = state.ui.selectedWeekOffset;
  const { start, end, label } = getWeekRange(offset);

  document.getElementById('week-range-label').textContent = offset === 0 ? `This Week (${label})` : label;

  const weekTrades = tradesInRange(start, end);
  const weekPnl = weekTrades.reduce((s, t) => s + t.amount, 0);
  const goal = state.settings.dailyGoal;

  // Stats
  const pnlEl = document.getElementById('weekly-pnl');
  pnlEl.textContent = formatCurrency(weekPnl);
  pnlEl.className = `stat-value ${weekPnl > 0 ? 'profit' : weekPnl < 0 ? 'loss' : ''}`;

  document.getElementById('weekly-goal-progress').textContent = `${formatCurrency(weekPnl)} / ${formatCurrency(goal * 7)}`;

  const tradedDays = new Set(weekTrades.map(t => t.date));
  document.getElementById('weekly-days-traded').textContent = `${tradedDays.size} / 7`;

  const pnlMap = getDailyPnLMap();
  let goalDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (pnlMap[d] && pnlMap[d] >= goal) goalDays++;
  }
  document.getElementById('weekly-goal-days').textContent = goalDays;

  // Bar chart
  const dayLabels = [];
  const dayData = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    dayLabels.push(getDayName(d));
    dayData.push(pnlMap[d] || 0);
  }

  const ctx = document.getElementById('weekly-bar-chart');
  if (weeklyBarChart) {
    weeklyBarChart.data.labels = dayLabels;
    weeklyBarChart.data.datasets[0].data = dayData;
    weeklyBarChart.data.datasets[0].backgroundColor = dayData.map(v => v >= 0 ? 'rgba(0, 230, 118, 0.6)' : 'rgba(255, 82, 82, 0.6)');
    weeklyBarChart.data.datasets[0].borderColor = dayData.map(v => v >= 0 ? '#00E676' : '#FF5252');
    weeklyBarChart.data.datasets[1].data = dayLabels.map(() => goal);
    weeklyBarChart.update('active');
  } else {
    weeklyBarChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [
          {
            label: 'Daily P&L',
            data: dayData,
            backgroundColor: dayData.map(v => v >= 0 ? 'rgba(0, 230, 118, 0.6)' : 'rgba(255, 82, 82, 0.6)'),
            borderColor: dayData.map(v => v >= 0 ? '#00E676' : '#FF5252'),
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Daily Goal',
            data: dayLabels.map(() => goal),
            type: 'line',
            borderColor: 'rgba(212, 175, 55, 0.5)',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { color: '#9999AA', font: { family: 'Inter', size: 11 }, boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: 'rgba(16, 16, 26, 0.95)',
            titleColor: '#EAEAEA',
            bodyColor: '#9999AA',
            borderColor: 'rgba(212, 175, 55, 0.2)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#555566', font: { family: 'Inter', size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#555566', font: { family: 'Inter', size: 10 }, callback: v => `£${v}` }
          }
        },
        animation: { duration: 600, easing: 'easeOutQuart' }
      }
    });
  }

  // Daily Breakdown cells
  const breakdownEl = document.getElementById('weekly-breakdown');
  breakdownEl.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const pnl = pnlMap[d] || 0;
    const trades = tradesForDate(d);
    const hitGoal = pnl >= goal;
    const cell = document.createElement('div');
    cell.className = `day-cell${hitGoal ? ' goal-hit' : ''}`;
    cell.innerHTML = `
      <div class="day-name">${getDayName(d)}</div>
      <div class="day-date">${formatDateShort(d)}</div>
      <div class="day-pnl ${pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : 'neutral'}">${trades.length > 0 ? formatCurrency(pnl) : '—'}</div>
      ${hitGoal ? '<div class="goal-badge">✓ Goal</div>' : ''}
    `;
    cell.addEventListener('click', () => {
      state.ui.selectedDate = d;
      navigateTo('daily');
    });
    cell.style.cursor = 'pointer';
    breakdownEl.appendChild(cell);
  }
}

// ============= RENDER ANALYTICS =============
let winlossDoughnut = null;
let monthlyBarChartInstance = null;
let cumulativeLineChart = null;

function renderAnalytics() {
  const analytics = getAnalytics();

  document.getElementById('analytics-win-rate').textContent = `${analytics.winRate}%`;
  document.getElementById('analytics-avg-profit').textContent = formatCurrency(analytics.avgProfit);
  document.getElementById('analytics-avg-loss').textContent = formatCurrency(analytics.avgLoss);

  const pfEl = document.getElementById('analytics-profit-factor');
  pfEl.textContent = analytics.profitFactor === Infinity ? '∞' : analytics.profitFactor.toFixed(2);

  if (analytics.bestDay) {
    document.getElementById('analytics-best-day').textContent = formatCurrency(analytics.bestDayAmount);
    document.getElementById('analytics-best-day').className = 'stat-value profit';
    document.getElementById('analytics-best-day-date').textContent = formatDate(analytics.bestDay);
  }

  if (analytics.worstDay) {
    document.getElementById('analytics-worst-day').textContent = formatCurrency(analytics.worstDayAmount);
    document.getElementById('analytics-worst-day').className = 'stat-value loss';
    document.getElementById('analytics-worst-day-date').textContent = formatDate(analytics.worstDay);
  }

  document.getElementById('analytics-total-trades').textContent = analytics.totalTrades;
  const totalPnlEl = document.getElementById('analytics-total-pnl');
  totalPnlEl.textContent = formatCurrency(analytics.totalPnL);
  totalPnlEl.className = `stat-value ${analytics.totalPnL > 0 ? 'profit' : analytics.totalPnL < 0 ? 'loss' : ''}`;

  // Win/Loss Doughnut
  const pnlMap = getDailyPnLMap();
  const days = Object.keys(pnlMap);
  const winDays = days.filter(d => pnlMap[d] > 0).length;
  const lossDays = days.filter(d => pnlMap[d] < 0).length;
  const breakEvenDays = days.filter(d => pnlMap[d] === 0).length;

  const doughnutCtx = document.getElementById('winloss-doughnut-chart');
  if (winlossDoughnut) {
    winlossDoughnut.data.datasets[0].data = [winDays, lossDays, breakEvenDays];
    winlossDoughnut.update('active');
  } else {
    winlossDoughnut = new Chart(doughnutCtx, {
      type: 'doughnut',
      data: {
        labels: ['Winning Days', 'Losing Days', 'Break Even'],
        datasets: [{
          data: [winDays, lossDays, breakEvenDays],
          backgroundColor: ['rgba(0, 230, 118, 0.7)', 'rgba(255, 82, 82, 0.7)', 'rgba(100, 100, 120, 0.5)'],
          borderColor: ['#00E676', '#FF5252', '#666'],
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#9999AA', font: { family: 'Inter', size: 11 }, padding: 16, boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: 'rgba(16, 16, 26, 0.95)',
            titleColor: '#EAEAEA',
            bodyColor: '#9999AA',
            borderColor: 'rgba(212, 175, 55, 0.2)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8
          }
        },
        animation: { animateRotate: true, duration: 800 }
      }
    });
  }

  // Monthly Bar Chart
  const monthlyData = getMonthlyData();
  const monthBarCtx = document.getElementById('monthly-bar-chart');
  const monthLabels = monthlyData.months.map(m => {
    const [y, mo] = m.split('-');
    return new Date(y, parseInt(mo) - 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  });

  if (monthlyBarChartInstance) {
    monthlyBarChartInstance.data.labels = monthLabels;
    monthlyBarChartInstance.data.datasets[0].data = monthlyData.values;
    monthlyBarChartInstance.data.datasets[0].backgroundColor = monthlyData.values.map(v => v >= 0 ? 'rgba(0, 230, 118, 0.6)' : 'rgba(255, 82, 82, 0.6)');
    monthlyBarChartInstance.update('active');
  } else {
    monthlyBarChartInstance = new Chart(monthBarCtx, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'Monthly P&L',
          data: monthlyData.values,
          backgroundColor: monthlyData.values.map(v => v >= 0 ? 'rgba(0, 230, 118, 0.6)' : 'rgba(255, 82, 82, 0.6)'),
          borderColor: monthlyData.values.map(v => v >= 0 ? '#00E676' : '#FF5252'),
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(16, 16, 26, 0.95)',
            titleColor: '#EAEAEA',
            bodyColor: '#9999AA',
            borderColor: 'rgba(212, 175, 55, 0.2)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: ctx => `P&L: ${ctx.raw >= 0 ? '+' : ''}£${ctx.raw.toFixed(2)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#555566', font: { family: 'Inter', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#555566', font: { family: 'Inter', size: 10 }, callback: v => `£${v}` }
          }
        },
        animation: { duration: 600 }
      }
    });
  }

  // Cumulative P&L Chart
  const cumData = getCumulativePnL();
  const cumCtx = document.getElementById('cumulative-line-chart');
  if (cumulativeLineChart) {
    cumulativeLineChart.data.labels = cumData.map(d => formatDateShort(d.date));
    cumulativeLineChart.data.datasets[0].data = cumData.map(d => d.value);
    cumulativeLineChart.update('active');
  } else {
    cumulativeLineChart = new Chart(cumCtx, {
      type: 'line',
      data: {
        labels: cumData.map(d => formatDateShort(d.date)),
        datasets: [{
          label: 'Cumulative P&L',
          data: cumData.map(d => d.value),
          borderColor: '#D4AF37',
          backgroundColor: 'rgba(212, 175, 55, 0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#D4AF37',
          pointBorderColor: '#0a0a0f',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(16, 16, 26, 0.95)',
            titleColor: '#EAEAEA',
            bodyColor: '#D4AF37',
            borderColor: 'rgba(212, 175, 55, 0.2)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: ctx => `Total: ${ctx.raw >= 0 ? '+' : ''}£${ctx.raw.toFixed(2)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#555566', font: { family: 'Inter', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#555566', font: { family: 'Inter', size: 10 }, callback: v => `£${v}` }
          }
        },
        animation: { duration: 800, easing: 'easeOutQuart' }
      }
    });
  }
}

// ============= RENDER SETTINGS =============
function renderSettings() {
  document.getElementById('setting-daily-goal').value = state.settings.dailyGoal;
  document.getElementById('setting-weekly-goal').textContent = `£${state.settings.dailyGoal * 7} (7 × daily)`;
}

// ============= MODAL MANAGEMENT =============
function openTradeModal(editId = null) {
  const modal = document.getElementById('trade-modal');
  const form = document.getElementById('trade-form');
  state.ui.editingTradeId = editId;

  if (editId) {
    const trade = state.trades.find(t => t.id === editId);
    if (!trade) return;
    document.getElementById('trade-modal-title').textContent = 'Edit Trade';
    document.getElementById('trade-submit').textContent = 'Save Changes';
    document.getElementById('trade-id').value = editId;
    document.getElementById('trade-date').value = trade.date;
    document.getElementById('trade-notes').value = trade.notes || '';

    if (trade.mode === 'detailed') {
      setTradeMode('detailed');
      document.getElementById('trade-direction').value = trade.direction;
      document.getElementById('trade-lots').value = trade.lotSize;
      document.getElementById('trade-entry').value = trade.entryPrice;
      document.getElementById('trade-exit').value = trade.exitPrice;
      updateCalculatedPnL();
    } else {
      setTradeMode('quick');
      document.getElementById('trade-amount').value = trade.amount;
    }
  } else {
    document.getElementById('trade-modal-title').textContent = 'Add Trade';
    document.getElementById('trade-submit').textContent = 'Add Trade';
    document.getElementById('trade-id').value = '';
    form.reset();
    document.getElementById('trade-date').value = state.ui.currentView === 'daily' ? state.ui.selectedDate : todayStr();
    setTradeMode('quick');
  }

  modal.classList.add('open');
}

function closeTradeModal() {
  document.getElementById('trade-modal').classList.remove('open');
  state.ui.editingTradeId = null;
}

function setTradeMode(mode) {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('quick-fields').classList.toggle('hidden', mode !== 'quick');
  document.getElementById('detailed-fields').classList.toggle('hidden', mode !== 'detailed');

  // Toggle required attributes
  const quickAmount = document.getElementById('trade-amount');
  const detailedEntry = document.getElementById('trade-entry');
  const detailedExit = document.getElementById('trade-exit');

  if (mode === 'quick') {
    quickAmount.required = true;
    detailedEntry.required = false;
    detailedExit.required = false;
  } else {
    quickAmount.required = false;
    detailedEntry.required = true;
    detailedExit.required = true;
  }
}

function updateCalculatedPnL() {
  const direction = document.getElementById('trade-direction').value;
  const entry = parseFloat(document.getElementById('trade-entry').value) || 0;
  const exit = parseFloat(document.getElementById('trade-exit').value) || 0;
  const lots = parseFloat(document.getElementById('trade-lots').value) || 0;

  // Gold pip value: 1 lot = $100 per $1 move, approximate to GBP
  let pnl = 0;
  if (direction === 'buy') {
    pnl = (exit - entry) * lots * 100;
  } else {
    pnl = (entry - exit) * lots * 100;
  }

  // Rough USD to GBP conversion
  pnl = pnl * 0.79;

  const el = document.getElementById('calculated-pnl');
  el.textContent = formatCurrency(pnl);
  el.style.color = pnl >= 0 ? 'var(--profit)' : 'var(--loss)';
  return pnl;
}

function openConfirmModal(title, message, onConfirm) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').textContent = message;
  document.getElementById('confirm-modal').classList.add('open');

  const okBtn = document.getElementById('confirm-ok');
  const newBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newBtn, okBtn);
  newBtn.id = 'confirm-ok';
  newBtn.addEventListener('click', () => {
    onConfirm();
    closeConfirmModal();
  });
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('open');
}

// ============= TRADE ACTIONS =============
function editTrade(id) {
  openTradeModal(id);
}

function confirmDeleteTrade(id) {
  openConfirmModal('Delete Trade', 'Are you sure you want to delete this trade? This cannot be undone.', () => {
    deleteTrade(id);
    refreshCurrentView();
    showToast('Trade deleted', 'success');
  });
}

// ============= TOAST =============
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${type === 'success' ? '✓' : '✕'} ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============= REFRESH =============
function refreshCurrentView() {
  navigateTo(state.ui.currentView);
}

// ============= SAMPLE DATA =============
function generateSampleData() {
  const samples = [];
  const today = new Date();

  for (let i = 20; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay();

    // Skip some weekends
    if ((dayOfWeek === 0 || dayOfWeek === 6) && Math.random() > 0.3) continue;

    // Generate 1-4 trades per day
    const numTrades = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < numTrades; j++) {
      const isWin = Math.random() > 0.35;
      const amount = isWin
        ? Math.round((30 + Math.random() * 120) * 100) / 100
        : -Math.round((10 + Math.random() * 80) * 100) / 100;

      const notes = [
        'Breakout trade', 'Pullback entry', 'News spike', 'Range trade',
        'Trend continuation', 'London session', 'NY session', 'Scalp trade',
        'Swing position', 'Support bounce', 'Resistance rejection'
      ];

      if (Math.random() > 0.5) {
        // Quick mode
        samples.push({
          id: uuid(),
          date: dateStr,
          mode: 'quick',
          amount,
          notes: notes[Math.floor(Math.random() * notes.length)],
          time: `${8 + Math.floor(Math.random() * 10)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`
        });
      } else {
        // Detailed mode
        const direction = Math.random() > 0.5 ? 'buy' : 'sell';
        const entry = 2300 + Math.random() * 100;
        const diff = (amount / 0.79) / (0.1 * 100);
        const exit = direction === 'buy' ? entry + diff : entry - diff;
        samples.push({
          id: uuid(),
          date: dateStr,
          mode: 'detailed',
          direction,
          entryPrice: Math.round(entry * 100) / 100,
          exitPrice: Math.round(exit * 100) / 100,
          lotSize: 0.10,
          amount,
          notes: notes[Math.floor(Math.random() * notes.length)],
          time: `${8 + Math.floor(Math.random() * 10)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`
        });
      }
    }
  }

  return samples;
}

// ============= EXPORT / IMPORT =============
function exportData() {
  const data = JSON.stringify({ trades: state.trades, settings: state.settings }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `goldtrader_backup_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported successfully');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.trades && Array.isArray(data.trades)) {
        state.trades = data.trades;
        if (data.settings) state.settings = { ...state.settings, ...data.settings };
        saveData();
        destroyAllCharts();
        refreshCurrentView();
        showToast(`Imported ${data.trades.length} trades`);
      } else {
        showToast('Invalid data format', 'error');
      }
    } catch (err) {
      showToast('Failed to parse file', 'error');
    }
  };
  reader.readAsText(file);
}

function destroyAllCharts() {
  if (pnlLineChart) { pnlLineChart.destroy(); pnlLineChart = null; }
  if (weeklyBarChart) { weeklyBarChart.destroy(); weeklyBarChart = null; }
  if (winlossDoughnut) { winlossDoughnut.destroy(); winlossDoughnut = null; }
  if (monthlyBarChartInstance) { monthlyBarChartInstance.destroy(); monthlyBarChartInstance = null; }
  if (cumulativeLineChart) { cumulativeLineChart.destroy(); cumulativeLineChart = null; }
}

// ============= PARTICLES =============
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  const PARTICLE_COUNT = 50;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3 - 0.1;
      this.opacity = Math.random() * 0.4 + 0.1;
      this.fadeDirection = Math.random() > 0.5 ? 1 : -1;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.opacity += this.fadeDirection * 0.002;
      if (this.opacity <= 0.05 || this.opacity >= 0.5) this.fadeDirection *= -1;
      if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
        this.reset();
        this.y = canvas.height + 10;
      }
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212, 175, 55, ${this.opacity})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.update();
      p.draw();
    });

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(212, 175, 55, ${0.05 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }
  animate();
}

// ============= EVENT LISTENERS =============
function initEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => navigateTo(link.dataset.view));
  });

  // View all trades button
  document.getElementById('btn-view-all-trades').addEventListener('click', () => navigateTo('daily'));

  // FAB
  document.getElementById('fab-add-trade').addEventListener('click', () => openTradeModal());

  // Trade modal
  document.getElementById('trade-modal-overlay').addEventListener('click', closeTradeModal);
  document.getElementById('trade-modal-close').addEventListener('click', closeTradeModal);
  document.getElementById('trade-cancel').addEventListener('click', closeTradeModal);

  // Confirm modal
  document.getElementById('confirm-modal-overlay').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-modal-close').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirmModal);

  // Trade mode toggle
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setTradeMode(btn.dataset.mode));
  });

  // Auto-calculate P&L for detailed mode
  ['trade-entry', 'trade-exit', 'trade-lots', 'trade-direction'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateCalculatedPnL);
    document.getElementById(id).addEventListener('change', updateCalculatedPnL);
  });

  // Trade form submit
  document.getElementById('trade-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const isQuick = !document.getElementById('quick-fields').classList.contains('hidden');
    const date = document.getElementById('trade-date').value;
    const notes = document.getElementById('trade-notes').value.trim();
    const editId = document.getElementById('trade-id').value;

    let trade;
    if (isQuick) {
      const amount = parseFloat(document.getElementById('trade-amount').value);
      if (isNaN(amount)) return showToast('Please enter a valid amount', 'error');
      trade = { date, mode: 'quick', amount, notes, time: new Date().toTimeString().slice(0, 5) };
    } else {
      const direction = document.getElementById('trade-direction').value;
      const entryPrice = parseFloat(document.getElementById('trade-entry').value);
      const exitPrice = parseFloat(document.getElementById('trade-exit').value);
      const lotSize = parseFloat(document.getElementById('trade-lots').value);
      if (isNaN(entryPrice) || isNaN(exitPrice) || isNaN(lotSize)) {
        return showToast('Please fill all trade details', 'error');
      }
      const amount = updateCalculatedPnL();
      trade = { date, mode: 'detailed', direction, entryPrice, exitPrice, lotSize, amount, notes, time: new Date().toTimeString().slice(0, 5) };
    }

    if (editId) {
      updateTrade(editId, trade);
      showToast('Trade updated');
    } else {
      addTrade(trade);
      showToast('Trade added');
    }

    closeTradeModal();
    destroyAllCharts();
    refreshCurrentView();
  });

  // Date navigation
  document.getElementById('date-prev').addEventListener('click', () => {
    state.ui.selectedDate = addDays(state.ui.selectedDate, -1);
    renderDaily();
  });
  document.getElementById('date-next').addEventListener('click', () => {
    state.ui.selectedDate = addDays(state.ui.selectedDate, 1);
    renderDaily();
  });
  document.getElementById('date-today').addEventListener('click', () => {
    state.ui.selectedDate = todayStr();
    renderDaily();
  });
  document.getElementById('date-picker').addEventListener('change', (e) => {
    state.ui.selectedDate = e.target.value;
    renderDaily();
  });

  // Add trade from daily view
  document.getElementById('btn-add-trade-daily').addEventListener('click', () => openTradeModal());

  // Week navigation
  document.getElementById('week-prev').addEventListener('click', () => {
    state.ui.selectedWeekOffset--;
    weeklyBarChart && weeklyBarChart.destroy();
    weeklyBarChart = null;
    renderWeekly();
  });
  document.getElementById('week-next').addEventListener('click', () => {
    state.ui.selectedWeekOffset++;
    weeklyBarChart && weeklyBarChart.destroy();
    weeklyBarChart = null;
    renderWeekly();
  });

  // Chart period toggle
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.ui.chartPeriod = btn.dataset.period === 'all' ? 'all' : parseInt(btn.dataset.period);
      if (pnlLineChart) { pnlLineChart.destroy(); pnlLineChart = null; }
      renderPnLChart();
    });
  });

  // Settings
  document.getElementById('setting-daily-goal').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 100;
    document.getElementById('setting-weekly-goal').textContent = `£${val * 7} (7 × daily)`;
  });

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    state.settings.dailyGoal = parseInt(document.getElementById('setting-daily-goal').value) || 100;
    saveData();
    destroyAllCharts();
    showToast('Settings saved');
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', exportData);

  // Import
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      importData(e.target.files[0]);
    }
  });

  // Load sample
  document.getElementById('btn-load-sample').addEventListener('click', () => {
    openConfirmModal('Load Sample Data', 'This will add demo trades to your data. Your existing trades will be kept. Continue?', () => {
      const samples = generateSampleData();
      state.trades = [...state.trades, ...samples];
      state.trades.sort((a, b) => b.date.localeCompare(a.date));
      saveData();
      destroyAllCharts();
      refreshCurrentView();
      showToast(`Loaded ${samples.length} sample trades`);
    });
  });

  // Reset
  document.getElementById('btn-reset').addEventListener('click', () => {
    openConfirmModal('Reset All Data', 'This will permanently delete ALL your trade data. This cannot be undone!', () => {
      state.trades = [];
      saveData();
      destroyAllCharts();
      refreshCurrentView();
      showToast('All data has been reset');
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTradeModal();
      closeConfirmModal();
    }
    // Ctrl+N for new trade
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      openTradeModal();
    }
  });
}

// ============= INITIALIZATION =============
function init() {
  loadData();

  // If first time (no trades), load sample data automatically
  if (state.trades.length === 0) {
    state.trades = generateSampleData();
    saveData();
  }

  initParticles();
  initEventListeners();
  navigateTo('dashboard');
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
