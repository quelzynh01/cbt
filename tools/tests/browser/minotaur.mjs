// Arena do Sol Brilhante: Minotauro escondido no posicionamento e surge com a fala; ✷ = risada; matou Herói = fala
// + Vapor: "Esquivar?" antes do Alerta
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
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'arena-do-sol-brilhante', heroes: ['vapor', 'grom', 'maya'] }); });
await wait(4000);
const before = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const mino = g.units().find(u => u.kind === 'monster' && u.defId.startsWith('minotauro'));
  window.__played = [];
  const A = window.Audio.prototype.play;
  window.Audio.prototype.play = function () { window.__played.push(this.src.split('/').pop()); return A.call(this); };
  return { id: mino.id, alpha: c.renderer.units.get(mino.id).alpha, deploying: g.s.deploying?.length ?? 0 };
});
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(1600);
await page.screenshot({ path: `${OUT}/mino-entrada.png` });
await wait(3500);
const entry = await page.evaluate(id => ({ alpha: window.cbt.renderer.units.get(id).alpha, played: window.__played.slice() }), before.id);
console.log('entrada:', JSON.stringify({ before, entry }));
const clickAll = async () => { for (let i = 0; i < 50; i++) { await wait(300); await page.evaluate(() => { const b = [...document.querySelectorAll('#dicecenter button')].find(x => /Rolar defesa|Manter|Crítico|Não usar/i.test(x.textContent)); b?.click(); }); if (i > 4 && await page.evaluate(() => document.getElementById('dicecenter').classList.contains('hidden'))) break; } };
// ✷ e morte: Minotauro ataca Grom com 3 ✷ e dano alto
await page.evaluate(id => {
  const c = window.cbt, g = c.game, m = g.unit(id);
  const h = g.heroesOf(g.currentGuild().id).find(u => u.defId === 'grom');
  h.cell = { ...m.cell }; h.wounds = g.maxHp(h) - 1; c.renderer.sync();
  const orig = g.roll.bind(g);
  g.roll = (...a) => a[2] !== 'shield' ? { faces: ['crit', 'crit', 'melee'], successes: 3, crits: 2 } : { faces: ['blank', 'blank'], successes: 0, crits: 0 };
  window.__played = [];
  c.withDecisions(() => { g.monsterAttack(g.unit(m.id), g.unit(h.id), 'alerta'); return true; }, () => { c.pushLocal(g.drain()); g.roll = orig; });
}, before.id);
await clickAll();
await wait(2500);
const fight = await page.evaluate(() => window.__played.slice());
console.log('ataque:', fight.join(','));
// Vapor: Esquivar?
const dodge = await page.evaluate(id => {
  const c = window.cbt, g = c.game, m = g.unit(id);
  const v = g.heroesOf(g.currentGuild().id).find(u => u.defId === 'vapor');
  v.cell = { ...m.cell }; g.s.activation = null; g.s.stealthUsed = [];
  c.act({ type: 'activate', heroId: v.id });
  c.renderer.sync(); c.refresh();
  if (!g.s.activation) return 'sem ativação';
  const dest = [...g.reachable(v, g.s.activation.mp, v.cell, false)].map(([, n]) => n).find(n => n.canEnd && n.prev !== null);
  if (!dest) return 'sem destino';
  c.act({ type: 'move', cell: dest.cell });
  return true;
}, before.id);
await wait(1200);
const q = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /Esquivar|guardar/.test(t)));
await page.screenshot({ path: `${OUT}/vapor-esquivar.png` });
console.log('Vapor pergunta:', JSON.stringify(q), dodge);
const ok = before.deploying > 0 && before.alpha === 0 && entry.alpha === 1 && entry.played.some(s => s.startsWith('centaur-entrance'))
  && fight.some(s => s.startsWith('centaur-lol')) && fight.some(s => s.startsWith('centaur-kills')) && q.length === 2;
console.log(ok ? 'MINOTAURO E VAPOR OK' : 'FALHOU');
await browser.close();
