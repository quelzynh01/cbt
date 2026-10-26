// Distrito Sempressombrio: Alma do Lorde Presas (espírito azul); ataque do Lorde = morcego vai e volta (som próprio);
// Irmãs: ✷ no ataque = risada (sorteada); no golpe, o som do ataque e depois a fala de cada Irmã
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'distrito-sempressombrio' }); });
await wait(4000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(6000);
const info = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  window.__played = [];
  const A = window.Audio.prototype.play;
  window.Audio.prototype.play = function () { window.__played.push(this.src.split('/').pop()); return A.call(this); };
  const lord = g.units().find(u => u.kind === 'monster' && u.defId.startsWith('lorde_presas'));
  c.renderer.focus([lord.cell], 1.2);
  return { name: g.name(lord), soul: !!lord.soul, id: lord.id };
});
await wait(800);
await page.screenshot({ path: `${OUT}/soul.png`, clip: { x: 450, y: 150, width: 500, height: 420 } });
console.log('Lorde:', JSON.stringify(info));
const clickAll = async () => { for (let i = 0; i < 40; i++) { await wait(300); await page.evaluate(() => { const b = [...document.querySelectorAll('#dicecenter button')].find(x => /Rolar defesa|Manter|Crítico/i.test(x.textContent)); b?.click(); }); if (await page.evaluate(() => document.getElementById('dicecenter').classList.contains('hidden'))) break; } };
// ataque do Lorde: morcego
await page.evaluate(id => {
  const c = window.cbt, g = c.game, lord = g.unit(id);
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
  const spot = g.board.allCells().filter(x => g.board.playable(x) && !g.board.isPillar(x) && !g.unitsAt(x).length && g.monsterCanAttack(lord, { ...h, cell: x })).sort((p, q) => (Math.abs(p.c - lord.cell.c) + Math.abs(p.r - lord.cell.r)) - (Math.abs(q.c - lord.cell.c) + Math.abs(q.r - lord.cell.r)))[0];
  h.cell = { ...spot };
  c.renderer.sync();
}, info.id);
await wait(800);
await page.evaluate(id => {
  const c = window.cbt, g = c.game, lord = g.unit(id);
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
  window.__played = [];
  window.__bat = false;
  const r = c.renderer;
  const look = () => { if (r.projectiles.some(p => p.kind === 'bat')) { window.__bat = true; r.speed = 0.25; r.focus([lord.cell, h.cell], 0.9); } else requestAnimationFrame(look); };
  requestAnimationFrame(look);
  c.withDecisions(() => { g.monsterAttack(lord, h, 'vinganca'); return true; }, () => c.pushLocal(g.drain()));
}, info.id);
let batSeen = false;
for (let i = 0; i < 150 && !batSeen; i++) { await wait(60); await page.evaluate(() => { const b = [...document.querySelectorAll('#dicecenter button')].find(x => /Rolar defesa|Manter|Crítico/i.test(x.textContent)); b?.click(); }); await wait(0); batSeen = await page.evaluate(() => window.__bat); if (batSeen) { for (let f = 0; f < 6; f++) { await wait(180); await page.evaluate(() => { const c = window.cbt, r = c.renderer, p = r.projectiles.find(x => x.kind === 'bat'); if (p) { r.camGoal = null; const v = r.view(); r.cam.x = v.cx - (p.from.x + p.to.x) / 2 * r.cam.zoom; r.cam.y = v.cy - (p.from.y + p.to.y) / 2 * r.cam.zoom; } }); await page.screenshot({ path: `${OUT}/bat${f}.png`, clip: { x: 300, y: 120, width: 800, height: 520 } }); } await page.evaluate(() => { window.cbt.renderer.speed = 1; }); } }
await clickAll();
await wait(1500);
const lordSounds = await page.evaluate(() => window.__played.slice());
console.log('morcego visto:', batSeen, 'sons:', lordSounds.join(','));
// Irmãs: sem acertos (risada) e com ✷ (fala)
const sister = async crit => {
  await page.evaluate(cr => {
    const c = window.cbt, g = c.game;
    const m = g.units().find(u => u.kind === 'monster' && u.alive && u.cell && u.defId.startsWith('irma_dor'));
    const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
    m.cell = { ...h.cell }; c.renderer.sync();
    const orig = g.roll.bind(g);
    g.roll = (...a) => a[2] !== 'shield' ? (cr ? { faces: ['crit', 'blank', 'blank', 'blank'], successes: 1, crits: 1 } : { faces: Array(a[0]).fill('blank'), successes: 0, crits: 0 }) : { faces: ['shield', 'shield', 'shield'], successes: 3, crits: 0 };
    window.__played = [];
    c.withDecisions(() => { g.monsterAttack(m, h, 'alerta'); return true; }, () => { c.pushLocal(g.drain()); g.roll = orig; });
  }, crit);
  await clickAll();
  await wait(4500);
  return page.evaluate(() => window.__played.slice());
};
const s1 = await sister(false), s2 = await sister(true);
console.log('Irmã sem acertos:', s1.join(','), '| com ✷:', s2.join(','));
const ok = info.soul && /Alma/.test(info.name) && batSeen && lordSounds.includes('atack-lorde-pressas.mp3')
  && s1.some(x => x.startsWith('atack-sister')) && !s1.some(x => x.startsWith('lol-sister')) && s1.indexOf('sister-dor-crit.mp3') > s1.findIndex(x => x.startsWith('atack-sister'))
  && s2.some(x => x.startsWith('lol-sister')) && s2.includes('sister-dor-crit.mp3');
console.log(ok ? 'ALMA, MORCEGO E SONS OK' : 'FALHOU');
await browser.close();
