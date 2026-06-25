import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetScript = join(__dirname, '../../scripts/sync-telemetry-component.mjs');

if (existsSync(targetScript)) {
  console.log('Syncing telemetry component...');
  const result = spawnSync('node', [targetScript], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} else {
  console.log('No telemetry sync script found in parent folder, skipping.');
}
