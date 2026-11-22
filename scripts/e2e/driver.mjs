#!/usr/bin/env node
// Drives the RS Engine editor (or any page, e.g. the Project Browser or a built game) in headless Chrome.
//
//   node scripts/e2e/editor.mjs <url> <outPrefix> "<step>;<step>;..."
//
// Steps (separated by `;`, arguments after `|`):
//   wait|ms              waitfor|js-expression (polled until truthy, 30 s timeout)
//   shot|name            (→ <outPrefix>-<name>.png)                size|w,h (viewport)
//   click|cssSelector    clickxy|x,y      rclick|x,y (right click)  dblclick|x,y
//   move|x,y             wheel|x,y,deltaY
//   mdown|button         mup|button       (left|right|middle at the current mouse position — e.g. RMB-fly:
//                                          move|800,400;mdown|right;hold|w,500;move|900,400;mup|right)
//   drag|x1,y1,x2,y2[,Shift+Alt[,button]]  (modifiers written ~Alt are pressed after the button went down)
//   dragjs|path.js       real drag between points computed in the page (the file returns [x1,y1,x2,y2,mods?,button?])
//   dndjs|path.js        HTML5 drag & drop between points computed in the page (Hierarchies rows, Asset Browser tiles)
//   key|Control+z        hold|d,800       type|text (typed into the focused element)
//   holduntil|w,1000,20000,js-expression  (holds a key until the expression is truthy, at least / at most ms)
//   eval|js              evalfile|path.js (prints the JSON result; use files — shell quoting breaks inline JS)
//   text|cssSelector     sh|command       copyfile|src::dest        rm|file1,file2
//
// Console messages of the page are printed as [console.<type>], uncaught errors as [pageerror].
// Viewport 1600×900. Chrome: RS_CHROME env var, else the usual install paths.
// Setup once: `cd scripts/e2e && npm install`. Always headless: never opens a window.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const [url, out = 'shot', script = ''] = process.argv.slice(2);
if (!url) {
  console.log('usage: node scripts/e2e/editor.mjs <url> <outPrefix> "<step>;<step>"');
  process.exit(1);
}

function findChrome() {
  const candidates = [
    process.env.RS_CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('Chrome not found: set RS_CHROME to the browser executable');
  return found;
}

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  // software WebGL so it works on machines / CI without a GPU; RS_E2E_GPU=1 = the real GPU (ANGLE D3D11, benchmarks)
  args: [...(process.env.RS_E2E_GPU === '1' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'],
});
let exitCode = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.on('console', (m) => {
    const t = m.text();
    if (!t.includes('[vite]')) console.log(`[console.${m.type()}]`, t.slice(0, 600));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  // RS_E2E_WAITUNTIL=load|domcontentloaded|networkidle2 when the dev server keeps streaming HMR updates
await page.goto(url, { waitUntil: process.env.RS_E2E_WAITUNTIL || 'networkidle0', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${out}-0.png` });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const BUTTONS = { left: 'left', right: 'right', middle: 'middle', l: 'left', r: 'right', m: 'middle' };
  const button = (name) => BUTTONS[(name || 'left').toLowerCase()] ?? 'left';

  /** Real mouse drag in 12 steps. mods "Shift+Alt" are held from the start, "~Alt" pressed after the button went down. */
  async function drag(x1, y1, x2, y2, mods, btn = 'left') {
    const all = mods ? mods.split('+').filter(Boolean) : [];
    const before = all.filter((k) => !k.startsWith('~'));
    const during = all.filter((k) => k.startsWith('~')).map((k) => k.slice(1));
    for (const k of before) await page.keyboard.down(k);
    await page.mouse.move(x1, y1);
    await page.mouse.down({ button: button(btn) });
    for (const k of during) await page.keyboard.down(k);
    for (let i = 1; i <= 12; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12);
    await page.mouse.up({ button: button(btn) });
    for (const k of [...before, ...during].reverse()) await page.keyboard.up(k);
  }

  let n = 1;
  for (const step of script.split(';').filter((s) => s.trim())) {
    const [rawCmd, ...rest] = step.split('|');
    const cmd = rawCmd.trim();
    const arg = rest.join('|');
    try {
      if (cmd === 'wait') await sleep(Number(arg));
      else if (cmd === 'waitfor') {
        const t0 = Date.now();
        let ok = false;
        while (Date.now() - t0 < 30000) {
          try {
            // coerced in the page: a DOM node / non-serializable value would not survive the trip back
            ok = await page.evaluate(`!!(${arg})`);
          } catch {
            ok = false; // navigation / reload in progress
          }
          if (ok) break;
          await sleep(100);
        }
        if (!ok) {
          console.log(`[waitfor] timeout: ${arg}`);
          exitCode = 2;
        }
      } else if (cmd === 'shot') await page.screenshot({ path: `${out}-${arg || n++}.png` });
      else if (cmd === 'size') {
        const [w, h] = arg.split(',').map(Number);
        await page.setViewport({ width: w, height: h });
      } else if (cmd === 'click') await page.click(arg);
      else if (cmd === 'clickxy' || cmd === 'rclick' || cmd === 'dblclick') {
        const [x, y] = arg.split(',').map(Number);
        await page.mouse.click(x, y, { button: cmd === 'rclick' ? 'right' : 'left', count: cmd === 'dblclick' ? 2 : 1, clickCount: cmd === 'dblclick' ? 2 : 1 });
      } else if (cmd === 'move') {
        const [x, y] = arg.split(',').map(Number);
        await page.mouse.move(x, y, { steps: 4 });
      } else if (cmd === 'wheel') {
        const [x, y, dy] = arg.split(',').map(Number);
        await page.mouse.move(x, y);
        await page.mouse.wheel({ deltaY: dy });
      } else if (cmd === 'mdown') await page.mouse.down({ button: button(arg) });
      else if (cmd === 'mup') await page.mouse.up({ button: button(arg) });
      else if (cmd === 'drag') {
        const [x1, y1, x2, y2, mods = '', btn = 'left'] = arg.split(',');
        await drag(+x1, +y1, +x2, +y2, mods, btn);
      } else if (cmd === 'dragjs') {
        // the file returns [x1, y1, x2, y2, mods?, button?] computed in the page (e.g. where a gizmo handle is drawn)
        const r = await page.evaluate(fs.readFileSync(arg, 'utf8'));
        console.log('[dragjs]', JSON.stringify(r));
        if (Array.isArray(r) && r.length >= 4) await drag(+r[0], +r[1], +r[2], +r[3], r[4] ?? '', r[5] ?? 'left');
      } else if (cmd === 'dndjs') {
        // HTML5 drag & drop (dragstart / dragover / drop with a DataTransfer) between points computed in the page
        const r = await page.evaluate(fs.readFileSync(arg, 'utf8'));
        console.log('[dndjs]', JSON.stringify(r));
        await page.setDragInterception(true);
        await page.mouse.dragAndDrop({ x: +r[0], y: +r[1] }, { x: +r[2], y: +r[3] }, { delay: 50 });
        await page.setDragInterception(false);
      } else if (cmd === 'key') {
        const keys = arg.split('+');
        for (const k of keys) await page.keyboard.down(k);
        for (const k of keys.reverse()) await page.keyboard.up(k);
      } else if (cmd === 'hold') {
        const [k, ms] = arg.split(',');
        await page.keyboard.down(k);
        await sleep(Number(ms));
        await page.keyboard.up(k);
      } else if (cmd === 'holduntil') {
        // holduntil|key,minMs,maxMs,js-expression: holds the key until the expression is truthy (polled), at least minMs
        const [k, minMs, maxMs, ...expr] = arg.split(',');
        const cond = expr.join(',');
        const t0 = Date.now();
        let ok = false;
        await page.keyboard.down(k);
        try {
          while (Date.now() - t0 < Number(maxMs)) {
            try {
              ok = await page.evaluate(`!!(${cond})`);
            } catch {
              ok = false;
            }
            if (ok && Date.now() - t0 >= Number(minMs)) break;
            await sleep(100);
          }
        } finally {
          await page.keyboard.up(k);
        }
        if (!ok) console.log(`[holduntil] timeout: ${cond}`);
      } else if (cmd === 'type') await page.keyboard.type(arg, { delay: 10 });
      else if (cmd === 'eval' || cmd === 'evalfile') {
        const code = cmd === 'eval' ? arg : fs.readFileSync(arg, 'utf8');
        const r = await page.evaluate(code);
        console.log('[eval]', JSON.stringify(r)?.slice(0, 6000));
      } else if (cmd === 'text') {
        const r = await page.$$eval(arg, (els) => els.map((e) => e.textContent).join(' | '));
        console.log('[text]', r.slice(0, 3000));
      } else if (cmd === 'sh') {
        const { execSync } = await import('node:child_process');
        execSync(arg, { stdio: 'inherit', shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh' });
      } else if (cmd === 'copyfile') {
        const [src, dest] = arg.split('::');
        fs.copyFileSync(src, dest);
      } else if (cmd === 'rm') {
        for (const f of arg.split(',')) fs.rmSync(f, { force: true });
      } else console.log(`[e2e] unknown step: ${cmd}`);
    } catch (e) {
      console.log(`[e2e] step failed: ${step.slice(0, 120)} → ${e.message}`);
      exitCode = 2;
    }
  }
} finally {
  await browser.close();
}
process.exit(exitCode);
