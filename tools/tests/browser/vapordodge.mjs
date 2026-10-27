// Vapor perto de 2 Monstros: a cada Reação pergunta se esquiva desta (até usar) e pode cancelar o movimento
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, heroes: ['vapor', 'grom', 'maya'] }); });
await wait(3500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(3000);
const setup = () => page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const v = g.heroesOf(g.currentGuild().id).find(u => u.defId === 'vapor');
  const mons = g.units().filter(u => u.kind === 'monster' && u.alive && u.cell && !g.monAbility(u, 'object')).slice(0, 2);
  const cells = g.board.allCells().filter(x => g.board.playable(x) && !g.board.isPillar(x) && !g.unitsAt(x).length);
  const spot = cells.find(x => !g.board.portalAt(x) && g.board.neighbors(x).filter(n => g.board.isClose(x, n) && !g.unitsAt(n).length && !g.board.portalAt(n)).length >= 2);
  const nb = g.board.neighbors(spot).filter(n => g.board.isClose(spot, n) && !g.unitsAt(n).length && !g.board.portalAt(n));
  mons[0].cell = { ...spot }; mons[1].cell = { ...nb[0] };
  v.cell = { ...spot }; v.wounds = 0;
  g.s.activation = null; g.s.stealthUsed = []; g.s.activatedThisTurn = [];
  c.renderer.sync();
  c.act({ type: 'activate', heroId: v.id });
  const dest = [...g.reachable(v, g.s.activation.mp, v.cell, false)].map(([, n]) => n).find(n => n.canEnd && n.prev !== null && !mons.some(m => g.board.isClose(m.cell, n.cell)));
  window.__v = { id: v.id, start: { ...v.cell }, mons: mons.map(m => m.id) };
  // os Monstros erram (o Vapor não morre no meio do teste)
  if (!window.__rig) { const orig = g.roll.bind(g); g.roll = (...a) => a[2] !== 'shield' ? { faces: Array(a[0]).fill('blank'), successes: 0, crits: 0 } : orig(...a); window.__rig = true; }
  const info = { vcell: v.cell, close: g.monstersCloseTo(v.cell).map(m => m.id), mp: g.s.activation?.mp, locked: g.s.activation?.moveLocked, unitV: g.unit(v.id) === v, spot, mons: mons.map(m => ({ id: m.id, cell: m.cell, can: g.monsterCanAttack(m, v) })), dest: dest.cell, preview: g.alertPreview(dest.cell, false).map(m => m.id), act: g.s.activation?.heroId, used: g.s.stealthUsed };
  c.act({ type: 'move', cell: dest.cell });
  return info;
});
await setup();
await wait(1200);
const panel = await page.evaluate(() => [...document.querySelectorAll('.mc-btns button')].map(b => b.textContent.trim()));
await page.screenshot({ path: `${OUT}/vapor-pergunta.png` });
console.log('1ª Reação:', JSON.stringify(panel));
// cancelar: volta tudo
await page.evaluate(() => document.getElementById('ch-cancel')?.click());
await wait(1500);
const after = await page.evaluate(() => { const g = window.cbt.game, v = g.unit(window.__v.id); return { at: v.cell, start: window.__v.start, used: (g.s.stealthUsed ?? []).includes(v.id), wounds: v.wounds }; });
console.log('depois de cancelar:', JSON.stringify(after));
const okCancel = panel.some(t => /Esquivar/.test(t)) && panel.some(t => /Não esquivar/.test(t)) && panel.some(t => /Cancelar movimento/.test(t)) && after.at.c === after.start.c && after.at.r === after.start.r && !after.used && after.wounds === 0;
// de novo: não esquiva da 1ª (toma), a 2ª pergunta de novo -> esquiva
await setup();
await wait(1200);
await page.evaluate(() => document.getElementById('ch-none')?.click());
let asked2 = false;
for (let i = 0; i < 60 && !asked2; i++) {
  await wait(300);
  asked2 = await page.evaluate(() => [...document.querySelectorAll('.mc-btns button')].some(b => /Esquivar/.test(b.textContent)) && !!document.getElementById('ch-cancel'));
  if (!asked2) await page.evaluate(() => { const b = [...document.querySelectorAll('#dicecenter button')].find(x => /Rolar defesa|Manter|Crítico|Não usar/i.test(x.textContent)); b?.click(); });
}
if (asked2) await page.evaluate(() => document.querySelector('.mc-btns [data-i="0"]')?.click());
for (let i = 0; i < 30; i++) { await wait(300); await page.evaluate(() => { const b = [...document.querySelectorAll('#dicecenter button')].find(x => /Rolar defesa|Manter|Crítico|Não usar/i.test(x.textContent)); b?.click(); }); }
const end = await page.evaluate(() => { const g = window.cbt.game, v = g.unit(window.__v.id); return { used: (g.s.stealthUsed ?? []).includes(v.id), alive: v.alive, moved: !!v.cell && !(v.cell.c === window.__v.start.c && v.cell.r === window.__v.start.r) }; });
console.log('2ª pergunta veio?', asked2, JSON.stringify(end));
console.log(okCancel && asked2 && end.used && end.moved ? 'ESQUIVA E CANCELAR OK' : 'FALHOU');
await browser.close();
