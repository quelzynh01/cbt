// Painel da Defesa que já bloqueou tudo: Manter / +1 dado / Rerrolar cabem no quadro (computador e MOB=1 celular)
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport(process.env.MOB ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1400, height: 850 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(2500);
await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive);
  const m = g.units().find(u => u.kind === 'monster' && u.alive);
  window.__p = c.hud.askDecision({ heroId: h.id, kind: 'defense', faces: ['crit', 'blank', 'blank'], success: 'shield', rerolls: 4, base: 3, round: 1, covered: true, held: 1,
    vs: { id: m.id, faces: ['melee', 'ranged', 'melee'], hits: 1, type: 'ranged', base: 3 } });
});
await wait(2500);
await page.evaluate(() => document.querySelector('#dicecenter .cd-roll')?.click());
await wait(3000);
const r = await page.evaluate(() => {
  const bar = document.querySelector('.cd-keepbar'); if (!bar) return null;
  const box = bar.closest('.cd-def, .cd-side, .cd-fighterbox') ?? bar.parentElement;
  const br = box.getBoundingClientRect();
  return { n: bar.querySelectorAll('button').length, fits: [...bar.querySelectorAll('button')].every(b => { const q = b.getBoundingClientRect(); return q.left >= br.left - 1 && q.right <= br.right + 1; }) };
});
console.log('botões:', JSON.stringify(r));
await page.screenshot({ path: `${OUT}/keepbar.png` });
console.log(r?.fits && r.n === 3 ? 'PAINEL MANTER OK' : 'FALHOU');
await browser.close();
