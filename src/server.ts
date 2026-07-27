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
  let dbType = useSupabase ? 'Supabase Postgres' : 'Local SQLite';

  if (useSupabase && supabase) {
    const tokenRes = await supabase.from('whoop_tokens').select('*').maybeSingle();
    token = tokenRes.data;
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
  <title>WHOOP Run Tracker Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0b0f19;
      --card-bg: rgba(22, 28, 45, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-red: #ff3b5c;
      --accent-orange: #ff7e36;
      --accent-cyan: #00f2fe;
      --accent-green: #00e676;
      --accent-purple: #a78bfa;
      --accent-pink: #ec4899;
      --accent-yellow: #f59e0b;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(at 10% 10%, rgba(255, 59, 92, 0.15) 0px, transparent 50%),
        radial-gradient(at 90% 90%, rgba(0, 242, 254, 0.15) 0px, transparent 50%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 1.25rem 0.75rem;
    }

    .container {
      max-width: 1080px;
      margin: 0 auto;
    }

    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 1.5rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--card-border);
    }

    .logo-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-badge {
      background: linear-gradient(135deg, var(--accent-red), var(--accent-orange));
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 1.4rem;
      box-shadow: 0 4px 20px rgba(255, 59, 92, 0.4);
    }

    h1 {
      font-size: 1.6rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(to right, #ffffff, #9ca3af);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.82rem;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-connected { background-color: var(--accent-green); box-shadow: 0 0 10px var(--accent-green); }
    .status-disconnected { background-color: var(--accent-red); box-shadow: 0 0 10px var(--accent-red); }

    /* Date Period Filter Bar */
    .filter-bar {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .filter-title {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .preset-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .preset-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .preset-btn:hover, .preset-btn.active {
      background: linear-gradient(135deg, var(--accent-red), var(--accent-orange));
      color: white;
      border-color: transparent;
      box-shadow: 0 2px 10px rgba(255, 59, 92, 0.3);
    }

    .date-inputs {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .date-inputs input[type="date"] {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 6px 10px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.82rem;
    }

    /* Summary Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.1rem;
      transition: transform 0.2s ease;
    }

    .card-title {
      font-size: 0.78rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 0.3rem;
    }

    .card-value {
      font-size: 1.7rem;
      font-weight: 800;
      letter-spacing: -0.8px;
    }

    .card-subtitle {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 0.3rem;
    }

    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent-red), var(--accent-orange));
      color: white;
      box-shadow: 0 4px 15px rgba(255, 59, 92, 0.3);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid var(--card-border);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .section-title {
      font-size: 1.15rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .table-container {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    table {
      width: 100%;
      min-width: 780px;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.03);
      padding: 0.85rem 1rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
    }

    td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.88rem;
    }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .badge-strain {
      background: rgba(255, 59, 92, 0.15);
      color: var(--accent-red);
      border: 1px solid rgba(255, 59, 92, 0.3);
    }

    .badge-hr {
      background: rgba(255, 126, 54, 0.15);
      color: var(--accent-orange);
      border: 1px solid rgba(255, 126, 54, 0.3);
    }

    .badge-pace {
      background: rgba(236, 72, 153, 0.15);
      color: var(--accent-pink);
      border: 1px solid rgba(236, 72, 153, 0.3);
    }

    .badge-cal {
      background: rgba(245, 158, 11, 0.15);
      color: var(--accent-yellow);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-section">
        <div class="logo-badge">W</div>
        <div>
          <h1>WHOOP Run Tracker</h1>
          <div style="font-size:0.78rem; color: var(--text-muted)">Powered by ${dbType}</div>
        </div>
      </div>
      <div class="header-actions">
        <div class="status-pill">
          <div class="status-dot ${hasTokenRecord ? 'status-connected' : 'status-disconnected'}"></div>
          ${hasTokenRecord ? 'Authenticated' : 'Not Connected'}
        </div>
        <a href="/auth/login" class="btn btn-secondary">
          ${hasTokenRecord ? '🔑 Re-auth' : '🔗 Connect'}
        </a>
        <button onclick="triggerSync()" class="btn btn-primary" id="syncBtn">
          ⚡ Sync Data
        </button>
      </div>
    </header>

    <!-- Date Period Filter Controls -->
    <div class="filter-bar">
      <div class="filter-title">
        📅 Select Date Period:
      </div>
      <div class="preset-group">
        <button class="preset-btn" onclick="selectPreset('7d', this)">Last 7 Days</button>
        <button class="preset-btn" onclick="selectPreset('30d', this)">Last 30 Days</button>
        <button class="preset-btn" onclick="selectPreset('month', this)">This Month</button>
        <button class="preset-btn active" onclick="selectPreset('all', this)">All Time</button>
      </div>
      <div class="date-inputs">
        <input type="date" id="startDate" onchange="customDateChanged()" />
        <span style="font-size:0.8rem; color:var(--text-muted)">to</span>
        <input type="date" id="endDate" onchange="customDateChanged()" />
      </div>
    </div>

    <!-- Summary Metrics for Selected Period -->
    <div class="grid">
      <div class="card">
        <div class="card-title">Running Sessions</div>
        <div class="card-value" id="kpiRunsCount" style="color: var(--accent-cyan)">-</div>
        <div class="card-subtitle">Completed runs</div>
      </div>
      <div class="card">
        <div class="card-title">Total Distance</div>
        <div class="card-value" id="kpiDistance" style="color: var(--accent-red)">-</div>
        <div class="card-subtitle">Kilometers run</div>
      </div>
      <div class="card">
        <div class="card-title">Avg Pace</div>
        <div class="card-value" id="kpiAvgPace" style="color: var(--accent-pink)">-</div>
        <div class="card-subtitle">min / km</div>
      </div>
      <div class="card">
        <div class="card-title">Total Time</div>
        <div class="card-value" id="kpiDuration" style="color: var(--accent-purple)">-</div>
        <div class="card-subtitle">Hours & Mins</div>
      </div>
      <div class="card">
        <div class="card-title">Total Calories</div>
        <div class="card-value" id="kpiCalories" style="color: var(--accent-yellow)">-</div>
        <div class="card-subtitle">kcal burned</div>
      </div>
      <div class="card">
        <div class="card-title">Average Strain</div>
        <div class="card-value" id="kpiAvgStrain" style="color: var(--accent-orange)">-</div>
        <div class="card-subtitle">WHOOP strain score</div>
      </div>
      <div class="card">
        <div class="card-title">Avg / Max HR</div>
        <div class="card-value" id="kpiAvgHr" style="font-size:1.4rem; color:var(--accent-green)">-</div>
        <div class="card-subtitle">BPM average</div>
      </div>
    </div>

    <!-- Running Activities Table -->
    <div class="section-header">
      <div class="section-title">
        🏃 Running Activities <span id="periodLabel" style="font-size:0.85rem; font-weight:400; color:var(--text-muted)">(All Time)</span>
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
          <tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted)">Loading running activities...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    let currentStartDate = null;
    let currentEndDate = null;

    function calcPaceString(durationMs, distKm) {
      if (!distKm || distKm <= 0 || !durationMs) return 'N/A';
      const totalMins = durationMs / 60000;
      const paceDec = totalMins / distKm;
      if (paceDec > 30 || paceDec < 2) return 'N/A'; // Filter unrealistic pace numbers
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
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted)">Loading...</td></tr>';

      const params = new URLSearchParams();
      if (currentStartDate) params.append('startDate', currentStartDate);
      if (currentEndDate) params.append('endDate', currentEndDate);

      try {
        const res = await fetch('/api/runs?' + params.toString());
        const data = await res.json();
        const runs = data.runs || [];

        // Update KPI Cards using Kilometers (km)
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

        // Render Table Rows
        if (runs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted)">No running activities found for the selected date period.</td></tr>';
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
              <td><strong style="color:var(--accent-cyan)">\${distKmStr}</strong></td>
              <td><span class="badge badge-pace">\${paceStr}</span></td>
              <td>\${durationMin} mins</td>
              <td><span class="badge badge-strain">\${r.strain ? Number(r.strain).toFixed(1) : 'N/A'}</span></td>
              <td><span class="badge badge-hr">\${r.average_heart_rate || 'N/A'} / \${r.max_heart_rate || 'N/A'} bpm</span></td>
              <td><span class="badge badge-cal">\${calStr}</span></td>
            </tr>
          \`;
        }).join('');

      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--accent-red)">Error loading data: \${err.message}</td></tr>\`;
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
      btn.innerText = '⌛ Syncing...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        const data = await res.json();
        alert(data.message || (data.success ? 'Sync completed successfully!' : 'Sync failed'));
        loadRuns();
      } catch (err) {
        alert('Error triggering sync: ' + err.message);
      } finally {
        btn.innerText = '⚡ Sync Data';
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

app.listen(PORT, () => {
  console.log(`🌐 WHOOP Run Tracker Hub running on http://localhost:${PORT}`);
});

export default app;
