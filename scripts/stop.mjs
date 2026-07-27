// @ts-check
// Stops every local dev-server (http-server) instance, regardless of which
// port or session started it — `npm run dev`, Playwright's webServer, or an
// editor preview. Useful when stray servers keep ports busy.
import { execFileSync } from 'node:child_process';
import process from 'node:process';

/** @returns {number[]} PIDs of node processes whose command line runs http-server */
function findWindowsPids() {
  const psCommand =
    'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
    "Where-Object { $_.CommandLine -match 'http-server' } | " +
    'ForEach-Object { $_.ProcessId }';
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', psCommand], {
    encoding: 'utf8',
  });
  return out
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

if (process.platform === 'win32') {
  const pids = findWindowsPids();
  if (pids.length === 0) {
    console.log('No http-server processes found.');
  }
  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      console.log(`Stopped http-server (PID ${pid}).`);
    } catch {
      console.log(`Could not stop PID ${pid} (already gone?).`);
    }
  }
} else {
  try {
    execFileSync('pkill', ['-f', 'http-server']);
    console.log('Stopped http-server processes.');
  } catch {
    // pkill exits non-zero when nothing matched.
    console.log('No http-server processes found.');
  }
}
