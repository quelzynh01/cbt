// Vingança controlada por mim: clicar na porta Perto do Monstro marca abrir/fechar (1 Movimento) e a jogada mexe na porta
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
await wait(3000);
const res = [];
for (const startOpen of [false, true]) {
  const st = await page.evaluate(so => {
    const c = window.cbt, g = c.game;
    const d = g.s.doors.find(x => !x.locked);
    d.open = so;
    const m = g.units().find(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object'));
    const h = g.heroesOf(g.s.guildOrder[1])[0] ?? g.heroesOf(g.currentGuild().id)[0];
    m.cell = { ...d.a }; h.cell = { ...d.b };
    g.s.pending = { monsterId: m.id, heroId: h.id, controller: g.currentGuild().id, dying: [] };
    c.renderer.sync(); c.refresh();
    c.renderer.focus([d.a, d.b], 1);
    return { door: d.id, open: d.open, click: c.renderer.hl.doorClick };
  }, startOpen);
  await wait(800);
  // clica no ícone da porta (onde o renderer desenha)
  const p = await page.evaluate(id => { const r = window.cbt.renderer; for (let y = 120; y < 650; y += 6) for (let x = 100; x < 1100; x += 6) if (r.pickDoorIcon(x, y) === id) return { x, y }; return null; }, st.door);
  if (p) await page.mouse.click(p.x, p.y);
  await wait(500);
  const marked = await page.evaluate(() => window.cbt.renderer.hl.doorFlip.slice());
  await page.screenshot({ path: `${OUT}/vdoor-${startOpen ? 'fechar' : 'abrir'}.png` });
  // confirma a Vingança sem mover e sem atacar
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Não atacar|Não ataca|Sem atacar/i.test(x.textContent || '')); b?.click(); });
  await wait(2500);
  const after = await page.evaluate(id => ({ open: window.cbt.game.s.doors.find(x => x.id === id).open, pending: !!window.cbt.game.s.pending }), st.door);
  res.push({ startOpen, clickable: st.click.includes(st.door), icon: !!p, marked, after });
}
console.log(JSON.stringify(res));
console.log(res.every(r => r.clickable && r.icon && r.marked.length === 1 && r.after.open === !r.startOpen) ? 'PORTA NA VINGANÇA (TELA) OK' : 'FALHOU');
await browser.close();
