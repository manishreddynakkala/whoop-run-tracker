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
  let runsCount = 0;
  let totalWorkouts = 0;
  let runs: any[] = [];
  let dbType = useSupabase ? 'Supabase Postgres' : 'Local SQLite';

  if (useSupabase && supabase) {
    const tokenRes = await supabase.from('whoop_tokens').select('*').maybeSingle();
    token = tokenRes.data;

    const runsCountRes = await supabase
      .from('whoop_workouts')
      .select('*', { count: 'exact', head: true })
      .eq('is_running', true);
    runsCount = runsCountRes.count || 0;

    const totalCountRes = await supabase
      .from('whoop_workouts')
      .select('*', { count: 'exact', head: true });
    totalWorkouts = totalCountRes.count || 0;

    const runsRes = await supabase
      .from('whoop_workouts')
      .select('*')
      .eq('is_running', true)
      .order('start_time', { ascending: false })
      .limit(15);
    runs = runsRes.data || [];
  } else {
    try {
      const db = await getDb();
      token = await db.get('SELECT * FROM whoop_tokens LIMIT 1');
      const rCount = await db.get('SELECT COUNT(*) as count FROM whoop_workouts WHERE is_running = 1');
      runsCount = rCount?.count || 0;
      const tCount = await db.get('SELECT COUNT(*) as count FROM whoop_workouts');
      totalWorkouts = tCount?.count || 0;
      runs = await db.all('SELECT * FROM whoop_workouts WHERE is_running = 1 ORDER BY start_time DESC LIMIT 15');
    } catch (err) {
      // Fallback
    }
  }

  const hasTokenRecord = !!token;
  const currentRedirectUri = getRedirectUri(req);

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
      max-width: 1000px;
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

    .status-group {
      display: flex;
      gap: 8px;
      align-items: center;
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

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.25rem;
    }

    .card-title {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 0.4rem;
    }

    .card-value {
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: -1px;
    }

    .card-subtitle {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
    }

    .actions-card {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      justify-content: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 18px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      border: none;
      width: 100%;
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

    .section-title {
      font-size: 1.2rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 10px;
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
      min-width: 600px;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.03);
      padding: 0.9rem 1rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
    }

    td {
      padding: 0.9rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.9rem;
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

    .alert {
      background: rgba(255, 126, 54, 0.1);
      border: 1px solid rgba(255, 126, 54, 0.3);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      font-size: 0.88rem;
      line-height: 1.5;
    }

    .alert code {
      background: rgba(0, 0, 0, 0.4);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--accent-cyan);
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
      <div class="status-group">
        <div class="status-pill">
          <div class="status-dot ${hasTokenRecord ? 'status-connected' : 'status-disconnected'}"></div>
          ${hasTokenRecord ? 'Authenticated' : 'Not Connected'}
        </div>
      </div>
    </header>

    ${
      !useSupabase
        ? `<div class="alert">
            <strong>ℹ️ Supabase Setup Tip:</strong> To persist data permanently across Vercel deployments, add your <code>SUPABASE_URL</code> and <code>SUPABASE_KEY</code> to your Vercel Environment Variables.
           </div>`
        : ''
    }

    <div class="grid">
      <div class="card">
        <div class="card-title">Running Activities</div>
        <div class="card-value" style="color: var(--accent-red)">${runsCount}</div>
        <div class="card-subtitle">Stored in ${dbType}</div>
      </div>
      <div class="card">
        <div class="card-title">Total Workouts</div>
        <div class="card-value" style="color: var(--accent-cyan)">${totalWorkouts}</div>
        <div class="card-subtitle">All WHOOP activities ingested</div>
      </div>
      <div class="card actions-card">
        <a href="/auth/login" class="btn btn-primary">
          ${hasTokenRecord ? '🔑 Re-authenticate WHOOP' : '🔗 Connect WHOOP Account'}
        </a>
        <button onclick="triggerSync()" class="btn btn-secondary" id="syncBtn">
          ⚡ Trigger Ingestion Sync
        </button>
      </div>
    </div>

    <div class="section-title">
      🏃 Recent Running Activities
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Sport</th>
            <th>Distance</th>
            <th>Duration</th>
            <th>Strain</th>
            <th>Avg / Max HR</th>
            <th>Calories</th>
          </tr>
        </thead>
        <tbody>
          ${
            runs.length === 0
              ? `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted)">No running activities ingested yet. Connect your account and run a sync!</td></tr>`
              : runs
                  .map((r: any) => {
                    const dateStr = new Date(r.start_time).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    });
                    const durationMin = Math.round(r.duration_ms / 60000);
                    const distMiles = r.distance_miles ? `${Number(r.distance_miles).toFixed(2)} mi` : 'N/A';
                    return `
                      <tr>
                        <td><strong>${dateStr}</strong></td>
                        <td>${r.sport_name}</td>
                        <td><strong style="color:var(--accent-cyan)">${distMiles}</strong></td>
                        <td>${durationMin} mins</td>
                        <td><span class="badge badge-strain">${r.strain ? Number(r.strain).toFixed(1) : 'N/A'}</span></td>
                        <td><span class="badge badge-hr">${r.average_heart_rate || 'N/A'} / ${r.max_heart_rate || 'N/A'} bpm</span></td>
                        <td>${r.calories ? Math.round(Number(r.calories)) + ' kcal' : 'N/A'}</td>
                      </tr>
                    `;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function triggerSync() {
      const btn = document.getElementById('syncBtn');
      btn.innerText = '⌛ Syncing...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        const data = await res.json();
        alert(data.message || (data.success ? 'Sync completed successfully!' : 'Sync failed'));
        window.location.reload();
      } catch (err) {
        alert('Error triggering sync: ' + err.message);
      } finally {
        btn.innerText = '⚡ Trigger Ingestion Sync';
        btn.disabled = false;
      }
    }
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

// JSON endpoint for stored runs
app.get('/api/runs', async (req: Request, res: Response) => {
  const useSupabase = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from('whoop_workouts')
      .select('*')
      .eq('is_running', true)
      .order('start_time', { ascending: false });
    return res.json({ count: data?.length || 0, runs: data || [], error: error?.message });
  }

  try {
    const db = await getDb();
    const runs = await db.all('SELECT * FROM whoop_workouts WHERE is_running = 1 ORDER BY start_time DESC');
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

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🌐 WHOOP Run Tracker Hub running on http://localhost:${PORT}`);
  });
}

export default app;
