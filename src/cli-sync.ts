import { syncWhoopWorkouts } from './whoop/sync.js';

async function main() {
  console.log('🚀 Initiating WHOOP Run Tracker Sync...');
  const result = await syncWhoopWorkouts();

  if (result.success) {
    console.log(`✅ ${result.message}`);
  } else {
    console.error(`❌ ${result.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
