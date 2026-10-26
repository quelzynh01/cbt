// Atalho das Botas: com um Herói ativado, o item de outro Herói aparece lá em cima; clicar leva até ele e já entra no modo Botas.
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
const setup = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const gid = g.currentGuild().id;
  const [a, b] = g.heroesOf(gid).filter(u => u.alive && u.cell);
  b.cards.push({ uid: 'boot-test', defId: 'das_boot', exhausted: false, uses: 0 });
  const bc = b.cards.find(x => x.uid === 'boot-test');
  for (const cell of g.board.allCells().filter(x => g.board.playable(x) && !g.unitsAt(x).length)) { b.cell = { ...cell }; if (g.bootCells(b, bc).length >= 2) break; }
  c.act({ type: 'activate', heroId: a.id });
  return { a: a.id, b: b.id };
});
await wait(1500);
const bar = await page.evaluate(() => { const b = document.getElementById('itemquick'); return { shown: !!b && !b.classList.contains('hidden'), n: b?.querySelectorAll('[data-qh]').length ?? 0, html: b?.innerText }; });
console.log('barra:', JSON.stringify(bar));
await page.screenshot({ path: `${OUT}/qb-bar.png` });
await page.evaluate(() => document.querySelector('#itemquick [data-qh]')?.click());
await wait(1200);
const st = await page.evaluate(id => { const c = window.cbt, g = c.game, h = g.unit(id); return { boot: !!c.bootMode, inspected: c.hud.inspected, green: c.renderer.hl.move.size, cells: g.bootCells(h, h.cards.find(x => x.uid === 'boot-test')).length, act: JSON.stringify(g.activatable(h, h.cards.find(x => x.uid === 'boot-test'))), hint: document.getElementById('hint')?.innerText }; }, setup.b);
console.log('depois do clique:', JSON.stringify(st));
await page.screenshot({ path: `${OUT}/qb-boot.png` });
// move: clica num Espaço verde
const target = await page.evaluate(() => { const c = window.cbt; const k = [...c.renderer.hl.move.keys()][0]; const [col, row] = k.split(',').map(Number); return c.renderer.cellScreenPos({ c: col, r: row }); });
await page.mouse.click(target.x, target.y);
await wait(2500);
const end = await page.evaluate(() => { const c = window.cbt, g = c.game; return { boot: !!c.bootMode, inspected: c.hud.inspected, active: g.s.activation?.heroId, bar: !document.getElementById('itemquick').classList.contains('hidden') }; });
console.log('final:', JSON.stringify(end));
const ok = bar.n === 1 && st.boot && st.inspected === setup.b && st.green > 0 && !end.boot && end.inspected === setup.a && !end.bar;
console.log(ok ? 'ATALHO DAS BOTAS OK' : 'FALHOU');
// painel de ataque: "Rolar ataque" e "Cancelar ataque" na mesma linha
await page.evaluate(() => {
  const c = window.cbt, g = c.game, a = g.unit(g.s.activation.heroId);
  const m = g.units().find(u => u.kind === 'monster' && u.alive && u.cell);
  m.cell = { ...a.cell };
  const card = g.usableCards(a).find(x => g.attackTargets(a, x).some(t => t.id === m.id));
  if (card) c.act({ type: 'attack', cardUid: card.uid, targetId: m.id });
});
await wait(2500);
const row = await page.evaluate(() => { const r = document.querySelector('.cd-roll')?.getBoundingClientRect(), k = document.querySelector('.cd-cancel')?.getBoundingClientRect(); return r && k ? { same: Math.abs(r.top - k.top) < 8, roll: r.height, cancel: k.height } : null; });
console.log('botões do ataque:', JSON.stringify(row));
await page.screenshot({ path: `${OUT}/qb-atk.png` });
await browser.close();
