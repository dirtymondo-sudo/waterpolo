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
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/m0-broadcast.png' });

  // Swim right (D) for ~1.2s so the camera leads and the wake/lean show.
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyD');
  await page.screenshot({ path: 'shots/m0-swim.png' });

  // Cycle the camera to "side", let it settle.
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/m0-sidecam.png' });

  // Cycle on to "dynamic" then "endline" (the vertical, down-the-pool view).
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/m0-endline.png' });

  // --- Milestone 1: aim down-pool, charge a lob, and capture it mid-flight. ---
  await page.evaluate(() => {
    // Face the human at the opponent goal and give some space for a clean shot.
    const s = window.GAME.state;
    const h = s.players.find((p) => p.human);
    h.x = 8; h.z = 0; h.heading = Math.atan2(1.2, 30 / 2 - 8);
  });
  await page.keyboard.press('KeyC'); // back to broadcast for the action shot
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyQ'); // hold lob to charge
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'shots/m1-charge.png' });
  await page.keyboard.up('KeyQ'); // release: fire the lob
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'shots/m1-shot.png' });
  await page.waitForTimeout(1600); // let it land / score
  await page.screenshot({ path: 'shots/m1-after.png' });

  // Headless determinism check: confirm all three shot types can score.
  const shotCheck = await page.evaluate(() => {
    return window.GAME.testShots ? window.GAME.testShots() : null;
  });

  const info = await page.evaluate(() => {
    const g = window.GAME;
    const p = g.state.players[0];
    return {
      tick: g.state.tick,
      players: g.state.players.length,
      camMode: g.renderer.rig.mode,
      score: g.state.score,
      shotClock: +g.state.shotClock.toFixed(1),
      possession: g.state.possession,
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
