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
      --bg-main: #f7f7fa;
      --nav-bg: #ffffff;
      --nav-border: #e6e6e8;
      --card-bg: #ffffff;
      --card-border: #e2e8f0;
      --theme-blue: #0080ff;
      --theme-blue-hover: #0066cc;
      --theme-sky: #00a3ff;
      --theme-orange: #fc4c02;
      --text-dark: #1e293b;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
      --subtle-bg: #f8fafc;
      --badge-bg: #f0f7ff;
      --badge-border: #cce7ff;
    }

    body.dark-mode {
      --bg-main: #070a12;
      --nav-bg: #0f172a;
      --nav-border: rgba(255, 255, 255, 0.1);
      --card-bg: rgba(15, 23, 42, 0.85);
      --card-border: rgba(255, 255, 255, 0.1);
      --theme-blue: #00c6ff;
      --theme-blue-hover: #0099cc;
      --theme-sky: #38bdf8;
      --text-dark: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --subtle-bg: rgba(255, 255, 255, 0.04);
      --badge-bg: rgba(0, 198, 255, 0.12);
      --badge-border: rgba(0, 198, 255, 0.25);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-main);
      color: var(--text-dark);
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      transition: background-color 0.25s ease, color 0.25s ease;
    }

    /* Strava-Style Top Navigation Bar */
    .top-navbar {
      background-color: var(--nav-bg);
      border-bottom: 1px solid var(--nav-border);
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
      transition: background-color 0.25s ease, border-color 0.25s ease;
    }

    .nav-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1.5rem;
      height: 62px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .nav-left {
      display: flex;
      align-items: center;
      gap: 2.25rem;
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }

    .brand-icon {
      background: linear-gradient(135deg, var(--theme-blue), #0052cc);
      color: white;
      font-weight: 800;
      font-size: 1.25rem;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-name {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-dark);
    }

    /* Strava Top Tabs Bar */
    .top-tabs {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      height: 62px;
    }

    .top-tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.92rem;
      font-weight: 600;
      height: 62px;
      padding: 0 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 3px solid transparent;
      transition: all 0.2s ease;
    }

    .top-tab-btn:hover {
      color: var(--theme-blue);
    }

    .top-tab-btn.active {
      color: var(--theme-blue);
      font-weight: 700;
      border-bottom-color: var(--theme-blue);
    }

    /* Strava Top Right Action Controls */
    .nav-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-muted);
      background: var(--subtle-bg);
      padding: 5px 12px;
      border-radius: 20px;
      border: 1px solid var(--card-border);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-dot.active { background-color: #10b981; }
    .status-dot.inactive { background-color: #ef4444; }

    /* Strava Standard Button Style */
    .strava-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.2s ease, transform 0.1s ease;
      border: none;
    }

    .strava-btn-primary {
      background-color: var(--theme-blue);
      color: #ffffff;
    }
    .strava-btn-primary:hover {
      background-color: var(--theme-blue-hover);
    }

    .strava-btn-secondary {
      background-color: var(--subtle-bg);
      color: var(--text-dark);
      border: 1px solid var(--card-border);
    }
    .strava-btn-secondary:hover {
      border-color: var(--theme-blue);
    }

    /* Main Content Wrapper */
    .main-container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Date Period Filter Bar Component */
    .filter-bar {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }

    .filter-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .preset-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .preset-btn {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .preset-btn:hover, .preset-btn.active {
      background: var(--theme-blue);
      color: white;
      border-color: var(--theme-blue);
    }

    .date-inputs {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .date-inputs input[type="date"] {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text-dark);
      padding: 6px 10px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 600;
    }

    /* Settings Section Cards */
    .settings-grid {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      max-width: 800px;
    }

    .settings-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }

    .settings-title {
      font-size: 1.1rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-dark);
      margin-bottom: 0.35rem;
    }

    .settings-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 1.1rem;
    }

    .settings-form-group {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .settings-input {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-dark);
      padding: 9px 14px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 700;
      width: 140px;
    }

    .theme-options-group {
      display: flex;
      gap: 10px;
    }

    .theme-option-btn {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .theme-option-btn.active {
      background: var(--theme-blue);
      color: white;
      border-color: var(--theme-blue);
    }

    /* Automated Insights Card */
    .insights-card {
      background: var(--badge-bg);
      border: 1px solid var(--badge-border);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    }

    .insights-header {
      font-size: 0.85rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--theme-blue);
      margin-bottom: 0.4rem;
    }

    .insights-text {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--text-dark);
      line-height: 1.6;
    }

    /* Monthly Goal Progress Card */
    .goal-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }

    .goal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .goal-title {
      font-size: 0.85rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }

    .goal-stats {
      font-size: 0.9rem;
      font-weight: 800;
      color: var(--theme-blue);
    }

    .progress-bar-bg {
      background: var(--subtle-bg);
      height: 10px;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 0.6rem;
    }

    .progress-bar-fill {
      background: var(--theme-blue);
      height: 100%;
      border-radius: 6px;
      transition: width 0.4s ease;
    }

    .goal-footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.78rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    /* Personal Records (PRs) Section */
    .prs-section {
      margin-bottom: 1.5rem;
    }

    .prs-title {
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-dark);
      margin-bottom: 0.85rem;
    }

    .prs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 1rem;
    }

    .pr-card {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 1.1rem;
    }

    .pr-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
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
      color: var(--text-dim);
      margin-top: 0.3rem;
    }

    /* Metric Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.2rem 1.1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
      transition: transform 0.15s ease, border-color 0.15s ease;
    }

    .card:hover {
      border-color: var(--theme-blue);
      transform: translateY(-1px);
    }

    .card-title {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      margin-bottom: 0.35rem;
    }

    .card-value {
      font-size: 1.85rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      color: var(--theme-blue) !important;
    }

    .card-subtitle {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--text-dim);
      margin-top: 0.35rem;
    }

    /* Charts Grid Section */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 600px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
    }

    .chart-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.4rem;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
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
      color: var(--text-dark);
    }

    .chart-zoom-btn {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-dark);
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .chart-zoom-btn:hover {
      background: var(--theme-blue);
      color: white;
      border-color: var(--theme-blue);
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
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      padding: 1.5rem;
    }

    .modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .modal-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      width: 94vw;
      max-width: 1100px;
      height: 85vh;
      max-height: 750px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
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
      color: var(--text-dark);
    }

    .modal-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .modal-btn {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-dark);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .modal-btn:hover {
      border-color: var(--theme-blue);
    }

    .modal-btn-close {
      background: #fee2e2;
      border: 1px solid #fca5a5;
      color: #dc2626;
    }

    .modal-btn-close:hover {
      background: #dc2626;
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
      margin-bottom: 1rem;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-dark);
    }

    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-bottom: 3rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }

    table {
      width: 100%;
      min-width: 800px;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: var(--subtle-bg);
      padding: 0.9rem 1.25rem;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 800;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
    }

    td {
      padding: 0.95rem 1.25rem;
      border-bottom: 1px solid var(--card-border);
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-dark);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: var(--subtle-bg);
    }

    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.78rem;
      font-weight: 700;
      background: var(--badge-bg);
      color: var(--theme-blue);
      border: 1px solid var(--badge-border);
    }

    .badge-dist {
      background: var(--badge-bg);
      color: var(--theme-blue);
      border: 1px solid var(--badge-border);
    }
  </style>
</head>
<body>
  <!-- Strava-Style Top Header Navigation -->
  <nav class="top-navbar">
    <div class="nav-container">
      <div class="nav-left">
        <a href="/" class="brand-logo">
          <div class="brand-icon">R</div>
          <div class="brand-name">Run Tracker</div>
        </a>

        <!-- Top Navigation Tabs Bar -->
        <div class="top-tabs">
          <button class="top-tab-btn active" onclick="switchTab('overviewTab', this)">Overview</button>
          <button class="top-tab-btn" onclick="switchTab('analyticsTab', this)">Analytics</button>
          <button class="top-tab-btn" onclick="switchTab('historyTab', this)">History</button>
          <button class="top-tab-btn" onclick="switchTab('settingsTab', this)">Settings</button>
        </div>
      </div>

      <!-- Top Right Actions Position (Status Badge & Sync Data) -->
      <div class="nav-right">
        <div class="status-badge">
          <div class="status-dot ${hasTokenRecord ? 'active' : 'inactive'}"></div>
          ${hasTokenRecord ? 'Connected' : 'Not Connected'}
        </div>
        <button onclick="triggerSync()" class="strava-btn strava-btn-primary" id="syncBtn">
          Sync Data
        </button>
      </div>
    </div>
  </nav>

  <!-- Main Content Wrapper -->
  <div class="main-container">
    <!-- TAB 1: OVERVIEW & RECORDS -->
    <div class="tab-content active" id="overviewTab">
      <!-- 1. Automated Performance Insights Banner -->
      <div class="insights-card">
        <div class="insights-header">Performance Trend Insights (Latest 10 Runs)</div>
        <div class="insights-text" id="insightsContent">Analyzing your latest 10 running activities...</div>
      </div>

      <!-- 2. Current Calendar Month Target Goal -->
      <div class="goal-card">
        <div class="goal-header">
          <div class="goal-title" id="goalTitleText">Current Month Target Goal (100 km)</div>
          <div class="goal-stats" id="goalPercentage">0% Completed</div>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" id="goalProgressBar" style="width: 0%"></div>
        </div>
        <div class="goal-footer">
          <span id="goalProgressSubtext">0.00 km / 100.00 km completed</span>
          <span id="goalRemainingSubtext">100.00 km remaining</span>
        </div>
      </div>

      <!-- 3. Personal Records (PRs) Section -->
      <div class="prs-section">
        <div class="prs-title">Personal Records</div>
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

      <!-- 4. Synced Period Filter Bar (Positioned Below PRs & Above Highlights) -->
      <div class="filter-bar">
        <div class="filter-title">
          Select Period:
        </div>
        <div class="preset-group">
          <button class="preset-btn preset-7d" onclick="selectPreset('7d')">7 Days</button>
          <button class="preset-btn preset-30d" onclick="selectPreset('30d')">30 Days</button>
          <button class="preset-btn preset-month" onclick="selectPreset('month')">This Month</button>
          <button class="preset-btn preset-all active" onclick="selectPreset('all')">All Time</button>
        </div>
        <div class="date-inputs">
          <input type="date" class="startDateInput" onchange="customDateChanged(this)" />
          <span style="font-size:0.8rem; color:var(--text-muted)">to</span>
          <input type="date" class="endDateInput" onchange="customDateChanged(this)" />
        </div>
      </div>

      <!-- 5. Summary Metrics Grid (Highlights) -->
      <div class="section-header" style="margin-bottom: 0.8rem;">
        <div class="section-title" style="font-size: 1.05rem;">Highlights & Summary</div>
      </div>
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
      <!-- Synced Period Filter Bar (Top of Analytics Tab) -->
      <div class="filter-bar">
        <div class="filter-title">
          Select Period:
        </div>
        <div class="preset-group">
          <button class="preset-btn preset-7d" onclick="selectPreset('7d')">7 Days</button>
          <button class="preset-btn preset-30d" onclick="selectPreset('30d')">30 Days</button>
          <button class="preset-btn preset-month" onclick="selectPreset('month')">This Month</button>
          <button class="preset-btn preset-all active" onclick="selectPreset('all')">All Time</button>
        </div>
        <div class="date-inputs">
          <input type="date" class="startDateInput" onchange="customDateChanged(this)" />
          <span style="font-size:0.8rem; color:var(--text-muted)">to</span>
          <input type="date" class="endDateInput" onchange="customDateChanged(this)" />
        </div>
      </div>

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

        <!-- Chart 2: Heart Rate Zone Breakdown -->
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
      <!-- Synced Period Filter Bar (Top of History Tab) -->
      <div class="filter-bar">
        <div class="filter-title">
          Select Period:
        </div>
        <div class="preset-group">
          <button class="preset-btn preset-7d" onclick="selectPreset('7d')">7 Days</button>
          <button class="preset-btn preset-30d" onclick="selectPreset('30d')">30 Days</button>
          <button class="preset-btn preset-month" onclick="selectPreset('month')">This Month</button>
          <button class="preset-btn preset-all active" onclick="selectPreset('all')">All Time</button>
        </div>
        <div class="date-inputs">
          <input type="date" class="startDateInput" onchange="customDateChanged(this)" />
          <span style="font-size:0.8rem; color:var(--text-muted)">to</span>
          <input type="date" class="endDateInput" onchange="customDateChanged(this)" />
        </div>
      </div>

      <!-- Running Activities Table -->
      <div class="section-header">
        <div class="section-title">
          Running Performance History <span id="periodLabel" style="font-size:0.85rem; font-weight:500; color:var(--text-muted)">(All Time)</span>
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
            <tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted)">Loading running activities...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 4: SETTINGS -->
    <div class="tab-content" id="settingsTab">
      <div class="section-header" style="margin-bottom: 1.25rem;">
        <div class="section-title">Application Settings</div>
      </div>
      
      <div class="settings-grid">
        <!-- 1. Adjustable Monthly Goal Target Card -->
        <div class="settings-card">
          <div class="settings-title">Monthly Distance Goal Target</div>
          <div class="settings-desc">Set your target running mileage in kilometers for the current calendar month.</div>
          <div class="settings-form-group">
            <input type="number" id="monthlyGoalInput" class="settings-input" min="1" max="1000" step="5" value="100" />
            <span style="font-weight:700; color:var(--text-muted)">km / month</span>
            <button onclick="saveMonthlyGoalSetting()" class="strava-btn strava-btn-primary">Save Goal</button>
          </div>
        </div>

        <!-- 2. Application Theme Settings Card -->
        <div class="settings-card">
          <div class="settings-title">Appearance & Theme</div>
          <div class="settings-desc">Choose between Light and Dark mode interface aesthetics.</div>
          <div class="theme-options-group">
            <button onclick="setThemeMode('light')" class="theme-option-btn" id="themeLightBtn">Light Theme</button>
            <button onclick="setThemeMode('dark')" class="theme-option-btn" id="themeDarkBtn">Dark Theme</button>
          </div>
        </div>

        <!-- 3. Account & Re-authentication Card -->
        <div class="settings-card">
          <div class="settings-title">Account & Integrations</div>
          <div class="settings-desc">Manage your WHOOP API connection and re-authenticate if token expires.</div>
          <div class="settings-form-group">
            <a href="/auth/login" class="strava-btn strava-btn-secondary">
              ${hasTokenRecord ? 'Re-authenticate WHOOP Account' : 'Connect WHOOP Account'}
            </a>
          </div>
        </div>
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
    let activePreset = 'all';
    let allRunsCache = [];
    let monthlyTargetKmSetting = 100;
    let chartInstanceDistancePace = null;
    let chartInstanceHrZones = null;
    let chartInstanceStrainHr = null;
    let chartInstanceWeeklyMileage = null;
    let modalChartInstance = null;

    // Load Settings from Local Storage
    function initSettings() {
      const savedGoal = localStorage.getItem('monthlyTargetKm');
      if (savedGoal && !isNaN(Number(savedGoal))) {
        monthlyTargetKmSetting = Number(savedGoal);
      }
      document.getElementById('monthlyGoalInput').value = monthlyTargetKmSetting;

      const savedTheme = localStorage.getItem('theme');
      setThemeMode(savedTheme === 'dark' ? 'dark' : 'light', false);
    }

    function setThemeMode(mode, triggerRender = true) {
      const lightBtn = document.getElementById('themeLightBtn');
      const darkBtn = document.getElementById('themeDarkBtn');

      if (mode === 'dark') {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        if (lightBtn) lightBtn.classList.remove('active');
        if (darkBtn) darkBtn.classList.add('active');
        Chart.defaults.color = '#94a3b8';
      } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        if (lightBtn) lightBtn.classList.add('active');
        if (darkBtn) darkBtn.classList.remove('active');
        Chart.defaults.color = '#64748b';
      }

      if (triggerRender && allRunsCache.length > 0) {
        renderCharts(allRunsCache);
      }
    }

    function saveMonthlyGoalSetting() {
      const inp = document.getElementById('monthlyGoalInput');
      const val = Number(inp.value);
      if (val && val > 0) {
        monthlyTargetKmSetting = val;
        localStorage.setItem('monthlyTargetKm', val);
        alert('Monthly Target Goal updated to ' + val + ' km!');
        if (allRunsCache.length > 0) {
          calculatePRsAndGoals(allRunsCache);
        }
      }
    }

    initSettings();

    function switchTab(tabId, btnEl) {
      document.querySelectorAll('.top-tab-btn').forEach(b => b.classList.remove('active'));
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

    function syncFilterUI() {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      if (activePreset) {
        document.querySelectorAll('.preset-' + activePreset).forEach(b => b.classList.add('active'));
      }
      document.querySelectorAll('.startDateInput').forEach(inp => inp.value = currentStartDate || '');
      document.querySelectorAll('.endDateInput').forEach(inp => inp.value = currentEndDate || '');
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
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted)">Loading...</td></tr>';

      try {
        // 1. Fetch All Runs (unfiltered) to compute PRs, Current Calendar Month Goal, and Latest 10 Insights
        const allRes = await fetch('/api/runs');
        const allData = await allRes.json();
        allRunsCache = allData.runs || [];

        // Always compute PRs & Monthly Goal based on full dataset
        calculatePRsAndGoals(allRunsCache);
        renderLatest10Insights(allRunsCache);

        // 2. Determine Filtered Runs for History table, Period KPIs, and Charts
        let filteredRuns = allRunsCache;
        if (currentStartDate || currentEndDate) {
          const params = new URLSearchParams();
          if (currentStartDate) params.append('startDate', currentStartDate);
          if (currentEndDate) params.append('endDate', currentEndDate);
          const filteredRes = await fetch('/api/runs?' + params.toString());
          const filteredData = await filteredRes.json();
          filteredRuns = filteredData.runs || [];
        }

        // Update Summary KPI Cards for current selected period
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

        filteredRuns.forEach(r => {
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

        document.getElementById('kpiRunsCount').innerText = filteredRuns.length;
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

        // Render History Table Rows
        if (filteredRuns.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted)">No running activities found for the selected date period.</td></tr>';
          renderCharts([]);
          return;
        }

        tbody.innerHTML = filteredRuns.map(r => {
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

        renderCharts(filteredRuns);

      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: #ef4444">Error loading data: \${err.message}</td></tr>\`;
      }
    }

    function calculatePRsAndGoals(allRuns) {
      if (!allRuns || allRuns.length === 0) return;

      // 1. Personal Records (PRs) from ALL runs
      let longestRun = 0, longestRunDate = '';
      let fastestPaceDec = 999, fastestPaceStr = 'N/A', fastestPaceDate = '';
      let maxStrain = 0, maxStrainDate = '';
      let maxCalories = 0, maxCalDate = '';

      // 2. Current Calendar Month Goal
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed
      const monthName = now.toLocaleString('default', { month: 'long' });
      let thisMonthKm = 0;

      allRuns.forEach(r => {
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

        // Current Calendar Month Accumulation
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

      // Current Calendar Month Target Goal
      const targetKm = monthlyTargetKmSetting || 100;
      const percent = Math.min(100, Math.round((thisMonthKm / targetKm) * 100));
      const remainingKm = Math.max(0, targetKm - thisMonthKm);

      document.getElementById('goalTitleText').innerText = monthName + ' ' + currentYear + ' Target Goal (' + targetKm + ' km)';
      document.getElementById('goalPercentage').innerText = percent + '% Completed';
      document.getElementById('goalProgressBar').style.width = percent + '%';
      document.getElementById('goalProgressSubtext').innerText = thisMonthKm.toFixed(2) + ' km / ' + targetKm.toFixed(2) + ' km completed in ' + monthName;
      document.getElementById('goalRemainingSubtext').innerText = remainingKm > 0 ? remainingKm.toFixed(2) + ' km remaining in ' + monthName : 'Goal achieved for ' + monthName + '!';
    }

    function renderLatest10Insights(allRuns) {
      const el = document.getElementById('insightsContent');
      if (!allRuns || allRuns.length === 0) {
        el.innerText = 'No running data available.';
        return;
      }

      // Sort by start_time descending and take top 10 runs
      const latest10 = [...allRuns]
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        .slice(0, 10);

      let totalDistKm = 0;
      let totalPaceDistKm = 0;
      let totalPaceDurationMs = 0;
      let totalStrain = 0;
      let strainCount = 0;
      let totalAvgHr = 0;
      let hrCount = 0;

      latest10.forEach(r => {
        let distKm = r.distance_km ? Number(r.distance_km) : (r.distance_meters ? Number(r.distance_meters)/1000 : 0);
        totalDistKm += distKm;
        if (distKm > 0.1 && r.duration_ms) {
          totalPaceDistKm += distKm;
          totalPaceDurationMs += Number(r.duration_ms);
        }
        if (r.strain) { totalStrain += Number(r.strain); strainCount++; }
        if (r.average_heart_rate) { totalAvgHr += Number(r.average_heart_rate); hrCount++; }
      });

      const avgPaceStr = calcPaceString(totalPaceDurationMs, totalPaceDistKm);
      const avgStrainVal = strainCount > 0 ? (totalStrain / strainCount) : 0;
      const avgHrVal = hrCount > 0 ? Math.round(totalAvgHr / hrCount) : null;

      let trendMsg = \`Across your latest \${latest10.length} runs, you logged a total of \${totalDistKm.toFixed(2)} km at an average pace of \${avgPaceStr}.\`;

      if (avgStrainVal > 0) {
        trendMsg += \` Your workouts averaged a WHOOP strain of \${avgStrainVal.toFixed(1)}/21\`;
      }
      if (avgHrVal) {
        trendMsg += \` with an average heart rate of \${avgHrVal} BPM.\`;
      } else {
        trendMsg += \`.\`;
      }

      if (latest10.length >= 5) {
        trendMsg += \` Solid execution across recent sessions!\`;
      }

      el.innerText = trendMsg;
    }

    function renderCharts(runs) {
      const isDark = document.body.classList.contains('dark-mode');
      const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

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
              backgroundColor: isDark ? 'rgba(0, 198, 255, 0.45)' : 'rgba(0, 128, 255, 0.45)',
              borderColor: isDark ? '#00c6ff' : '#0080ff',
              borderWidth: 2,
              borderRadius: 4,
              yAxisID: 'yDist',
            },
            {
              label: 'Pace (min/km)',
              data: paces,
              type: 'line',
              borderColor: isDark ? '#38bdf8' : '#00a3ff',
              backgroundColor: isDark ? '#38bdf8' : '#00a3ff',
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
            x: { grid: { color: gridColor } },
            yDist: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'Distance (km)', color: isDark ? '#00c6ff' : '#0080ff' },
              grid: { color: gridColor }
            },
            yPace: {
              type: 'linear',
              position: 'right',
              reverse: true,
              title: { display: true, text: 'Pace (min/km - Faster)', color: isDark ? '#38bdf8' : '#00a3ff' },
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
            backgroundColor: ['#94a3b8', '#38bdf8', '#0080ff', '#0052cc', '#fc4c02'],
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
              borderColor: isDark ? '#00c6ff' : '#0080ff',
              backgroundColor: isDark ? 'rgba(0, 198, 255, 0.1)' : 'rgba(0, 128, 255, 0.08)',
              borderWidth: 3,
              tension: 0.3,
              fill: true,
              yAxisID: 'yStrain'
            },
            {
              label: 'Avg Heart Rate (BPM)',
              data: avgHrs,
              borderColor: isDark ? '#38bdf8' : '#00a3ff',
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
            x: { grid: { color: gridColor } },
            yStrain: {
              type: 'linear',
              position: 'left',
              min: 0,
              max: 21,
              title: { display: true, text: 'Strain (0-21)', color: isDark ? '#00c6ff' : '#0080ff' },
              grid: { color: gridColor }
            },
            yHr: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: 'Avg Heart Rate (BPM)', color: isDark ? '#38bdf8' : '#00a3ff' },
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
            backgroundColor: isDark ? 'rgba(56, 189, 248, 0.45)' : 'rgba(0, 163, 255, 0.45)',
            borderColor: isDark ? '#38bdf8' : '#00a3ff',
            borderWidth: 2,
            borderRadius: 4
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
            x: { grid: { color: gridColor } },
            y: {
              title: { display: true, text: 'Weekly Distance (km)', color: isDark ? '#38bdf8' : '#00a3ff' },
              grid: { color: gridColor }
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

    // Synchronized Preset Selector Across All Tabs
    function selectPreset(type) {
      activePreset = type;
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      if (type === '7d') {
        const d = new Date();
        d.setDate(now.getDate() - 7);
        currentStartDate = d.toISOString().split('T')[0];
        currentEndDate = todayStr;
        document.getElementById('periodLabel').innerText = '(Last 7 Days)';
      } else if (type === '30d') {
        const d = new Date();
        d.setDate(now.getDate() - 30);
        currentStartDate = d.toISOString().split('T')[0];
        currentEndDate = todayStr;
        document.getElementById('periodLabel').innerText = '(Last 30 Days)';
      } else if (type === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        currentStartDate = d.toISOString().split('T')[0];
        currentEndDate = todayStr;
        document.getElementById('periodLabel').innerText = '(This Month)';
      } else if (type === 'all') {
        currentStartDate = null;
        currentEndDate = null;
        document.getElementById('periodLabel').innerText = '(All Time)';
      }

      syncFilterUI();
      loadRuns();
    }

    function customDateChanged(inputEl) {
      activePreset = null;
      const parentBar = inputEl.closest('.filter-bar');
      const startInp = parentBar.querySelector('.startDateInput');
      const endInp = parentBar.querySelector('.endDateInput');

      currentStartDate = startInp.value || null;
      currentEndDate = endInp.value || null;
      document.getElementById('periodLabel').innerText = (currentStartDate || currentEndDate) ? '(Custom Period)' : '(All Time)';

      syncFilterUI();
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
