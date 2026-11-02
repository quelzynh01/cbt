// Animações de ataque: magias (quantidade de elementos = acertos) e a arma da carta na mão. Tira prints de cada uma (PORT=)
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const PORT = process.env.PORT ?? '5199';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('PAGEERR', e.message); });
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(2500);
const ids = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
  const m = g.units().filter(u => u.kind === 'monster' && u.alive && u.cell).sort((p, q) => (Math.abs(p.cell.c - h.cell.c) + Math.abs(p.cell.r - h.cell.r)) - (Math.abs(q.cell.c - h.cell.c) + Math.abs(q.cell.r - h.cell.r)))[0];
  h.cell = { c: m.cell.c, r: Math.max(0, m.cell.r - 2) };
  c.renderer.sync?.();
  c.renderer.focus?.([h.cell, m.cell]);
  c.renderer.speed = 0.25;
  return { h: h.id, m: m.id };
});
await wait(800);
const CASES = [
  ['raio', 'Raio Nova', 'ranged', 2, {}, [0.35]], ['drenar', 'Drenar Vida', 'ranged', 2, {}, [0.5]], ['rajada', 'Rajada de Vento', 'ranged', 3, {}, [0.55]],
  ['odio', 'Ódio', 'ranged', 3, {}, [0.6]], ['incinerar', 'Incinerar', 'ranged', 4, {}, [0.5]],
  ['espada', 'Lâmina Confiável', 'melee', 2, {}, [0.4]], ['machado', 'Dizimador', 'melee', 2, {}, [0.4]], ['martelo', 'Esmaga-Cara', 'melee', 2, {}, [0.46]],
  ['arco', 'Arco Crescente', 'ranged', 2, {}, [0.4]], ['besta', 'Tiro Rápido', 'ranged', 2, {}, [0.4]], ['fender', 'Lâmina Confiável', 'melee', 2, { cleave: true }, [0.5]],
];
for (const [name, cardName, attackType, hits, extra, moments] of CASES) {
  const ms = await page.evaluate((i, cardName, attackType, hits, extra) => {
    const r = window.cbt.renderer;
    return r.animateAttack({ attackerId: i.h, cardName, attackType, targets: [{ id: i.m }], hits, ...extra });
  }, ids, cardName, attackType, hits, extra);
  for (const k of moments) { await wait(ms * k); await page.screenshot({ path: `${OUT}/fx_${name}.png` }); }
  await wait(ms + 300);
  console.log(name, Math.round(ms));
}
console.log(errors ? 'FALHOU' : 'ANIMAÇÕES OK (veja os prints)');
await browser.close();
