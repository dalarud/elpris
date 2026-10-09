// Startar appen lokalt i Chromium och tar skärmbilder (mobil, ljust och mörkt läge).
// Externa anrop (priser, SMHI) hämtas av Node och skickas vidare till sidan.
// Kör: node test/skarmbild.mjs <utmapp>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright kan vara installerat globalt (som i utvecklingsmiljön) eller lokalt.
let pw;
try { pw = await import('playwright'); } catch { pw = createRequire(import.meta.url)(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const { chromium } = pw;

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const UT = process.argv[2] ?? '.';
const TYPER = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const vag = join(ROT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { res.writeHead(200, { 'Content-Type': TYPER[extname(vag)] ?? 'application/octet-stream' }); res.end(await readFile(vag)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const fel = [];
const info = [];
for (const tema of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: tema, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
  await ctx.route(/^https:\/\/(www\.elprisetjustnu\.se|opendata-download-met(fcst|obs)\.smhi\.se)\//, async (route) => {
    const r = await fetch(route.request().url());
    route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
  });
  const sida = await ctx.newPage();
  sida.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) fel.push(`${tema}: ${m.text()}`); });
  sida.on('pageerror', (e) => fel.push(`${tema}: ${e.message}`));
  // 404 för morgondagens priser före kl 13 är väntat och hanteras av appen.
  sida.on('response', (r) => { if (r.status() >= 400) info.push(`${tema}: ${r.status()} ${r.url()}`); });
  await sida.goto(`http://127.0.0.1:${port}/`);
  await sida.waitForSelector('#kostnad:not([hidden])', { timeout: 90000 }).catch(() => fel.push(`${tema}: kostnadsdelen visades aldrig`));
  await sida.screenshot({ path: join(UT, `elkollen-${tema}.png`), fullPage: true });
  if (tema === 'light') {
    await sida.click('#dagar details.dag summary');
    await sida.screenshot({ path: join(UT, 'elkollen-dag-oppen.png'), fullPage: false, clip: await sida.locator('#dagar').boundingBox() });
    await sida.click('#oppna-installningar');
    await sida.screenshot({ path: join(UT, 'elkollen-installningar.png') });
  }
  await ctx.close();
}
await browser.close();
server.close();
if (info.length) console.log(`HTTP-fel (kontrollera att de är väntade):\n${info.join('\n')}`);
console.log(fel.length ? `FEL:\n${fel.join('\n')}` : 'Inga fel i konsolen.');
