// Shift + mirar: marca um Espaço e mostra se dá para atacar um Monstro dali (linha verde/vermelha, X no que bloqueia, texto no balão).
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
// um Monstro e dois Espaços: um de onde dá para atacar a distância e um bloqueado (parede/quina/Espaço)
const plan = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const hero = g.units().find(u => u.kind === 'hero' && u.alive && u.cell);
  const r = c.renderer;
  for (const m of g.units().filter(u => u.kind === 'monster' && u.alive && u.cell)) {
    // câmera: o Monstro no meio da tela; só Espaços visíveis (fora do HUD)
    const p = r.cellScreenPos(m.cell);
    r.camGoal = null; r.cam.x += 600 - p.x; r.cam.y += 380 - p.y;
    const vis = x => { const q = r.cellScreenPos(x); return q.x > 60 && q.x < 1050 && q.y > 120 && q.y < 640; };
    const cells = g.board.allCells().filter(x => g.board.playable(x) && !g.board.isPillar(x) && vis(x));
    const ok = cells.find(x => Math.abs(x.c - m.cell.c) + Math.abs(x.r - m.cell.r) >= 3 && g.attackCheck(hero, x, m).ranged);
    const bad = cells.find(x => Math.abs(x.c - m.cell.c) + Math.abs(x.r - m.cell.r) >= 2 && !g.attackCheck(hero, x, m).ranged);
    if (ok && bad) return { m: m.id, ok, bad };
  }
  return null;
});
console.log('plano', JSON.stringify(plan));
for (const [name, from] of [['livre', plan.ok], ['bloqueado', plan.bad]]) {
  const p = await page.evaluate(f => window.cbt.renderer.cellScreenPos(f), from);
  await page.mouse.move(p.x, p.y); await wait(150);
  await page.keyboard.down('Shift'); await wait(150);
  const t = await page.evaluate(id => window.cbt.renderer.unitScreenPos(id), plan.m);
  await page.mouse.move(t.x, t.y - 30, { steps: 5 }); await wait(400);
  const tip = await page.evaluate(() => document.querySelector('.tip-aim')?.innerText ?? '(sem balão)');
  console.log(`== ${name} de (${from.c},${from.r}):`, tip.replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}/aim-${name}.png` });
  await page.keyboard.up('Shift'); await wait(200);
  console.log('   soltou o Shift -> linha some?', await page.evaluate(() => window.cbt.renderer.hl.los === null || !window.cbt.renderer.hl.los.aim));
}
await browser.close();
