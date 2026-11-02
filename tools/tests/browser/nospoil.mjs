// Herói morre na Vingança: barra de Heróis, placar e ficha só mostram a morte depois dos dados/animação
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
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(2500);
let hit = null, spoil = 0, hidden = 0, shownAfter = false;
for (let tent = 0; tent < 12 && !hit; tent++) {
  const info = await page.evaluate(() => {
    const c = window.cbt, g = c.game;
    const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
    if (!h) return null;
    if (g.s.activation?.heroId !== h.id) c.act({ type: 'activate', heroId: h.id });
    const m = g.units().find(u => u.kind === 'monster' && u.alive && u.cell);
    m.cell = { ...h.cell };
    h.wounds = g.maxHp(h) - 1; h.stunned = true; // sem Defesa: qualquer acerto mata
    const a = g.s.activation; if (a) a.attacked = false;
    h.cards.forEach(x => { x.exhausted = false; });
    const card = g.usableCards(h).find(x => g.attackTargets(h, x).some(t => t.id === m.id));
    if (!card) return null;
    window.__sel = h.id;
    c.act({ type: 'attack', cardUid: card.uid, targetId: m.id });
    return { h: h.id };
  });
  if (!info) { await wait(500); continue; }
  for (let k = 0; k < 300; k++) {
    await wait(100);
    const s = await page.evaluate(id => {
      const c = window.cbt, g = c.game, u = g.unit(id);
      document.querySelectorAll('#dicecenter button').forEach(b => { if (!b.disabled && !/Cancelar/i.test(b.textContent || '')) b.click(); });
      if (!u.alive && c.renderer.busy && !c.hud.inspected) c.hud.inspected = id, c.hud.refresh(); // abre a ficha no meio do lance
      const dom = !!document.querySelector(`[data-hp="${id}"].dead, [data-sb="${id}"].dead`) || (document.querySelector('#herobox .tag.dead')?.textContent || '').includes('Morto');
      return { real: !u.alive, view: c.renderer.viewUnit(id)?.alive, dom, busy: c.renderer.busy };
    }, info.h);
    if (s.real && s.view && s.dom) spoil++;
    if (s.real && s.view && !s.dom) { hidden++; hit = info.h; }
    if (s.real && !s.view && s.dom) shownAfter = true;
    if (k % 40 === 0) console.log(k, JSON.stringify(s));
    if (s.real && !s.busy && !s.view) { await wait(600); shownAfter = await page.evaluate(id => !!document.querySelector(`[data-hp="${id}"].dead, [data-sb="${id}"].dead`), info.h); break; }
    if (!s.real && !s.busy && k > 30) break;
  }
}
await page.screenshot({ path: `${OUT}/nospoil.png` });
console.log({ hit, spoil, hidden, shownAfter });
console.log(hit && !spoil && hidden > 0 && shownAfter ? 'SEM SPOILER DE MORTE OK' : 'FALHOU');
await browser.close();
