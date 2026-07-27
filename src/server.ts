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
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/hammerjs@2.0.8"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1"></script>
  <style>
    :root {
      --bg-main: #fafafa;
      --nav-bg: rgba(255, 255, 255, 0.85);
      --nav-border: #edf2f7;
      --card-bg: #ffffff;
      --card-border: #f1f5f9;
      --theme-blue: #0284c7;
      --theme-blue-hover: #0369a1;
      --theme-sky: #38bdf8;
      --theme-orange: #f97316;
      --text-dark: #0f172a;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
      --subtle-bg: #f8fafc;
      --badge-bg: #f0f9ff;
      --badge-border: #e0f2fe;
      --race-card-bg: #fff7ed;
      --race-card-border: #ffedd5;
    }

    body.dark-mode {
      --bg-main: #090d16;
      --nav-bg: rgba(15, 23, 42, 0.85);
      --nav-border: rgba(255, 255, 255, 0.06);
      --card-bg: #0f172a;
      --card-border: rgba(255, 255, 255, 0.07);
      --theme-blue: #38bdf8;
      --theme-blue-hover: #0284c7;
      --theme-sky: #7dd3fc;
      --text-dark: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --subtle-bg: rgba(255, 255, 255, 0.03);
      --badge-bg: rgba(56, 189, 248, 0.1);
      --badge-border: rgba(56, 189, 248, 0.2);
      --race-card-bg: rgba(249, 115, 22, 0.08);
      --race-card-border: rgba(249, 115, 22, 0.2);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-main);
      color: var(--text-dark);
      min-height: 100vh;
      line-height: 1.5;
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      transition: background-color 0.25s ease, color 0.25s ease;
    }

    /* Minimalist Top Navigation Bar */
    .top-navbar {
      background-color: var(--nav-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--nav-border);
      position: sticky;
      top: 0;
      z-index: 1000;
      transition: background-color 0.25s ease, border-color 0.25s ease;
    }

    .nav-container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 0 1.5rem;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .nav-left {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }

    .brand-icon {
      background: var(--theme-blue);
      color: white;
      font-weight: 700;
      font-size: 1rem;
      width: 30px;
      height: 30px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-name {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text-dark);
    }

    /* Minimal Top Tabs Bar */
    .top-tabs {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      height: 58px;
    }

    .top-tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.88rem;
      font-weight: 600;
      height: 58px;
      padding: 0 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 2px solid transparent;
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

    /* Top Right Action Controls */
    .nav-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--text-muted);
      background: var(--subtle-bg);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid var(--card-border);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .status-dot.active { background-color: #10b981; }
    .status-dot.inactive { background-color: #ef4444; }

    /* Minimal Standard Button Style */
    .strava-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
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
      max-width: 1140px;
      margin: 1.75rem auto;
      padding: 0 1.5rem;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Minimal Upcoming Race Countdown Card */
    .race-card {
      background: var(--race-card-bg);
      border: 1px solid var(--race-card-border);
      border-radius: 14px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.25rem;
    }

    .race-header {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--theme-orange);
      margin-bottom: 0.35rem;
    }

    .race-details-group {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .race-title {
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-dark);
    }

    .race-countdown-clock {
      display: flex;
      gap: 8px;
    }

    .countdown-unit {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 6px 12px;
      border-radius: 8px;
      min-width: 56px;
    }

    .countdown-num {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--theme-orange);
      line-height: 1.1;
    }

    .countdown-lbl {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }

    /* Date Period Filter Bar Component */
    .filter-bar {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 0.85rem 1.1rem;
      margin-bottom: 1.25rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .filter-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .preset-group {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .preset-btn {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
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
      padding: 5px 8px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 600;
    }

    /* Settings Section Cards */
    .settings-grid {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 800px;
    }

    .settings-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.35rem;
    }

    .settings-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-dark);
      margin-bottom: 0.3rem;
    }

    .settings-desc {
      font-size: 0.83rem;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }

    .settings-form-group {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .settings-input {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-dark);
      padding: 8px 12px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .theme-options-group {
      display: flex;
      gap: 10px;
    }

    .theme-option-btn {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 8px 18px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .theme-option-btn.active {
      background: var(--theme-blue);
      color: white;
      border-color: var(--theme-blue);
    }

    /* Minimal Automated Insights Card */
    .insights-card {
      background: var(--badge-bg);
      border: 1px solid var(--badge-border);
      border-radius: 14px;
      padding: 1.15rem 1.35rem;
      margin-bottom: 1.25rem;
    }

    .insights-header {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--theme-blue);
      margin-bottom: 0.35rem;
    }

    .insights-text {
      font-size: 0.92rem;
      font-weight: 500;
      color: var(--text-dark);
      line-height: 1.55;
    }

    /* Minimal Monthly Goal Progress Card */
    .goal-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.15rem 1.35rem;
      margin-bottom: 1.25rem;
    }

    .goal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.65rem;
    }

    .goal-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }

    .goal-stats {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--theme-blue);
    }

    .progress-bar-bg {
      background: var(--subtle-bg);
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.55rem;
    }

    .progress-bar-fill {
      background: var(--theme-blue);
      height: 100%;
      border-radius: 4px;
      transition: width 0.4s ease;
    }

    .goal-footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.76rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    /* Personal Records (PRs) Section */
    .prs-section {
      margin-bottom: 1.25rem;
    }

    .prs-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-dark);
      margin-bottom: 0.75rem;
    }

    .prs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.85rem;
    }

    .pr-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1rem;
    }

    .pr-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
    }

    .pr-value {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--theme-blue);
    }

    .pr-date {
      font-size: 0.7rem;
      color: var(--text-dim);
      margin-top: 0.25rem;
    }

    /* Minimal Metric Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.85rem;
      margin-bottom: 1.75rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.1rem 1rem;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }

    .card:hover {
      border-color: var(--theme-blue);
    }

    .card-title {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      margin-bottom: 0.3rem;
    }

    .card-value {
      font-size: 1.65rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.1;
      color: var(--theme-blue) !important;
    }

    .card-subtitle {
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--text-dim);
      margin-top: 0.3rem;
    }

    /* Charts Grid Section */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.75rem;
    }

    @media (max-width: 600px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
    }

    .chart-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .chart-title {
      font-size: 0.98rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-dark);
    }

    .chart-zoom-btn {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-dark);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
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
      height: 270px;
    }

    /* Zoom Fullscreen Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(6px);
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
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      gap: 10px;
      padding-bottom: 0.85rem;
      border-bottom: 1px solid var(--card-border);
    }

    .modal-title {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-dark);
    }

    .modal-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .modal-btn {
      background: var(--subtle-bg);
      border: 1px solid var(--card-border);
      color: var(--text-dark);
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
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
      margin-bottom: 0.85rem;
    }

    .section-title {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text-dark);
    }

    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
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
      background: var(--subtle-bg);
      padding: 0.85rem 1.1rem;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
    }

    td {
      padding: 0.85rem 1.1rem;
      border-bottom: 1px solid var(--card-border);
      font-size: 0.88rem;
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
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
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
  <!-- Minimal Header Navigation -->
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
      <!-- 0. Upcoming Race Countdown Banner -->
      <div class="race-card" id="raceCountdownWidget">
        <div class="race-header">Next Race Countdown</div>
        <div class="race-details-group" id="raceDetailsContent">
          <div>
            <div class="race-title" id="raceTitleText">No Upcoming Race Scheduled</div>
            <div style="font-size: 0.83rem; color: var(--text-muted); margin-top: 2px;" id="raceSubtext">Set your next target race in the Settings tab.</div>
          </div>
          <div class="race-countdown-clock" id="raceClockGroup" style="display: none;">
            <div class="countdown-unit"><span class="countdown-num" id="cntDays">00</span><span class="countdown-lbl">Days</span></div>
            <div class="countdown-unit"><span class="countdown-num" id="cntHours">00</span><span class="countdown-lbl">Hours</span></div>
            <div class="countdown-unit"><span class="countdown-num" id="cntMins">00</span><span class="countdown-lbl">Mins</span></div>
            <div class="countdown-unit"><span class="countdown-num" id="cntSecs">00</span><span class="countdown-lbl">Secs</span></div>
          </div>
        </div>
      </div>

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
      <div class="section-header" style="margin-bottom: 0.75rem;">
        <div class="section-title" style="font-size: 1rem;">Highlights & Summary</div>
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
          <div class="card-value" id="kpiAvgHr" style="font-size:1.35rem;">-</div>
          <div class="card-subtitle">BPM</div>
        </div>
      </div>
    </div>

    <!-- TAB 2: ANALYTICS (GRAPHICAL VISUALS) -->
    <div class="tab-content" id="analyticsTab">
      <!-- Synced Period Filter Bar -->
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
      <!-- Synced Period Filter Bar -->
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
          Running Performance History <span id="periodLabel" style="font-size:0.83rem; font-weight:500; color:var(--text-muted)">(All Time)</span>
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
      <div class="section-header" style="margin-bottom: 1.15rem;">
        <div class="section-title">Application Settings</div>
      </div>
      
      <div class="settings-grid">
        <!-- 1. Upcoming Target Race Settings Card -->
        <div class="settings-card">
          <div class="settings-title">Next Upcoming Race</div>
          <div class="settings-desc">Set your next target race event details to display a live countdown on the Overview tab across all your devices.</div>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div class="settings-form-group">
              <label style="font-size: 0.83rem; font-weight: 600; width: 110px;">Race Name:</label>
              <input type="text" id="raceNameInput" class="settings-input" style="width: 260px;" placeholder="e.g. Hyderabad Half Marathon" />
            </div>
            <div class="settings-form-group">
              <label style="font-size: 0.83rem; font-weight: 600; width: 110px;">Race Date:</label>
              <input type="date" id="raceDateInput" class="settings-input" style="width: 260px;" />
            </div>
            <div class="settings-form-group">
              <label style="font-size: 0.83rem; font-weight: 600; width: 110px;">Distance (km):</label>
              <input type="number" id="raceDistInput" class="settings-input" style="width: 140px;" step="0.1" placeholder="e.g. 21.1" />
              <button onclick="saveUpcomingRaceSetting()" class="strava-btn strava-btn-primary" id="saveRaceBtn">Save Race</button>
            </div>
          </div>
        </div>

        <!-- 2. Adjustable Monthly Goal Target Card -->
        <div class="settings-card">
          <div class="settings-title">Monthly Distance Goal Target</div>
          <div class="settings-desc">Set your target running mileage in kilometers for the current calendar month.</div>
          <div class="settings-form-group">
            <input type="number" id="monthlyGoalInput" class="settings-input" min="1" max="1000" step="5" value="100" />
            <span style="font-weight:600; color:var(--text-muted); font-size: 0.88rem;">km / month</span>
            <button onclick="saveMonthlyGoalSetting()" class="strava-btn strava-btn-primary" id="saveGoalBtn">Save Goal</button>
          </div>
        </div>

        <!-- 3. Application Theme Settings Card -->
        <div class="settings-card">
          <div class="settings-title">Appearance & Theme</div>
          <div class="settings-desc">Choose between Light and Dark mode interface aesthetics.</div>
          <div class="theme-options-group">
            <button onclick="setThemeMode('light')" class="theme-option-btn" id="themeLightBtn">Light Theme</button>
            <button onclick="setThemeMode('dark')" class="theme-option-btn" id="themeDarkBtn">Dark Theme</button>
          </div>
        </div>

        <!-- 4. Account & Re-authentication Card -->
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
    let upcomingRaceSetting = null;
    let raceCountdownTimer = null;
    let currentThemeSetting = 'light';
    let chartInstanceDistancePace = null;
    let chartInstanceHrZones = null;
    let chartInstanceStrainHr = null;
    let chartInstanceWeeklyMileage = null;
    let modalChartInstance = null;

    // Load Settings from Server Database (Cross-Device Synced)
    async function initSettings() {
      // Load fallback from localStorage first
      const savedGoal = localStorage.getItem('monthlyTargetKm');
      if (savedGoal && !isNaN(Number(savedGoal))) {
        monthlyTargetKmSetting = Number(savedGoal);
      }
      document.getElementById('monthlyGoalInput').value = monthlyTargetKmSetting;

      const savedRace = localStorage.getItem('upcomingRace');
      if (savedRace) {
        try {
          upcomingRaceSetting = JSON.parse(savedRace);
          document.getElementById('raceNameInput').value = upcomingRaceSetting.name || '';
          document.getElementById('raceDateInput').value = upcomingRaceSetting.date || '';
          document.getElementById('raceDistInput').value = upcomingRaceSetting.distance || '';
        } catch (e) {}
      }

      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        currentThemeSetting = savedTheme;
        setThemeMode(savedTheme, false);
      }
      updateRaceCountdownWidget();

      // Fetch authoritative settings from DB API across all devices
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.monthlyTargetKm) {
            monthlyTargetKmSetting = Number(data.monthlyTargetKm);
            document.getElementById('monthlyGoalInput').value = monthlyTargetKmSetting;
            localStorage.setItem('monthlyTargetKm', monthlyTargetKmSetting);
          }
          if (data.raceName || data.raceDate) {
            upcomingRaceSetting = {
              name: data.raceName || '',
              date: data.raceDate || '',
              distance: data.raceDistance || ''
            };
            document.getElementById('raceNameInput').value = upcomingRaceSetting.name;
            document.getElementById('raceDateInput').value = upcomingRaceSetting.date;
            document.getElementById('raceDistInput').value = upcomingRaceSetting.distance;
            localStorage.setItem('upcomingRace', JSON.stringify(upcomingRaceSetting));
          }
          if (data.theme) {
            currentThemeSetting = data.theme;
            setThemeMode(data.theme, false);
          }
          updateRaceCountdownWidget();
          if (allRunsCache.length > 0) {
            calculatePRsAndGoals(allRunsCache);
          }
        }
      } catch (err) {
        console.error('Failed to load server settings:', err);
      }
    }

    async function syncSettingsToServer() {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monthlyTargetKm: monthlyTargetKmSetting,
            raceName: upcomingRaceSetting ? upcomingRaceSetting.name : '',
            raceDate: upcomingRaceSetting ? upcomingRaceSetting.date : '',
            raceDistance: upcomingRaceSetting ? upcomingRaceSetting.distance : '',
            theme: currentThemeSetting
          })
        });
      } catch (err) {
        console.error('Failed to sync settings to server:', err);
      }
    }

    async function saveUpcomingRaceSetting() {
      const btn = document.getElementById('saveRaceBtn');
      btn.innerText = 'Saving...';
      btn.disabled = true;

      const name = document.getElementById('raceNameInput').value.trim();
      const date = document.getElementById('raceDateInput').value;
      const distance = document.getElementById('raceDistInput').value;

      if (!name || !date) {
        alert('Please enter both Race Name and Race Date.');
        btn.innerText = 'Save Race';
        btn.disabled = false;
        return;
      }

      upcomingRaceSetting = { name, date, distance };
      localStorage.setItem('upcomingRace', JSON.stringify(upcomingRaceSetting));
      updateRaceCountdownWidget();
      await syncSettingsToServer();
      btn.innerText = 'Save Race';
      btn.disabled = false;
      alert('Upcoming race "' + name + '" saved across all your devices!');
    }

    function updateRaceCountdownWidget() {
      if (raceCountdownTimer) clearInterval(raceCountdownTimer);

      const titleEl = document.getElementById('raceTitleText');
      const subtextEl = document.getElementById('raceSubtext');
      const clockGroup = document.getElementById('raceClockGroup');

      if (!upcomingRaceSetting || !upcomingRaceSetting.date) {
        titleEl.innerText = 'No Upcoming Race Scheduled';
        subtextEl.innerText = 'Set your next target race in the Settings tab.';
        clockGroup.style.display = 'none';
        return;
      }

      const distStr = upcomingRaceSetting.distance ? ' — ' + Number(upcomingRaceSetting.distance).toFixed(1) + ' km' : '';
      titleEl.innerText = upcomingRaceSetting.name + distStr;
      
      const raceTargetTime = new Date(upcomingRaceSetting.date + 'T00:00:00').getTime();
      const formattedDate = new Date(upcomingRaceSetting.date + 'T00:00:00').toLocaleDateString([], { dateStyle: 'full' });
      subtextEl.innerText = 'Target Event Date: ' + formattedDate;
      clockGroup.style.display = 'flex';

      function tick() {
        const now = new Date().getTime();
        const diff = raceTargetTime - now;

        if (diff <= 0) {
          document.getElementById('cntDays').innerText = '00';
          document.getElementById('cntHours').innerText = '00';
          document.getElementById('cntMins').innerText = '00';
          document.getElementById('cntSecs').innerText = '00';
          subtextEl.innerText = 'Race Day is Here! Good Luck!';
          return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        document.getElementById('cntDays').innerText = days < 10 ? '0' + days : days;
        document.getElementById('cntHours').innerText = hours < 10 ? '0' + hours : hours;
        document.getElementById('cntMins').innerText = mins < 10 ? '0' + mins : mins;
        document.getElementById('cntSecs').innerText = secs < 10 ? '0' + secs : secs;
      }

      tick();
      raceCountdownTimer = setInterval(tick, 1000);
    }

    async function setThemeMode(mode, triggerRender = true) {
      currentThemeSetting = mode;
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

      if (triggerRender) {
        await syncSettingsToServer();
        if (allRunsCache.length > 0) {
          renderCharts(allRunsCache);
        }
      }
    }

    async function saveMonthlyGoalSetting() {
      const btn = document.getElementById('saveGoalBtn');
      btn.innerText = 'Saving...';
      btn.disabled = true;

      const inp = document.getElementById('monthlyGoalInput');
      const val = Number(inp.value);
      if (val && val > 0) {
        monthlyTargetKmSetting = val;
        localStorage.setItem('monthlyTargetKm', val);
        await syncSettingsToServer();
        btn.innerText = 'Save Goal';
        btn.disabled = false;
        alert('Monthly Target Goal updated to ' + val + ' km across all devices!');
        if (allRunsCache.length > 0) {
          calculatePRsAndGoals(allRunsCache);
        }
      } else {
        btn.innerText = 'Save Goal';
        btn.disabled = false;
      }
    }

    initSettings();

    function switchTab(tabId, btnEl) {
      document.querySelectorAll('.top-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      if (btnEl) btnEl.classList.add('active');
      const targetContent = document.getElementById(tabId);
      if (targetContent) targetContent.classList.add('active');

      // Refresh settings when switching tabs to ensure cross-device updates show up immediately
      initSettings();

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
      const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

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
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.35)',
              borderColor: isDark ? '#38bdf8' : '#0284c7',
              borderWidth: 1.5,
              borderRadius: 4,
              yAxisID: 'yDist',
            },
            {
              label: 'Pace (min/km)',
              data: paces,
              type: 'line',
              borderColor: isDark ? '#7dd3fc' : '#0369a1',
              backgroundColor: isDark ? '#7dd3fc' : '#0369a1',
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 3,
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
              title: { display: true, text: 'Distance (km)', color: isDark ? '#38bdf8' : '#0284c7' },
              grid: { color: gridColor }
            },
            yPace: {
              type: 'linear',
              position: 'right',
              reverse: true,
              title: { display: true, text: 'Pace (min/km - Faster)', color: isDark ? '#7dd3fc' : '#0369a1' },
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
            backgroundColor: ['#94a3b8', '#38bdf8', '#0284c7', '#0369a1', '#f97316'],
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
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
              borderColor: isDark ? '#38bdf8' : '#0284c7',
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)',
              borderWidth: 2,
              tension: 0.3,
              fill: true,
              yAxisID: 'yStrain'
            },
            {
              label: 'Avg Heart Rate (BPM)',
              data: avgHrs,
              borderColor: isDark ? '#7dd3fc' : '#0369a1',
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 3,
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
              title: { display: true, text: 'Strain (0-21)', color: isDark ? '#38bdf8' : '#0284c7' },
              grid: { color: gridColor }
            },
            yHr: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: 'Avg Heart Rate (BPM)', color: isDark ? '#7dd3fc' : '#0369a1' },
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
            backgroundColor: isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.35)',
            borderColor: isDark ? '#38bdf8' : '#0284c7',
            borderWidth: 1.5,
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
              title: { display: true, text: 'Weekly Distance (km)', color: isDark ? '#38bdf8' : '#0284c7' },
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

// Settings API GET Endpoint (Bulletproof Cross-device Sync)
app.get('/api/settings', async (req: Request, res: Response) => {
  const useSupabase = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  if (useSupabase && supabase) {
    // 1. Try dedicated user_settings table
    try {
      const { data, error } = await supabase.from('user_settings').select('*').eq('id', 'default').maybeSingle();
      if (!error && data) {
        return res.json({
          monthlyTargetKm: data.monthly_target_km || 100,
          raceName: data.race_name || '',
          raceDate: data.race_date || '',
          raceDistance: data.race_distance || '',
          theme: data.theme || 'light'
        });
      }
    } catch (err) {}

    // 2. Fallback to whoop_tokens table with user_id = 'app_settings'
    try {
      const { data, error } = await supabase.from('whoop_tokens').select('*').eq('user_id', 'app_settings').maybeSingle();
      if (!error && data && data.access_token) {
        const parsed = JSON.parse(data.access_token);
        return res.json({
          monthlyTargetKm: parsed.monthlyTargetKm || 100,
          raceName: parsed.raceName || '',
          raceDate: parsed.raceDate || '',
          raceDistance: parsed.raceDistance || '',
          theme: parsed.theme || 'light'
        });
      }
    } catch (err) {}
  }

  // SQLite fallback
  try {
    const db = await getDb();
    const row = await db.get("SELECT * FROM user_settings WHERE id = 'default'");
    if (row) {
      return res.json({
        monthlyTargetKm: row.monthly_target_km || 100,
        raceName: row.race_name || '',
        raceDate: row.race_date || '',
        raceDistance: row.race_distance || '',
        theme: row.theme || 'light'
      });
    }
  } catch (err) {}

  res.json({
    monthlyTargetKm: 100,
    raceName: '',
    raceDate: '',
    raceDistance: '',
    theme: 'light'
  });
});

// Settings API POST Endpoint (Bulletproof Cross-device Sync)
app.post('/api/settings', async (req: Request, res: Response) => {
  const { monthlyTargetKm, raceName, raceDate, raceDistance, theme } = req.body;
  const useSupabase = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  const settingsPayload = {
    monthlyTargetKm: monthlyTargetKm ? Number(monthlyTargetKm) : 100,
    raceName: raceName || '',
    raceDate: raceDate || '',
    raceDistance: raceDistance ? Number(raceDistance) : '',
    theme: theme || 'light'
  };

  if (useSupabase && supabase) {
    let savedInSupabase = false;

    // 1. Try upserting to user_settings table
    try {
      const { error } = await supabase.from('user_settings').upsert({
        id: 'default',
        monthly_target_km: settingsPayload.monthlyTargetKm,
        race_name: settingsPayload.raceName || null,
        race_date: settingsPayload.raceDate || null,
        race_distance: settingsPayload.raceDistance ? Number(settingsPayload.raceDistance) : null,
        theme: settingsPayload.theme,
        updated_at: new Date().toISOString()
      });
      if (!error) savedInSupabase = true;
    } catch (err) {}

    // 2. Always write to whoop_tokens with user_id = 'app_settings' as guaranteed fallback
    try {
      const { error } = await supabase.from('whoop_tokens').upsert({
        user_id: 'app_settings',
        access_token: JSON.stringify(settingsPayload),
        refresh_token: 'settings_backup',
        expires_at: Date.now() + 1000 * 60 * 60 * 24 * 3650, // 10 years
        token_type: 'settings',
        scope: 'app_settings',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (!error) savedInSupabase = true;
    } catch (err) {}

    if (savedInSupabase) {
      return res.json({ success: true, message: 'Settings saved to Supabase' });
    }
  }

  // SQLite fallback
  try {
    const db = await getDb();
    await db.run(`
      INSERT INTO user_settings (id, monthly_target_km, race_name, race_date, race_distance, theme, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        monthly_target_km = excluded.monthly_target_km,
        race_name = excluded.race_name,
        race_date = excluded.race_date,
        race_distance = excluded.race_distance,
        theme = excluded.theme,
        updated_at = CURRENT_TIMESTAMP
    `, [
      settingsPayload.monthlyTargetKm,
      settingsPayload.raceName || null,
      settingsPayload.raceDate || null,
      settingsPayload.raceDistance ? Number(settingsPayload.raceDistance) : null,
      settingsPayload.theme
    ]);
    return res.json({ success: true, message: 'Settings saved to SQLite' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
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
