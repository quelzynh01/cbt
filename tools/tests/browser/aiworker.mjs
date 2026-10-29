// IA com busca no navegador (Web Worker): partida IA x IA no Modo Teste; confere se os turnos andam sem erro e se a tela não trava.
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2];
const SECS = Number(process.env.SECS ?? 90);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 860 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
page.on('console', m => { if (/IA|worker/i.test(m.text())) console.log('CONSOLE', m.text()); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = sel => page.evaluate(s => { const b = document.querySelector(s); if (b && !b.disabled) { b.click(); return true; } return false; }, sel);
await page.goto(`http://localhost:${process.env.PORT ?? 5199}/`, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.setItem('cbt.settings', JSON.stringify({ battle: 'never', speed: 4 })); localStorage.setItem('cbt.test', JSON.stringify({ mapId: 'distrito-dos-martelos', teams: [{ guild: 'azul', controller: 'ai' }, { guild: 'vermelho', controller: 'ai' }] })); });
await page.reload({ waitUntil: 'networkidle0' }); await wait(800);
await click('#m-test'); await wait(800); await click('#ts-start'); await wait(4000);
await click('.rl-go'); await wait(300); await click('#dp-ok'); await wait(500);
// mede travamentos da tela: maior intervalo entre quadros
await page.evaluate(() => { window.__gap = 0; let t = performance.now(); const f = () => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - t); t = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < SECS * 1000) {
  await wait(5000);
  const s = await page.evaluate(() => { const g = window.cbt.game; return `turno ${g.s.turn} vez ${g.currentGuild().id} ativação ${g.s.activation?.heroId ?? '-'} missões ${g.s.guildOrder.map(x => g.guild(x).missions.length).join('x')} vencedor ${g.s.winner ?? '-'} | maior intervalo entre quadros ${Math.round(window.__gap)} ms`; });
  if (s !== last) console.log(Math.round((Date.now() - t0) / 1000) + 's', s);
  last = s;
  if (s.includes('vencedor ') && !s.includes('vencedor -')) break;
}
await page.screenshot({ path: `${OUT}/aiworker.png` });
await browser.close();
