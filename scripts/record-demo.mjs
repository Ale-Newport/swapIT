// Records docs/demo.gif from the web build — the same React UI and tool code as the Mac app.
//
//   npm run build:web && npm run preview:web          # serves http://localhost:4317
//   npm i --no-save playwright-core                    # uses your installed Google Chrome
//   node scripts/record-demo.mjs http://localhost:4317 /tmp/toolbox-demo
//   cd /tmp/toolbox-demo && ffmpeg -f concat -safe 0 -i frames.txt \
//     -vf "setpts=PTS/1.7,fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
//     -loop 0 docs/demo.gif
//
// Frames are page screenshots rather than a screencast: headless Chrome's video crops the viewport.
import { chromium } from 'playwright-core';
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: 'light',
});
await ctx.addInitScript(() => {
  localStorage.setItem('toolbox.onboarded', 'true');
});
const page = await ctx.newPage();
const pause = (ms) => page.waitForTimeout(ms);
import fs from 'node:fs';
fs.mkdirSync(out, { recursive: true });
const frames = [];
let recording = false;
async function capture() {
  while (recording) {
    try {
      const t = Date.now();
      const buf = await page.screenshot({ type: 'png' });
      frames.push({ t, buf });
    } catch { /* mid-navigation */ }
  }
}
let loop;
function startRec() { recording = true; loop = capture(); }
await page.goto(base + '/#/');
await page.waitForSelector('text=Drop anything here');
// Hide the web-demo banner: the recording is about the app itself.
await page.addStyleTag({ content: '[role=note]{display:none!important}' });
startRec();
await pause(1200);

// 1. ⌘K → QR generator → a real, scannable code.
await page.keyboard.press('Meta+k');
await pause(500);
await page.keyboard.type('qr code', { delay: 90 });
await pause(700);
await page.keyboard.press('Enter');
await page.waitForSelector('input[placeholder="example.com/menu"]');
await pause(800);
await page.click('input[placeholder="example.com/menu"]');
await page.keyboard.type('github.com/Ale-Newport/swapIT', { delay: 55 });
await pause(1300);
const dots = page.getByRole('combobox').first();
try { await dots.selectOption({ index: 1 }); await pause(1000); } catch { /* optional */ }
await pause(800);

// 2. JSON → YAML, converted as you type.
await page.click('a[href="#/c/developer"]');
await pause(900);
await page.getByText('JSON ↔ YAML', { exact: true }).first().click();
const area = page.locator('textarea').first();
await area.waitFor();
await pause(600);
await area.click();
await page.keyboard.type('{"name": "toolbox", "local": true, "tools": 169, "tags": ["fast", "private"]}', { delay: 28 });
await pause(1800);

// 3. The radial menu: select a photo in Finder, press ⌃⌥Space.
await page.goto(base + '/?demo#/radial-demo');
await page.addStyleTag({ content: '.demo-bar{opacity:0!important}' });
await page.waitForSelector('.demo-wall');
await pause(900);
await page.getByRole('button', { name: 'HEIC photo' }).click();
await pause(900);
{
  const cx = 640;
  const cy = 400;
  await page.mouse.move(cx, cy);
  for (const a of [-90, -30, 30, 90, 150]) {
    const r = (a * Math.PI) / 180;
    await page.mouse.move(cx + Math.cos(r) * 135, cy + Math.sin(r) * 135, { steps: 8 });
    await pause(420);
  }
}
await pause(500);
await page.keyboard.press('Escape');
await pause(500);
await page.getByRole('button', { name: 'Create (empty)' }).click();
await pause(1800);
await page.keyboard.press('Escape');
await pause(400);

recording = false;
await loop;
let list = '';
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(4, '0')}.png`;
  fs.writeFileSync(`${out}/${name}`, f.buf);
  const next = frames[i + 1]?.t ?? f.t + 100;
  list += `file '${name}'\nduration ${((next - f.t) / 1000).toFixed(3)}\n`;
});
list += `file 'f${String(frames.length - 1).padStart(4, '0')}.png'\n`;
fs.writeFileSync(`${out}/frames.txt`, list);
console.log('frames', frames.length, 'seconds', (frames.at(-1).t - frames[0].t) / 1000);
await ctx.close();
await browser.close();
