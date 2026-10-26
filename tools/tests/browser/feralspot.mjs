// Viveiro das Águias: Ferais Marteladores fora do portal, na ponta de fora do Espaço
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'viveiro-das-aguias' }); });
await wait(4000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(6000);
const ferals = await page.evaluate(() => window.cbt.game.units().filter(u => u.defId.startsWith('feral_martelador')).map(u => ({ id: u.id, cell: u.cell, pos: window.cbt.renderer.units.get(u.id).pos })));
console.log(JSON.stringify(ferals));
for (const f of ferals) {
  await page.evaluate(cell => { const c = window.cbt; c.renderer.camGoal = null; c.renderer.focus([cell], 1.1); }, f.cell);
  await wait(800);
  await page.screenshot({ path: `${OUT}/feral-${f.cell.c}${f.cell.r}.png`, clip: { x: 450, y: 180, width: 500, height: 420 } });
}
// alguém chega pelo portal no Espaço do Martelador de (0,5)
const tele = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const f = g.units().find(u => u.defId.startsWith('feral_martelador') && u.cell.c === 0 && u.cell.r === 5);
  const before = { ...c.renderer.units.get(f.id).pos };
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
  h.cell = { c: 2, r: 4 }; g.s.activation = null; c.renderer.sync();
  c.act({ type: 'activate', heroId: h.id });
  g.s.activation.mp = 4;
  const ok = c.act({ type: 'move', cell: { c: 0, r: 5 } });
  window.__tele = { f: f.id, h: h.id, before };
  return ok;
});
await wait(4000);
const res = await page.evaluate(() => { const r = window.cbt.renderer, t = window.__tele, f = r.units.get(t.f), h = r.units.get(t.h); return { moved: !!h.cell && h.cell.c === 0 && h.cell.r === 5, feralBefore: t.before, feralAfter: f.pos, heroPos: h.pos, feralDir: f.dir, heroDir: h.dir }; });
console.log('teleporte:', tele, JSON.stringify(res));
await page.evaluate(() => { const c = window.cbt; c.renderer.camGoal = null; c.renderer.focus([{ c: 0, r: 5 }], 1.1); });
await wait(800);
await page.screenshot({ path: `${OUT}/feral-tele.png`, clip: { x: 450, y: 180, width: 500, height: 420 } });
const same = Math.abs(res.feralAfter.gx - res.feralBefore.gx) < 0.05 && Math.abs(res.feralAfter.gy - res.feralBefore.gy) < 0.05;
const facing = (res.heroPos.gx - res.heroPos.gy) > (res.feralAfter.gx - res.feralAfter.gy) ? /w/.test(res.heroDir) && /e/.test(res.feralDir) : /e/.test(res.heroDir) && /w/.test(res.feralDir);
console.log(res.moved && same && facing ? 'MARTELADOR NO LUGAR E DE FRENTE OK' : 'FALHOU');
await browser.close();
