// Templo: Herói Perto das Irmãs / Lorde Presas; clicar para andar mostra o aviso de Reação de Alerta antes
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
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'templo-do-amanhecer-crepuscular' }); });
await wait(4000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(6000);
const res = [];
for (const who of ['irma_prazer', 'irma_dor', 'lorde_presas']) {
  const plan = await page.evaluate(w => {
    const c = window.cbt, g = c.game;
    const m = g.units().find(u => u.kind === 'monster' && u.alive && u.cell && u.defId.startsWith(w));
    const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell && g.ab(u) !== 'furtivo');
    if (!g.s.activation) c.act({ type: 'activate', heroId: h.id });
    const a = g.s.activation; if (!a) return null;
    const hero = g.unit(a.heroId);
    const near = g.board.allCells().find(x => g.board.playable(x) && !g.board.isPillar(x) && g.board.isClose(x, m.cell) && !(x.c === m.cell.c && x.r === m.cell.r) && g.unitsAt(x).length < 2 && g.monsterCanAttack(m, { ...hero, cell: x }));
    if (!near) return null;
    hero.cell = { ...near }; a.mp = 3; a.moved = false;
    c.renderer.sync(); c.refresh();
    const dest = [...g.reachable(hero, a.mp, hero.cell, false)].find(([, n]) => n.canEnd && n.prev !== null && !g.board.isClose(n.cell, m.cell) && !g.unitsAt(n.cell).length);
    if (!dest) return null;
    c.renderer.focus([dest[1].cell], 0.7);
    return { cell: dest[1].cell, preview: g.alertPreview(dest[1].cell, false).map(u => u.defId) };
  }, who);
  if (!plan) { res.push({ who, plan: null }); continue; }
  await wait(600);
  const p = await page.evaluate(cell => window.cbt.renderer.cellScreenPos(cell), plan.cell);
  await page.mouse.click(p.x, p.y);
  await wait(600);
  // menu Mover/Atacar (boneco de um Monstro embaixo do dedo): escolhe Mover
  await page.evaluate(() => document.querySelector('#clickmenu .cm-opt.move')?.click());
  await wait(900);
  const dlg = await page.evaluate(() => { const b = document.getElementById('confirmbox'); return b && !b.classList.contains('hidden') ? b.innerText.slice(0, 80) : null; });
  console.log('debug', JSON.stringify(await page.evaluate(cell => { const c = window.cbt, g = c.game, a = g.s.activation, h = a && g.unit(a.heroId); return { hero: h?.defId, at: h?.cell, target: cell, inMove: c.renderer.hl.move.has(cell.c + ',' + cell.r), busy: c.renderer.busy, menu: !!document.querySelector('.clickmenu, #clickmenu'), evs: g.s.turn }; }, plan.cell)));
  res.push({ who, preview: plan.preview, dialog: dlg });
  await page.screenshot({ path: `${OUT}/alert-${who}.png` });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#confirmbox button')].find(x => /Cancelar|Voltar|Não/i.test(x.textContent || '')); b?.click(); });
  await wait(500);
}
console.log(JSON.stringify(res, null, 1));
console.log(res.every(r => r.plan === null || /Alerta/.test(r.dialog ?? '')) && res.some(r => r.dialog) ? 'AVISO NA TELA OK' : 'FALHOU');
await browser.close();
