// Marcas de habilidade: lança (Zazu) e adaga (Escarlate) em alvo flanqueado, livro (Hobsbawm) em Aliado em Linha de Visão;
// sem marca depois de atacar / para quem não tem a habilidade. Flecha crítica do Casacaverde (PORT=)
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

// h: Herói testado; a: Aliado colado no Monstro (flanqueia); o Monstro fica ao lado
const ids = await page.evaluate(() => {
  const c = window.cbt, r = c.renderer, g = c.game;
  const [h, a] = g.heroesOf(g.currentGuild().id).filter(u => u.alive && u.cell);
  const m = g.units().find(u => u.kind === 'monster' && u.alive && u.cell);
  const near = g.board.isClose ? null : null;
  a.cell = { ...m.cell };
  h.cell = { ...m.cell };
  r.sync();
  r.focus?.([m.cell]);
  return { h: h.id, a: a.id, m: m.id, near };
});
await wait(600);
const marks = (ab, what) => page.evaluate((i, ab, what) => {
  const c = window.cbt, r = c.renderer, g = c.game;
  const h = g.unit(i.h);
  const orig = g.ab; g.ab = u => u.id === h.id ? ab : orig.call(g, u);
  if (what === 'attacked') g.s.activation = { heroId: h.id, mp: 0, moved: false, moveLocked: false, attacked: true };
  else g.s.activation = null;
  r.hl.markHero = what === 'none' ? null : h.id;
  r.marksAt = -1;
  const out = [...r.unitMarks().entries()];
  return out;
}, ids, ab, what);
const check = (name, ok, got) => { console.log(ok ? 'ok ' : 'FALHOU', name, JSON.stringify(got)); if (!ok) errors++; };

let m = await marks('oportunista', 'ok');
check('Zazu: lança no Monstro flanqueado', m.some(([id, k]) => id === ids.m && k === 'spear'), m);
await wait(200);
await page.screenshot({ path: `${OUT}/mark_lanca.png` });
m = await marks('apunhalar', 'ok');
check('Escarlate: adaga', m.some(([id, k]) => id === ids.m && k === 'dagger'), m);
await wait(200);
await page.screenshot({ path: `${OUT}/mark_adaga.png` });
m = await marks('oportunista', 'attacked');
check('depois de atacar, sem marca', m.length === 0, m);
m = await marks('bencao', 'ok');
check('Hobsbawm: livro no Aliado', m.some(([id, k]) => id === ids.a && k === 'book') && !m.some(([id]) => id === ids.m), m);
await wait(200);
await page.screenshot({ path: `${OUT}/mark_livro.png` });
m = await marks('furia', 'ok');
check('outra habilidade, sem marca', m.length === 0, m);
m = await marks('oportunista', 'none');
check('sem Herói escolhido, sem marca', m.length === 0, m);

// flecha crítica x flecha comum
for (const [name, sfx] of [['critica', 'bow-critico'], ['comum', undefined]]) {
  const ms = await page.evaluate((i, sfx) => {
    const c = window.cbt, r = c.renderer, g = c.game;
    const far = g.units().filter(u => u.kind === 'monster' && u.alive && u.cell).pop();
    return r.animateAttack({ attackerId: i.h, cardName: 'Arco Crescente', attackType: 'ranged', targets: [{ id: far.id }], hits: 3, ...(sfx ? { sfx } : {}) });
  }, ids, sfx);
  await wait(ms * 0.62);
  await page.screenshot({ path: `${OUT}/flecha_${name}.png` });
  await wait(ms);
}
console.log(errors ? 'FALHOU' : 'MARCAS OK (veja os prints)');
await browser.close();
