// The browser tests, in two runs: first the few that watch the real clock (the real-time loop and
// automatic graphics, saving across a reload, starting offline) on their own, then all the
// test-mode ones on two workers at once. Test-mode tests step the game by exactly 1/60 s, so they
// give the same results however busy the machine is; the real-clock ones don't, so they never
// share it. Extra arguments go to both runs (e.g. a file name, --grep).
//
//   npm run test:e2e                 (PW_WORKERS=1 for one at a time)
import { spawnSync } from 'node:child_process';

const extra = process.argv.slice(2);
const workers = process.env.PW_WORKERS ?? '2';
const run = (args) =>
  spawnSync('npx', ['playwright', 'test', ...args, '--pass-with-no-tests', ...extra], { stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;

// (each run its own output folder: a run empties its folder when it starts)
const realtime = run(['--project=realtime', '--workers=1', '--output=test-results/realtime']);
const sim = run(['--project=sim', `--workers=${workers}`, '--output=test-results/sim']);
process.exit(realtime || sim);
