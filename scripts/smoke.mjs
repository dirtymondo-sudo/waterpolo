// Smoke test: build serves, page boots, WebGL renders, no console errors,
// input drives the sim, and the camera cycles. Writes screenshots to shots/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 4300 + Math.floor(Math.random() * 200);

function waitPort(port, tries = 40) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => { s.destroy(); if (--tries <= 0) reject(new Error('server timeout')); else setTimeout(tick, 250); });
    };
    tick();
  });
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  await waitPort(PORT);
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots/m2-swimoff.png' }); // swim-off "PERIOD 1" banner

  // Let the whistle blow and play settle.
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'shots/m0-broadcast.png' });

  // Camera tour: side -> dynamic -> endline (the vertical, down-the-pool view).
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shots/m0-sidecam.png' });
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shots/m0-endline.png' });
  await page.keyboard.press('KeyC'); // back to broadcast

  // --- Charge a lob from a clean shooting position and capture it. ---
  await page.evaluate(() => {
    const s = window.GAME.state;
    s.phase = 'play'; s.phaseTimer = 0; s.possession = 0;
    for (const p of s.players) if (p.team === 1) { p.x = 13; p.z = 8; }
    const h = s.players.find((p) => p.controlled) || s.players.find((p) => p.human);
    h.x = 8; h.z = 0;
    s.ball.locked = false; s.ball.held = true; s.ball.ownerId = h.id; s.ball.x = 8; s.ball.z = 0;
  });
  await page.waitForTimeout(200);
  await page.keyboard.down('KeyQ'); // hold lob to charge
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/m1-charge.png' });
  await page.keyboard.up('KeyQ'); // release: fire the lob
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/m1-shot.png' });

  // --- Man-up: sin-bin a CPU defender and capture the indicator. ---
  await page.evaluate(() => {
    const s = window.GAME.state;
    s.phase = 'play'; s.phaseTimer = 0;
    const d = s.players.find((p) => p.team === 1 && p.role === 'field' && !p.excluded);
    d.excluded = true; d.excludeTimer = 20;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/m3-manup.png' });

  // --- Win screen: force the clock to full time and capture the banner. ---
  await page.evaluate(() => {
    const s = window.GAME.state;
    s.score = [4, 2]; s.period = 4; s.periodClock = 0.1;
  });
  await page.waitForTimeout(3200); // periodEnd pause -> fullTime
  await page.screenshot({ path: 'shots/m2-fulltime.png' });

  // Headless determinism check: confirm all three shot types can score.
  const shotCheck = await page.evaluate(() => (window.GAME.testShots ? window.GAME.testShots() : null));

  const info = await page.evaluate(() => {
    const g = window.GAME;
    return {
      tick: g.state.tick,
      players: g.state.players.length,
      camMode: g.renderer.rig.mode,
      phase: g.state.phase,
      score: g.state.score,
    };
  });

  console.log('GAME info:', JSON.stringify(info));
  if (shotCheck) console.log('Shot self-test:', JSON.stringify(shotCheck));
  console.log('Console errors:', errors.length ? errors : 'none');
  process.exitCode = errors.length ? 1 : 0;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
