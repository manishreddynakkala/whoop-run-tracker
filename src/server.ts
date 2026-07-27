import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { getAuthorizationUrl, exchangeCodeForToken } from './whoop/auth.js';
import { syncWhoopWorkouts } from './whoop/sync.js';
import { getDb } from './db/index.js';
import { getSupabaseClient, isSupabaseConfigured } from './db/supabase.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to construct dynamic redirect URI based on current request host
function getRedirectUri(req: Request): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  return `${protocol}://${host}/auth/callback`;
}

// Serve Dashboard UI
app.get('/', async (req: Request, res: Response) => {
  const useSupabase = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  let token: any = null;

  if (useSupabase && supabase) {
    try {
      const tokenRes = await supabase.from('whoop_tokens').select('*').maybeSingle();
      token = tokenRes.data;
    } catch (err) {}
  } else {
    try {
      const db = await getDb();
      token = await db.get('SELECT * FROM whoop_tokens LIMIT 1');
    } catch (err) {}
  }

  const hasTokenRecord = !!token;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Run Tracker</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/hammerjs@2.0.8"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1"></script>
  <style>
    :root {
      --bg-dark: #070a12;
      --card-bg: rgba(15, 23, 42, 0.85);
      --card-border: rgba(255, 255, 255, 0.1);
      --theme-blue: #00c6ff;
      --theme-blue-deep: #0072ff;
      --theme-blue-glow: rgba(0, 198, 255, 0.35);
      --theme-sky: #38bdf8;
      --theme-cyan: #06b6d4;
      --theme-green: #00e676;
      --text-white: #ffffff;
      --text-gray: #94a3b8;
      --text-dim: #64748b;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(at 15% 15%, rgba(0, 198, 255, 0.18) 0px, transparent 45%),
        radial-gradient(at 85% 85%, rgba(56, 189, 248, 0.12) 0px, transparent 45%);
      color: var(--text-white);
      min-height: 100vh;
      padding: 1.5rem 1rem;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .container {
      max-width: 1140px;
      margin: 0 auto;
    }

    /* Header Bar */
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 1.5rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--card-border);
    }

    .logo-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-badge {
      background: linear-gradient(135deg, var(--theme-blue), var(--theme-blue-deep));
      width: 48px;
      height: 48px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 1.5rem;
      letter-spacing: -1px;
      color: white;
      box-shadow: 0 4px 25px var(--theme-blue-glow);
    }

    .title-group h1 {
      font-size: 1.85rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      text-transform: none;
      background: linear-gradient(to right, #ffffff, #cbd5e1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 16px;
      border-radius: 24px;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
    }

    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
    }

    .status-connected { background-color: var(--theme-green); box-shadow: 0 0 12px rgba(0, 230, 118, 0.4); }
    .status-disconnected { background-color: #ef4444; box-shadow: 0 0 12px rgba(239, 68, 68, 0.4); }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 0.85rem;
      letter-spacing: -0.01em;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.25s ease;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--theme-blue), var(--theme-blue-deep));
      color: white;
      box-shadow: 0 4px 20px var(--theme-blue-glow);
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(0, 198, 255, 0.5);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.07);
      color: var(--text-white);
      border: 1px solid var(--card-border);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
    }

    /* Tab Navigation Bar */
    .tab-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 1.75rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.75rem;
    }

    .tab-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      color: var(--text-gray);
      padding: 11px 22px;
      border-radius: 14px;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      cursor: pointer;
      transition: all 0.25s ease;
    }

    .tab-btn:hover {
      background: rgba(255, 255, 255, 0.09);
      color: var(--text-white);
    }

    .tab-btn.active {
      background: linear-gradient(135deg, var(--theme-blue), var(--theme-blue-deep));
      color: white;
      border-color: transparent;
      box-shadow: 0 4px 20px var(--theme-blue-glow);
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Date Period Filter Bar */
    .filter-bar {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.1rem 1.5rem;
      margin-bottom: 1.75rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1.25rem;
    }

    .filter-title {
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text-gray);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .preset-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .preset-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--text-gray);
      padding: 8px 16px;
      border-radius: 12px;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .preset-btn:hover, .preset-btn.active {
      background: linear-gradient(135deg, var(--theme-blue), var(--theme-blue-deep));
      color: white;
      border-color: transparent;
      box-shadow: 0 4px 15px var(--theme-blue-glow);
    }

    .date-inputs {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .date-inputs input[type="date"] {
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid var(--card-border);
      color: var(--text-white);
      padding: 8px 12px;
      border-radius: 10px;
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 600;
    }

    /* Automated Insights Banner */
    .insights-card {
      background: linear-gradient(135deg, rgba(0, 198, 255, 0.12), rgba(0, 114, 255, 0.06));
      border: 1px solid rgba(0, 198, 255, 0.25);
      border-radius: 20px;
      padding: 1.35rem 1.6rem;
      margin-bottom: 1.75rem;
      backdrop-filter: blur(16px);
    }

    .insights-header {
      font-size: 0.85rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--theme-blue);
      margin-bottom: 0.5rem;
    }

    .insights-text {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--text-white);
      line-height: 1.6;
    }

    /* Monthly Goal Progress Card */
    .goal-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.4rem 1.6rem;
      margin-bottom: 1.75rem;
    }

    .goal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.8rem;
    }

    .goal-title {
      font-size: 0.85rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-gray);
    }

    .goal-stats {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--theme-blue);
    }

    .progress-bar-bg {
      background: rgba(255, 255, 255, 0.08);
      height: 12px;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 0.6rem;
    }

    .progress-bar-fill {
      background: linear-gradient(90deg, var(--theme-blue), var(--theme-blue-deep));
      height: 100%;
      border-radius: 10px;
      transition: width 0.4s ease;
      box-shadow: 0 0 12px var(--theme-blue-glow);
    }

    .goal-footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.78rem;
      color: var(--text-dim);
      font-weight: 500;
    }

    /* Personal Records (PRs) Section */
    .prs-section {
      margin-bottom: 1.75rem;
    }

    .prs-title {
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-white);
      margin-bottom: 0.9rem;
    }

    .prs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 1rem;
    }

    .pr-card {
      background: rgba(0, 198, 255, 0.06);
      border: 1px solid rgba(0, 198, 255, 0.2);
      border-radius: 16px;
      padding: 1.1rem;
    }

    .pr-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      margin-bottom: 0.3rem;
    }

    .pr-value {
      font-size: 1.45rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--theme-blue);
    }

    .pr-date {
      font-size: 0.72rem;
      color: var(--text-gray);
      margin-top: 0.3rem;
    }

    /* Metric Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
      gap: 1.1rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.25rem 1.1rem;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .card:hover {
      border-color: rgba(0, 198, 255, 0.3);
      transform: translateY(-2px);
    }

    .card-title {
      font-size: 0.78rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      margin-bottom: 0.4rem;
    }

    .card-value {
      font-size: 1.95rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      color: var(--theme-blue) !important;
    }

    .card-subtitle {
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--text-dim);
      margin-top: 0.4rem;
    }

    /* Charts Grid Section */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2.25rem;
    }

    @media (max-width: 600px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
    }

    .chart-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.2rem;
    }

    .chart-title {
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-white);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chart-zoom-btn {
      background: rgba(0, 198, 255, 0.12);
      border: 1px solid rgba(0, 198, 255, 0.3);
      color: var(--theme-blue);
      padding: 6px 12px;
      border-radius: 10px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .chart-zoom-btn:hover {
      background: var(--theme-blue);
      color: white;
      border-color: transparent;
      box-shadow: 0 4px 15px var(--theme-blue-glow);
    }

    .chart-body {
      position: relative;
      width: 100%;
      height: 280px;
    }

    /* Zoom Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(5, 7, 18, 0.88);
      backdrop-filter: blur(20px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
      padding: 1.5rem;
    }

    .modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .modal-container {
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      width: 94vw;
      max-width: 1100px;
      height: 85vh;
      max-height: 750px;
      padding: 1.75rem;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 30px var(--theme-blue-glow);
    }

    .modal-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      gap: 12px;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--card-border);
    }

    .modal-title {
      font-size: 1.2rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-white);
    }

    .modal-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .modal-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--card-border);
      color: var(--text-white);
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .modal-btn:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    .modal-btn-close {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #ef4444;
    }

    .modal-btn-close:hover {
      background: #ef4444;
      color: white;
    }

    .modal-body {
      flex: 1;
      position: relative;
      width: 100%;
      height: 100%;
    }

    /* Running Activities Table Section */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.1rem;
    }

    .section-title {
      font-size: 1.3rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .table-container {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-bottom: 3rem;
    }

    table {
      width: 100%;
      min-width: 800px;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.02);
      padding: 1rem 1.25rem;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-weight: 700;
      color: var(--text-dim);
      border-bottom: 1px solid var(--card-border);
    }

    td {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.92rem;
      font-weight: 500;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .badge {
      display: inline-block;
      padding: 5px 10px;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      background: rgba(0, 198, 255, 0.12);
      color: var(--theme-blue);
      border: 1px solid rgba(0, 198, 255, 0.25);
    }

    .badge-dist {
      background: rgba(0, 198, 255, 0.15);
      color: var(--theme-blue);
      border: 1px solid rgba(0, 198, 255, 0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-section">
        <div class="logo-badge">R</div>
        <div class="title-group">
          <h1>Run Tracker</h1>
        </div>
      </div>
      <div class="header-actions">
        <div class="status-pill">
          <div class="status-dot ${hasTokenRecord ? 'status-connected' : 'status-disconnected'}"></div>
          ${hasTokenRecord ? 'Authenticated' : 'Not Connected'}
        </div>
        <a href="/auth/login" class="btn btn-secondary">
          ${hasTokenRecord ? 'Re-authenticate' : 'Connect Account'}
        </a>
        <button onclick="triggerSync()" class="btn btn-primary" id="syncBtn">
          Sync Data
        </button>
      </div>
    </header>

    <!-- Tab Bar Navigation -->
    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab('overviewTab', this)">Overview</button>
      <button class="tab-btn" onclick="switchTab('analyticsTab', this)">Analytics</button>
      <button class="tab-btn" onclick="switchTab('historyTab', this)">History</button>
    </div>

    <!-- TAB 1: OVERVIEW & RECORDS -->
    <div class="tab-content active" id="overviewTab">
      <!-- Automated Performance Insights Banner -->
      <div class="insights-card">
        <div class="insights-header">Performance Trend Insights</div>
        <div class="insights-text" id="insightsContent">Analyzing your recent running activities...</div>
      </div>

      <!-- Monthly Goal Tracker -->
      <div class="goal-card">
        <div class="goal-header">
          <div class="goal-title">Monthly Target Goal (100 km)</div>
          <div class="goal-stats" id="goalPercentage">0% Completed</div>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" id="goalProgressBar" style="width: 0%"></div>
        </div>
        <div class="goal-footer">
          <span id="goalProgressSubtext">0.00 km / 100.00 km completed</span>
          <span id="goalRemainingSubtext">100.00 km remaining this month</span>
        </div>
      </div>

      <!-- Personal Records (PRs) Section -->
      <div class="prs-section">
        <div class="prs-title">Personal Records & Highlights</div>
        <div class="prs-grid">
          <div class="pr-card">
            <div class="pr-label">Longest Run</div>
            <div class="pr-value" id="prLongestRun">-</div>
            <div class="pr-date" id="prLongestDate">All Time</div>
          </div>
          <div class="pr-card">
            <div class="pr-label">Fastest Pace</div>
            <div class="pr-value" id="prFastestPace">-</div>
            <div class="pr-date" id="prFastestDate">All Time</div>
          </div>
          <div class="pr-card">
            <div class="pr-label">Highest Strain</div>
            <div class="pr-value" id="prHighestStrain">-</div>
            <div class="pr-date" id="prStrainDate">WHOOP 0-21</div>
          </div>
          <div class="pr-card">
            <div class="pr-label">Max Calorie Burn</div>
            <div class="pr-value" id="prMaxCalories">-</div>
            <div class="pr-date" id="prCaloriesDate">Single Session</div>
          </div>
        </div>
      </div>

      <!-- Summary Metrics Grid -->
      <div class="grid">
        <div class="card">
          <div class="card-title">Run Count</div>
          <div class="card-value" id="kpiRunsCount">-</div>
          <div class="card-subtitle">Sessions</div>
        </div>
        <div class="card">
          <div class="card-title">Total Distance</div>
          <div class="card-value" id="kpiDistance">-</div>
          <div class="card-subtitle">Kilometers</div>
        </div>
        <div class="card">
          <div class="card-title">Avg Pace</div>
          <div class="card-value" id="kpiAvgPace">-</div>
          <div class="card-subtitle">min / km</div>
        </div>
        <div class="card">
          <div class="card-title">Total Duration</div>
          <div class="card-value" id="kpiDuration">-</div>
          <div class="card-subtitle">Hours & Mins</div>
        </div>
        <div class="card">
          <div class="card-title">Total Calories</div>
          <div class="card-value" id="kpiCalories">-</div>
          <div class="card-subtitle">kcal burned</div>
        </div>
        <div class="card">
          <div class="card-title">Avg Strain</div>
          <div class="card-value" id="kpiAvgStrain">-</div>
          <div class="card-subtitle">WHOOP 0-21</div>
        </div>
        <div class="card">
          <div class="card-title">Avg / Max HR</div>
          <div class="card-value" id="kpiAvgHr" style="font-size:1.45rem;">-</div>
          <div class="card-subtitle">BPM</div>
        </div>
      </div>
    </div>

    <!-- TAB 2: ANALYTICS (GRAPHICAL VISUALS) -->
    <div class="tab-content" id="analyticsTab">
      <div class="charts-grid">
        <!-- Chart 1: Distance & Pace Trend -->
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Distance & Pace Progression</div>
            <button class="chart-zoom-btn" onclick="openZoomModal('chartDistancePace', 'Distance & Pace Progression')">Expand / Zoom</button>
          </div>
          <div class="chart-body">
            <canvas id="chartDistancePace"></canvas>
          </div>
        </div>

        <!-- Chart 2: Heart Rate Zone Distribution -->
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Heart Rate Zone Breakdown (Zone 1-5)</div>
            <button class="chart-zoom-btn" onclick="openZoomModal('chartHrZones', 'Heart Rate Zone Breakdown')">Expand / Zoom</button>
          </div>
          <div class="chart-body">
            <canvas id="chartHrZones"></canvas>
          </div>
        </div>

        <!-- Chart 3: Strain vs Heart Rate Efficiency -->
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Strain vs Heart Rate Efficiency</div>
            <button class="chart-zoom-btn" onclick="openZoomModal('chartStrainHr', 'Strain vs Heart Rate Efficiency')">Expand / Zoom</button>
          </div>
          <div class="chart-body">
            <canvas id="chartStrainHr"></canvas>
          </div>
        </div>

        <!-- Chart 4: Weekly Mileage Progression -->
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Weekly Mileage Progression</div>
            <button class="chart-zoom-btn" onclick="openZoomModal('chartWeeklyMileage', 'Weekly Mileage Progression')">Expand / Zoom</button>
          </div>
          <div class="chart-body">
            <canvas id="chartWeeklyMileage"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: HISTORY (RUNNING PERFORMANCE HISTORY TABLE) -->
    <div class="tab-content" id="historyTab">
      <!-- Date Period Filter Controls -->
      <div class="filter-bar">
        <div class="filter-title">
          Select Period:
        </div>
        <div class="preset-group">
          <button class="preset-btn" onclick="selectPreset('7d', this)">7 Days</button>
          <button class="preset-btn" onclick="selectPreset('30d', this)">30 Days</button>
          <button class="preset-btn" onclick="selectPreset('month', this)">This Month</button>
          <button class="preset-btn active" onclick="selectPreset('all', this)">All Time</button>
        </div>
        <div class="date-inputs">
          <input type="date" id="startDate" onchange="customDateChanged()" />
          <span style="font-size:0.8rem; color:var(--text-dim)">to</span>
          <input type="date" id="endDate" onchange="customDateChanged()" />
        </div>
      </div>

      <!-- Running Activities Table -->
      <div class="section-header">
        <div class="section-title">
          Running Performance History <span id="periodLabel" style="font-size:0.85rem; font-weight:500; color:var(--text-dim)">(All Time)</span>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Sport</th>
              <th>Distance (km)</th>
              <th>Pace (min/km)</th>
              <th>Duration</th>
              <th>Strain</th>
              <th>Avg / Max HR</th>
              <th>Calories</th>
            </tr>
          </thead>
          <tbody id="runsTableBody">
            <tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-dim)">Loading running activities...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Zoom Fullscreen Modal Overlay -->
  <div class="modal-overlay" id="zoomModal">
    <div class="modal-container">
      <div class="modal-header">
        <div class="modal-title" id="modalChartTitle">Chart Detailed View</div>
        <div class="modal-controls">
          <button class="modal-btn" onclick="zoomInModalChart()">Zoom In (+)</button>
          <button class="modal-btn" onclick="zoomOutModalChart()">Zoom Out (-)</button>
          <button class="modal-btn" onclick="resetModalChartZoom()">Reset</button>
          <button class="modal-btn modal-btn-close" onclick="closeZoomModal()">Close</button>
        </div>
      </div>
      <div class="modal-body">
        <canvas id="modalChartCanvas"></canvas>
      </div>
    </div>
  </div>

  <script>
    let currentStartDate = null;
    let currentEndDate = null;
    let chartInstanceDistancePace = null;
    let chartInstanceHrZones = null;
    let chartInstanceStrainHr = null;
    let chartInstanceWeeklyMileage = null;
    let modalChartInstance = null;

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

    function switchTab(tabId, btnEl) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      if (btnEl) btnEl.classList.add('active');
      const targetContent = document.getElementById(tabId);
      if (targetContent) targetContent.classList.add('active');

      // Trigger chart resize if Analytics tab opened
      if (tabId === 'analyticsTab') {
        setTimeout(() => {
          if (chartInstanceDistancePace) chartInstanceDistancePace.resize();
          if (chartInstanceHrZones) chartInstanceHrZones.resize();
          if (chartInstanceStrainHr) chartInstanceStrainHr.resize();
          if (chartInstanceWeeklyMileage) chartInstanceWeeklyMileage.resize();
        }, 50);
      }
    }

    function calcPaceDec(durationMs, distKm) {
      if (!distKm || distKm <= 0 || !durationMs) return null;
      const totalMins = durationMs / 60000;
      const pace = totalMins / distKm;
      return (pace > 30 || pace < 2) ? null : pace;
    }

    function calcPaceString(durationMs, distKm) {
      const paceDec = calcPaceDec(durationMs, distKm);
      if (!paceDec) return 'N/A';
      const mins = Math.floor(paceDec);
      let secs = Math.round((paceDec - mins) * 60);
      let finalMins = mins;
      if (secs === 60) {
        secs = 0;
        finalMins += 1;
      }
      const secsStr = secs < 10 ? '0' + secs : secs;
      return \`\${finalMins}:\${secsStr} /km\`;
    }

    function formatPaceDecToString(paceDec) {
      if (!paceDec) return 'N/A';
      const mins = Math.floor(paceDec);
      let secs = Math.round((paceDec - mins) * 60);
      let finalMins = mins;
      if (secs === 60) {
        secs = 0;
        finalMins += 1;
      }
      const secsStr = secs < 10 ? '0' + secs : secs;
      return \`\${finalMins}:\${secsStr} /km\`;
    }

    function extractCalories(r) {
      if (r.calories) return Math.round(Number(r.calories));
      const rawScore = r.raw_json && r.raw_json.score ? r.raw_json.score : null;
      if (rawScore && rawScore.kilojoule) return Math.round(Number(rawScore.kilojoule) / 4.184);
      if (rawScore && rawScore.kilojoules) return Math.round(Number(rawScore.kilojoules) / 4.184);
      if (r.kilojoules) return Math.round(Number(r.kilojoules) / 4.184);
      return null;
    }

    async function loadRuns() {
      const tbody = document.getElementById('runsTableBody');
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-dim)">Loading...</td></tr>';

      const params = new URLSearchParams();
      if (currentStartDate) params.append('startDate', currentStartDate);
      if (currentEndDate) params.append('endDate', currentEndDate);

      try {
        const res = await fetch('/api/runs?' + params.toString());
        const data = await res.json();
        const runs = data.runs || [];

        // Calculate All-Time PRs & Monthly Goal from full run dataset
        calculatePRsAndGoals(runs);

        // Update KPI Cards for selected period
        let totalDistKm = 0;
        let totalDurationMs = 0;
        let totalPaceDistKm = 0;
        let totalPaceDurationMs = 0;
        let totalCaloriesKcal = 0;
        let totalStrain = 0;
        let strainCount = 0;
        let totalAvgHr = 0;
        let hrCount = 0;
        let maxHrReached = 0;

        runs.forEach(r => {
          let distKm = 0;
          if (r.distance_km) distKm = Number(r.distance_km);
          else if (r.distance_meters) distKm = Number(r.distance_meters) / 1000;

          totalDistKm += distKm;
          if (r.duration_ms) totalDurationMs += Number(r.duration_ms);

          if (distKm > 0.1 && r.duration_ms) {
            totalPaceDistKm += distKm;
            totalPaceDurationMs += Number(r.duration_ms);
          }

          const calVal = extractCalories(r);
          if (calVal) totalCaloriesKcal += calVal;

          if (r.strain) { totalStrain += Number(r.strain); strainCount++; }
          if (r.average_heart_rate) { totalAvgHr += Number(r.average_heart_rate); hrCount++; }
          if (r.max_heart_rate && Number(r.max_heart_rate) > maxHrReached) {
            maxHrReached = Number(r.max_heart_rate);
          }
        });

        document.getElementById('kpiRunsCount').innerText = runs.length;
        document.getElementById('kpiDistance').innerText = totalDistKm > 0 ? totalDistKm.toFixed(2) + ' km' : '0 km';
        document.getElementById('kpiAvgPace').innerText = calcPaceString(totalPaceDurationMs, totalPaceDistKm);
        document.getElementById('kpiCalories').innerText = totalCaloriesKcal > 0 ? totalCaloriesKcal.toLocaleString() + ' kcal' : 'N/A';

        const totalMins = Math.round(totalDurationMs / 60000);
        const hours = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        document.getElementById('kpiDuration').innerText = hours > 0 ? \`\${hours}h \${mins}m\` : \`\${mins}m\`;

        document.getElementById('kpiAvgStrain').innerText = strainCount > 0 ? (totalStrain / strainCount).toFixed(1) : 'N/A';
        
        const avgHrVal = hrCount > 0 ? Math.round(totalAvgHr / hrCount) : null;
        document.getElementById('kpiAvgHr').innerText = avgHrVal ? \`\${avgHrVal} / \${maxHrReached} bpm\` : 'N/A';

        // Render Automated Insights
        renderInsights(runs, totalDistKm, totalPaceDurationMs, totalPaceDistKm, strainCount > 0 ? (totalStrain / strainCount) : 0, avgHrVal);

        // Render Table Rows
        if (runs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-dim)">No running activities found for the selected date period.</td></tr>';
          renderCharts([]);
          return;
        }

        tbody.innerHTML = runs.map(r => {
          const dateStr = new Date(r.start_time).toLocaleString([], {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
          const durationMin = Math.round(r.duration_ms / 60000);
          
          let distKmNum = 0;
          let distKmStr = 'N/A';
          if (r.distance_km) {
            distKmNum = Number(r.distance_km);
            distKmStr = distKmNum.toFixed(2) + ' km';
          } else if (r.distance_meters) {
            distKmNum = Number(r.distance_meters) / 1000;
            distKmStr = distKmNum.toFixed(2) + ' km';
          }

          const paceStr = calcPaceString(r.duration_ms, distKmNum);
          const calVal = extractCalories(r);
          const calStr = calVal ? calVal + ' kcal' : 'N/A';

          return \`
            <tr>
              <td><strong>\${dateStr}</strong></td>
              <td>\${r.sport_name}</td>
              <td><span class="badge badge-dist">\${distKmStr}</span></td>
              <td><span class="badge">\${paceStr}</span></td>
              <td>\${durationMin} mins</td>
              <td><span class="badge">\${r.strain ? Number(r.strain).toFixed(1) : 'N/A'}</span></td>
              <td><span class="badge">\${r.average_heart_rate || 'N/A'} / \${r.max_heart_rate || 'N/A'} bpm</span></td>
              <td><span class="badge">\${calStr}</span></td>
            </tr>
          \`;
        }).join('');

        renderCharts(runs);

      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: #ef4444">Error loading data: \${err.message}</td></tr>\`;
      }
    }

    function calculatePRsAndGoals(runs) {
      if (!runs || runs.length === 0) return;

      // 1. Personal Records (PRs)
      let longestRun = 0, longestRunDate = '';
      let fastestPaceDec = 999, fastestPaceStr = 'N/A', fastestPaceDate = '';
      let maxStrain = 0, maxStrainDate = '';
      let maxCalories = 0, maxCalDate = '';

      // Monthly Goal (Current Month)
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      let thisMonthKm = 0;

      runs.forEach(r => {
        const d = new Date(r.start_time);
        const dStr = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();

        let distKm = 0;
        if (r.distance_km) distKm = Number(r.distance_km);
        else if (r.distance_meters) distKm = Number(r.distance_meters) / 1000;

        // Longest Run
        if (distKm > longestRun) {
          longestRun = distKm;
          longestRunDate = dStr;
        }

        // Fastest Pace (for runs > 0.5 km)
        if (distKm > 0.5 && r.duration_ms) {
          const paceDec = calcPaceDec(r.duration_ms, distKm);
          if (paceDec && paceDec < fastestPaceDec) {
            fastestPaceDec = paceDec;
            fastestPaceStr = formatPaceDecToString(paceDec);
            fastestPaceDate = dStr;
          }
        }

        // Highest Strain
        if (r.strain && Number(r.strain) > maxStrain) {
          maxStrain = Number(r.strain);
          maxStrainDate = dStr;
        }

        // Max Calories
        const cal = extractCalories(r);
        if (cal && cal > maxCalories) {
          maxCalories = cal;
          maxCalDate = dStr;
        }

        // Monthly Goal Accumulation
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          thisMonthKm += distKm;
        }
      });

      document.getElementById('prLongestRun').innerText = longestRun > 0 ? longestRun.toFixed(2) + ' km' : '-';
      document.getElementById('prLongestDate').innerText = longestRunDate || 'All Time';

      document.getElementById('prFastestPace').innerText = fastestPaceStr;
      document.getElementById('prFastestDate').innerText = fastestPaceDate || 'All Time';

      document.getElementById('prHighestStrain').innerText = maxStrain > 0 ? maxStrain.toFixed(1) : '-';
      document.getElementById('prStrainDate').innerText = maxStrainDate || 'WHOOP 0-21';

      document.getElementById('prMaxCalories').innerText = maxCalories > 0 ? maxCalories.toLocaleString() + ' kcal' : '-';
      document.getElementById('prCaloriesDate').innerText = maxCalDate || 'Single Session';

      // 2. Monthly Target Goal Progress (Default: 100 km)
      const targetKm = 100;
      const percent = Math.min(100, Math.round((thisMonthKm / targetKm) * 100));
      const remainingKm = Math.max(0, targetKm - thisMonthKm);

      document.getElementById('goalPercentage').innerText = percent + '% Completed';
      document.getElementById('goalProgressBar').style.width = percent + '%';
      document.getElementById('goalProgressSubtext').innerText = thisMonthKm.toFixed(2) + ' km / ' + targetKm.toFixed(2) + ' km completed';
      document.getElementById('goalRemainingSubtext').innerText = remainingKm > 0 ? remainingKm.toFixed(2) + ' km remaining this month' : 'Goal achieved!';
    }

    function renderInsights(runs, totalDistKm, totalPaceDurationMs, totalPaceDistKm, avgStrainVal, avgHrVal) {
      const el = document.getElementById('insightsContent');
      if (!runs || runs.length === 0) {
        el.innerText = 'No running data available for the selected period.';
        return;
      }

      const avgPaceStr = calcPaceString(totalPaceDurationMs, totalPaceDistKm);
      const sessionCount = runs.length;

      let trendMsg = \`Over this period, you logged \${sessionCount} running sessions covering a total of \${totalDistKm.toFixed(2)} km at an average pace of \${avgPaceStr}.\`;

      if (avgStrainVal > 0) {
        trendMsg += \` Your workouts generated an average WHOOP strain of \${avgStrainVal.toFixed(1)}/21\`;
      }
      if (avgHrVal) {
        trendMsg += \` with a steady average heart rate of \${avgHrVal} BPM.\`;
      } else {
        trendMsg += \`.\`;
      }

      if (sessionCount >= 5) {
        trendMsg += \` Strong training consistency! You are building solid aerobic endurance.\`;
      }

      el.innerText = trendMsg;
    }

    function renderCharts(runs) {
      const chronoRuns = [...runs].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      const labels = chronoRuns.map(r => {
        const d = new Date(r.start_time);
        return (d.getMonth() + 1) + '/' + d.getDate();
      });

      const distances = chronoRuns.map(r => {
        if (r.distance_km) return Number(r.distance_km);
        if (r.distance_meters) return Number(r.distance_meters) / 1000;
        return 0;
      });

      const paces = chronoRuns.map(r => {
        let dist = r.distance_km ? Number(r.distance_km) : (r.distance_meters ? Number(r.distance_meters)/1000 : 0);
        return calcPaceDec(r.duration_ms, dist);
      });

      const strains = chronoRuns.map(r => r.strain ? Number(r.strain) : null);
      const avgHrs = chronoRuns.map(r => r.average_heart_rate ? Number(r.average_heart_rate) : null);

      const zoomPluginConfig = {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x',
        },
        pan: { enabled: true, mode: 'x' }
      };

      // --- Chart 1: Distance & Pace Progression ---
      if (chartInstanceDistancePace) chartInstanceDistancePace.destroy();
      const ctx1 = document.getElementById('chartDistancePace').getContext('2d');
      chartInstanceDistancePace = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Distance (km)',
              data: distances,
              backgroundColor: 'rgba(0, 198, 255, 0.45)',
              borderColor: '#00c6ff',
              borderWidth: 2,
              borderRadius: 6,
              yAxisID: 'yDist',
            },
            {
              label: 'Pace (min/km)',
              data: paces,
              type: 'line',
              borderColor: '#38bdf8',
              backgroundColor: '#38bdf8',
              borderWidth: 3,
              tension: 0.3,
              pointRadius: 4,
              yAxisID: 'yPace',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            zoom: zoomPluginConfig,
            tooltip: {
              callbacks: {
                label: function(context) {
                  if (context.dataset.yAxisID === 'yPace') {
                    return 'Pace: ' + formatPaceDecToString(context.raw);
                  }
                  return 'Distance: ' + Number(context.raw).toFixed(2) + ' km';
                }
              }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' } },
            yDist: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'Distance (km)', color: '#00c6ff' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            yPace: {
              type: 'linear',
              position: 'right',
              reverse: true,
              title: { display: true, text: 'Pace (min/km - Faster)', color: '#38bdf8' },
              grid: { drawOnChartArea: false },
              ticks: {
                callback: function(val) { return formatPaceDecToString(val); }
              }
            }
          }
        }
      });

      // --- Chart 2: Heart Rate Zone Breakdown ---
      let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;
      runs.forEach(r => {
        const zd = (r.raw_json && r.raw_json.score && r.raw_json.score.zone_durations) || {};
        z1 += Math.round((zd.zone_one_milli || r.zone_one_ms || 0) / 60000);
        z2 += Math.round((zd.zone_two_milli || r.zone_two_ms || 0) / 60000);
        z3 += Math.round((zd.zone_three_milli || r.zone_three_ms || 0) / 60000);
        z4 += Math.round((zd.zone_four_milli || r.zone_four_ms || 0) / 60000);
        z5 += Math.round((zd.zone_five_milli || r.zone_five_ms || 0) / 60000);
      });

      if (chartInstanceHrZones) chartInstanceHrZones.destroy();
      const ctx2 = document.getElementById('chartHrZones').getContext('2d');
      chartInstanceHrZones = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: ['Zone 1 (Recovery)', 'Zone 2 (Aerobic Base)', 'Zone 3 (Tempo)', 'Zone 4 (Threshold)', 'Zone 5 (Anaerobic Peak)'],
          datasets: [{
            data: [z1, z2, z3, z4, z5],
            backgroundColor: ['#64748b', '#0284c7', '#38bdf8', '#00c6ff', '#0072ff'],
            borderWidth: 0,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 14, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: function(context) { return ' ' + context.label + ': ' + context.raw + ' mins'; }
              }
            }
          }
        }
      });

      // --- Chart 3: Strain vs Heart Rate Efficiency ---
      if (chartInstanceStrainHr) chartInstanceStrainHr.destroy();
      const ctx3 = document.getElementById('chartStrainHr').getContext('2d');
      chartInstanceStrainHr = new Chart(ctx3, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'WHOOP Strain (0-21)',
              data: strains,
              borderColor: '#00c6ff',
              backgroundColor: 'rgba(0, 198, 255, 0.1)',
              borderWidth: 3,
              tension: 0.3,
              fill: true,
              yAxisID: 'yStrain'
            },
            {
              label: 'Avg Heart Rate (BPM)',
              data: avgHrs,
              borderColor: '#38bdf8',
              borderWidth: 2.5,
              tension: 0.3,
              pointRadius: 4,
              yAxisID: 'yHr'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { zoom: zoomPluginConfig },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' } },
            yStrain: {
              type: 'linear',
              position: 'left',
              min: 0,
              max: 21,
              title: { display: true, text: 'Strain (0-21)', color: '#00c6ff' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            yHr: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: 'Avg Heart Rate (BPM)', color: '#38bdf8' },
              grid: { drawOnChartArea: false }
            }
          }
        }
      });

      // --- Chart 4: Weekly Mileage Progression ---
      const weeklyMap = {};
      chronoRuns.forEach(r => {
        const d = new Date(r.start_time);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const weekKey = (monday.getMonth() + 1) + '/' + monday.getDate();

        let dist = r.distance_km ? Number(r.distance_km) : (r.distance_meters ? Number(r.distance_meters)/1000 : 0);
        weeklyMap[weekKey] = (weeklyMap[weekKey] || 0) + dist;
      });

      const weekLabels = Object.keys(weeklyMap);
      const weekDistances = Object.values(weeklyMap);

      if (chartInstanceWeeklyMileage) chartInstanceWeeklyMileage.destroy();
      const ctx4 = document.getElementById('chartWeeklyMileage').getContext('2d');
      chartInstanceWeeklyMileage = new Chart(ctx4, {
        type: 'bar',
        data: {
          labels: weekLabels.map(l => 'Wk of ' + l),
          datasets: [{
            label: 'Total Distance (km)',
            data: weekDistances,
            backgroundColor: 'rgba(56, 189, 248, 0.5)',
            borderColor: '#38bdf8',
            borderWidth: 2,
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            zoom: zoomPluginConfig,
            tooltip: {
              callbacks: {
                label: function(context) { return ' Total Distance: ' + Number(context.raw).toFixed(2) + ' km'; }
              }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' } },
            y: {
              title: { display: true, text: 'Weekly Distance (km)', color: '#38bdf8' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          }
        }
      });
    }

    // --- Modal Zoom Logic ---
    function openZoomModal(chartId, title) {
      let sourceChart = null;
      if (chartId === 'chartDistancePace') sourceChart = chartInstanceDistancePace;
      else if (chartId === 'chartHrZones') sourceChart = chartInstanceHrZones;
      else if (chartId === 'chartStrainHr') sourceChart = chartInstanceStrainHr;
      else if (chartId === 'chartWeeklyMileage') sourceChart = chartInstanceWeeklyMileage;

      if (!sourceChart) return;

      document.getElementById('modalChartTitle').innerText = title;
      const modal = document.getElementById('zoomModal');
      modal.classList.add('active');

      if (modalChartInstance) modalChartInstance.destroy();

      const modalCtx = document.getElementById('modalChartCanvas').getContext('2d');
      modalChartInstance = new Chart(modalCtx, {
        type: sourceChart.config.type,
        data: JSON.parse(JSON.stringify(sourceChart.config.data)),
        options: {
          ...sourceChart.config.options,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            ...sourceChart.config.options.plugins,
            zoom: {
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'xy'
              },
              pan: { enabled: true, mode: 'xy' }
            }
          }
        }
      });
    }

    function zoomInModalChart() {
      if (modalChartInstance && modalChartInstance.zoom) {
        modalChartInstance.zoom(1.2);
      }
    }

    function zoomOutModalChart() {
      if (modalChartInstance && modalChartInstance.zoom) {
        modalChartInstance.zoom(0.8);
      }
    }

    function resetModalChartZoom() {
      if (modalChartInstance && modalChartInstance.resetZoom) {
        modalChartInstance.resetZoom();
      }
    }

    function closeZoomModal() {
      document.getElementById('zoomModal').classList.remove('active');
      if (modalChartInstance) {
        modalChartInstance.destroy();
        modalChartInstance = null;
      }
    }

    function selectPreset(type, btnEl) {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      document.getElementById('endDate').value = todayStr;

      if (type === '7d') {
        const d = new Date();
        d.setDate(now.getDate() - 7);
        currentStartDate = d.toISOString().split('T')[0];
        currentEndDate = todayStr;
        document.getElementById('startDate').value = currentStartDate;
        document.getElementById('periodLabel').innerText = '(Last 7 Days)';
      } else if (type === '30d') {
        const d = new Date();
        d.setDate(now.getDate() - 30);
        currentStartDate = d.toISOString().split('T')[0];
        currentEndDate = todayStr;
        document.getElementById('startDate').value = currentStartDate;
        document.getElementById('periodLabel').innerText = '(Last 30 Days)';
      } else if (type === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        currentStartDate = d.toISOString().split('T')[0];
        currentEndDate = todayStr;
        document.getElementById('startDate').value = currentStartDate;
        document.getElementById('periodLabel').innerText = '(This Month)';
      } else if (type === 'all') {
        currentStartDate = null;
        currentEndDate = null;
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        document.getElementById('periodLabel').innerText = '(All Time)';
      }

      loadRuns();
    }

    function customDateChanged() {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      currentStartDate = document.getElementById('startDate').value || null;
      currentEndDate = document.getElementById('endDate').value || null;
      document.getElementById('periodLabel').innerText = currentStartDate || currentEndDate ? '(Custom Period)' : '(All Time)';
      loadRuns();
    }

    async function triggerSync() {
      const btn = document.getElementById('syncBtn');
      btn.innerText = 'Syncing...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        const data = await res.json();
        alert(data.message || (data.success ? 'Sync completed successfully!' : 'Sync failed'));
        loadRuns();
      } catch (err) {
        alert('Error triggering sync: ' + err.message);
      } finally {
        btn.innerText = 'Sync Data';
        btn.disabled = false;
      }
    }

    // Initial load
    loadRuns();
  </script>
</body>
</html>`;

  res.send(html);
});

// OAuth Redirect endpoint
app.get('/auth/login', (req: Request, res: Response) => {
  try {
    const redirectUri = getRedirectUri(req);
    const url = getAuthorizationUrl('whoop_state', redirectUri);
    res.redirect(url);
  } catch (error: any) {
    res.status(500).send(`Authentication error: ${error.message}`);
  }
});

// OAuth Callback handler
app.get('/auth/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send('Authorization code missing from callback.');
  }

  try {
    const redirectUri = getRedirectUri(req);
    await exchangeCodeForToken(code, redirectUri);
    // Auto sync after authentication
    await syncWhoopWorkouts();
    res.redirect('/?authenticated=true');
  } catch (error: any) {
    console.error('Error during token exchange:', error.response?.data || error.message);
    res.status(500).send(`Failed to exchange code for token: ${error.message}`);
  }
});

// Sync API Endpoint
app.post('/api/sync', async (req: Request, res: Response) => {
  const result = await syncWhoopWorkouts();
  res.json(result);
});

// Filterable JSON endpoint for stored runs
app.get('/api/runs', async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const useSupabase = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  if (useSupabase && supabase) {
    let query = supabase
      .from('whoop_workouts')
      .select('*')
      .eq('is_running', true)
      .order('start_time', { ascending: false });

    if (startDate) {
      query = query.gte('start_time', new Date(startDate as string).toISOString());
    }
    if (endDate) {
      const endD = new Date(endDate as string);
      endD.setHours(23, 59, 59, 999);
      query = query.lte('start_time', endD.toISOString());
    }

    const { data, error } = await query;
    return res.json({ count: data?.length || 0, runs: data || [], error: error?.message });
  }

  try {
    const db = await getDb();
    let sql = 'SELECT * FROM whoop_workouts WHERE is_running = 1';
    const params: any[] = [];

    if (startDate) {
      sql += ' AND start_time >= ?';
      params.push(new Date(startDate as string).toISOString());
    }
    if (endDate) {
      const endD = new Date(endDate as string);
      endD.setHours(23, 59, 59, 999);
      sql += ' AND start_time <= ?';
      params.push(endD.toISOString());
    }

    sql += ' ORDER BY start_time DESC';
    const runs = await db.all(sql, params);
    res.json({ count: runs.length, runs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// JSON endpoint for all stored workouts
app.get('/api/workouts', async (req: Request, res: Response) => {
  const useSupabase = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from('whoop_workouts')
      .select('*')
      .order('start_time', { ascending: false });
    return res.json({ count: data?.length || 0, workouts: data || [], error: error?.message });
  }

  try {
    const db = await getDb();
    const workouts = await db.all('SELECT * FROM whoop_workouts ORDER BY start_time DESC');
    res.json({ count: workouts.length, workouts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// System Status API
app.get('/api/status', async (req: Request, res: Response) => {
  const useSupabase = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  let token: any = null;
  let syncLog: any = null;

  if (useSupabase && supabase) {
    const tRes = await supabase.from('whoop_tokens').select('*').maybeSingle();
    token = tRes.data;
    const sRes = await supabase.from('sync_logs').select('*').order('created_at', { ascending: false }).limit(1);
    syncLog = sRes.data?.[0];
  } else {
    try {
      const db = await getDb();
      token = await db.get('SELECT * FROM whoop_tokens LIMIT 1');
      syncLog = await db.get('SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 1');
    } catch (err) {}
  }

  res.json({
    storage: useSupabase ? 'supabase' : 'sqlite',
    authenticated: !!token,
    tokenExpiresAt: token ? new Date(Number(token.expires_at)).toISOString() : null,
    lastSync: syncLog || null,
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Run Tracker Hub running on http://localhost:${PORT}`);
  });
}

export default app;
