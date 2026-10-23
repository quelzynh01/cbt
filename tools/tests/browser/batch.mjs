// Modo Teste: Recompensa com inventário cheio, aura de maldição, barra de vida e tela de Descanso (prints em OUT).
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 860 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = sel => page.evaluate(s => { const b = document.querySelector(s); if (b && !b.disabled) { b.click(); return true; } return false; }, sel);
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.setItem('cbt.settings', JSON.stringify({ battle: 'never' })); localStorage.setItem('cbt.test', JSON.stringify({ mapId: 'distrito-dos-martelos', teams: [{ guild: 'azul', controller: 'human' }, { guild: 'vermelho', controller: 'ai' }], heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['espada_enferrujada', 'adaga_aparadora', 'estilingue', 'raio_nova'] } })); });
await page.reload({ waitUntil: 'networkidle0' }); await wait(800);
await click('#m-test'); await wait(800); await click('#ts-start'); await wait(4000);
await click('.rl-go'); await wait(300); await click('#dp-ok'); await wait(500);
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Sim, terminar/.test(b.textContent))?.click()); await wait(3000);
// maldição na Maya (aura) e ferimentos para ver a barra em gomos
await page.evaluate(() => { const c = window.cbt, g = c.game; const m = g.heroesOf('azul')[1]; m.curse = 'choque'; m.wounds = 2; g.s.titles = { azul: ['guardiao_portao'] }; c.renderer.sync?.(); c.refresh(); c.renderer.focus([m.cell], 1.3); });
await wait(1200);
await page.screenshot({ path: `${OUT}/x1.png` });
// recompensa com inventário cheio (Grom tem 4 cartas)
await page.evaluate(() => { const c = window.cbt, g = c.game; const h = g.heroesOf('azul')[0]; c.act({ type: 'activate', heroId: h.id }); c.withDecisions(() => { g.giveReward(h); return true; }, () => c.pushLocal(g.drain())); });
await wait(1200);
await page.screenshot({ path: `${OUT}/x2.png` });
await page.evaluate(() => document.getElementById('ch-none')?.click()); await wait(6000);
// descanso com a carta sem Herói
await page.evaluate(() => { const c = window.cbt; c.game.s.activation = null; c.game.s.activatedThisTurn = []; c.openRest(); }); await wait(1200);
await page.screenshot({ path: `${OUT}/x3.png` });
await browser.close();
