// Porta e Lápide no atalho lá em cima: botão "Abrir/Fechar Porta" do Herói ativo, chave só com o mouse no botão; "Revelar Lápide" (Beyond). MOB=1 = celular (PORT=)
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const PORT = process.env.PORT ?? '5199';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let errors = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
const check = (name, ok, got) => { console.log(ok ? 'ok ' : 'FALHOU', name, JSON.stringify(got)); if (!ok) errors++; };
async function open(mapId) {
  const page = await browser.newPage();
  await page.setViewport(process.env.MOB ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1400, height: 850 });
  page.on('pageerror', e => { errors++; console.log('PAGEERR', e.message); });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(id => { localStorage.setItem('cbt.map', id); const t = JSON.parse(localStorage.getItem('cbt.test') ?? '{}'); t.mapId = id; localStorage.setItem('cbt.test', JSON.stringify(t)); }, mapId);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(2000);
  await page.evaluate(() => document.querySelector('#m-test')?.click()); await wait(800);
  await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
  await wait(1000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
  await wait(2500);
  return page;
}
const bar = page => page.evaluate(() => { const b = document.getElementById('itemquick'); return { shown: !!b && !b.classList.contains('hidden'), text: [...(b?.querySelectorAll('small') ?? [])].map(x => x.textContent) }; });

// porta (Clássico)
let page = await open(process.env.MAP ?? 'distrito-dos-martelos');
const info = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
  const d = g.s.doors.find(x => !x.locked);
  if (!d) return null;
  d.open = false;
  c.renderer.sync();
  h.cell = { ...d.a };
  c.renderer.sync();
  c.renderer.glideCells?.([d.a]);
  c.act({ type: 'activate', heroId: h.id });
  return { door: d.id, h: h.id };
});
console.log('mapa/porta', JSON.stringify(info));
await wait(1500);
let b = await bar(page);
check('botão Abrir Porta aparece', b.shown && b.text.some(t => t.startsWith('Abrir Porta')), b);
check('borda: verde ao abrir', await page.evaluate(() => getComputedStyle(document.querySelector('#itemquick [data-qdoor]')).borderTopColor === 'rgb(63, 212, 106)'), []);
check('botão não cobre o texto de ajuda', await page.evaluate(() => { const b = document.getElementById('itemquick').getBoundingClientRect(), h = document.getElementById('hint').getBoundingClientRect(); return !h.height || h.bottom <= b.top || h.top >= b.bottom; }), await page.evaluate(() => { const b = document.getElementById('itemquick').getBoundingClientRect(), h = document.getElementById('hint').getBoundingClientRect(); return { bar: [b.top, b.bottom], hint: [h.top, h.bottom] }; }));
check('sem chave no mapa antes do mouse', await page.evaluate(() => window.cbt.renderer.doorIconPos.size === 0), []);
await page.hover('#itemquick [data-qdoor]').catch(() => {});
await wait(300);
if (!process.env.MOB) check('chave aparece com o mouse no botão', await page.evaluate(() => window.cbt.renderer.doorIconPos.size === 1), []);
await page.screenshot({ path: `${OUT}/qd_porta.png` });
const mp0 = await page.evaluate(() => window.cbt.game.s.activation.mp);
await page.click('#itemquick [data-qdoor]');
await wait(1500);
const st = await page.evaluate(id => { const g = window.cbt.game; return { open: g.s.doors.find(d => d.id === id).open, mp: g.s.activation.mp }; }, info.door);
check('clique abre e gasta 1 PM', st.open && st.mp === mp0 - 1, st);
b = await bar(page);
check('botão vira Fechar Porta', b.text.some(t => t.startsWith('Fechar Porta')), b);
await page.screenshot({ path: `${OUT}/qd_fechar.png` });
check('borda: vermelha ao fechar', await page.evaluate(() => getComputedStyle(document.querySelector('#itemquick [data-qdoor]')).borderTopColor === 'rgb(232, 69, 47)'), []);
await page.close();

// Lápide (Beyond the Grave)
page = await open(process.env.BTG ?? 'quartel-assombrado');
const tb = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
  const cell = g.board.allCells().find(x => g.tombAt(x) && !g.unitsAt(x).length);
  if (!cell) return { map: g.map.id, none: true };
  h.cell = { ...cell };
  c.renderer.sync();
  c.act({ type: 'activate', heroId: h.id });
  return { map: g.map.id, h: h.id };
});
console.log('lápide', JSON.stringify(tb));
await wait(1500);
b = await bar(page);
check('botão Revelar Lápide aparece', b.text.includes('Revelar Lápide'), b);
check('saiu do quadro do Herói', await page.evaluate(() => !document.querySelector('#hb-tomb')), []);
await page.screenshot({ path: `${OUT}/qd_lapide.png` });
const mp1 = await page.evaluate(() => window.cbt.game.s.activation.mp);
await page.click('#itemquick [data-qtomb]');
await wait(1200);
const t2 = await page.evaluate(() => { const g = window.cbt.game; return { mp: g.s.activation?.mp, can: g.canRevealTomb(), pop: !document.getElementById('tomb-pop').classList.contains('hidden') }; });
check('clique revela (gasta 1 PM ou efeito)', t2.pop && !t2.can, { ...t2, mp1 });
console.log(errors ? 'FALHOU' : 'PORTA E LÁPIDE OK');
await browser.close();
