// Lorde Presas atinge 2 Heróis: o ataque rola 1 vez; cada um defende na sua vez (o painel troca o defensor, sem voltar)
// e ataque sem acertos: a pergunta "rolar a Defesa?" aparece no painel depois dos dados do ataque
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
const view = () => page.evaluate(() => {
  const box = document.getElementById('dicecenter');
  const vis = [...box.querySelectorAll('.cd-def')].filter(x => !x.classList.contains('cd-off')).map(x => x.dataset.tid);
  return { open: !box.classList.contains('hidden'), atkDice: box.querySelectorAll('.cd-row.atk .cd-die').length, atkRolling: box.querySelectorAll('.cd-row.atk .cd-die.rolling').length, defs: vis,
    btns: [...box.querySelectorAll('button')].map(b => b.textContent.trim()) };
});
const click = re => page.evaluate(src => { const b = [...document.querySelectorAll('#dicecenter button')].find(x => new RegExp(src, 'i').test(x.textContent)); if (b) { b.click(); return b.textContent.trim(); } return null; }, re);

// --- 1) Lorde Presas em 2 Heróis
await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const hs = g.heroesOf(g.currentGuild().id).filter(u => u.alive);
  const lord = g.units().find(u => u.kind === 'monster' && u.alive && u.defId.startsWith('lorde_presas'));
  const near = g.board.neighbors(lord.cell).filter(x => g.board.isClose(lord.cell, x) && g.board.playable(x) && !g.board.isPillar(x) && !g.unitsAt(x).length);
  hs[0].cell = { ...near[0] }; hs[1].cell = { ...near[0] };
  for (const h of hs.slice(0, 2)) h.cards.push({ uid: 'rr-' + h.id, defId: 'coracao_unicornio', exhausted: false, uses: 0 });
  c.renderer.sync();
  const orig = g.roll.bind(g);
  let first = true;
  g.roll = (...a) => { if (a[2] !== 'shield') return { faces: ['ranged', 'ranged', 'ranged', 'blank'], successes: 3, crits: 0 }; return orig(...a); };
  g.choiceHook = r => r.choice === 'multi' ? 1 : 'auto';
  window.__ids = hs.slice(0, 2).map(h => h.id);
  c.withDecisions(() => { g.monsterAttack(lord, hs[0], 'vinganca'); return true; }, () => c.pushLocal(g.drain()));
});
const log = [];
let maxAtk = 0, rerolledAtk = false, backToFirst = false, seen = [];
for (let i = 0; i < 80; i++) {
  await wait(400);
  const v = await view();
  if (!v.open) { if (seen.length >= 2) break; continue; }
  maxAtk = Math.max(maxAtk, v.atkDice);
  if (v.atkRolling && seen.length >= 1) rerolledAtk = true;
  const cur = v.defs.length === 1 ? v.defs[0] : null;
  if (cur && seen[seen.length - 1] !== cur) { if (seen.includes(cur)) backToFirst = true; seen.push(cur); log.push(`defensor: ${cur}`); await page.screenshot({ path: `${OUT}/splash-${seen.length}.png` }); }
  if (i % 4 === 0) log.push(`[${v.open ? 'open' : 'closed'} ${v.defs.join('/')} ${v.btns.filter(b => b !== '🔍').join(',')}]`);
  const c = await click('Rolar defesa|Manter$|✔ Manter|Continuar');
  if (c) log.push(c);
}
console.log(log.join(' | '));
console.log({ seen, maxAtk, rerolledAtk, backToFirst });
const ok1 = seen.length === 2 && !rerolledAtk && !backToFirst;

// --- 2) ataque sem acertos: dados do Goblin aparecem e a pergunta vem no painel
await wait(1500);
await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
  const m = g.units().find(u => u.kind === 'monster' && u.alive && u.cell && !u.defId.startsWith('lorde'));
  m.cell = { ...h.cell };
  c.renderer.sync();
  const orig = g.roll.bind(g);
  let first = true;
  g.roll = (...a) => { if (a[2] !== 'shield') return { faces: Array(a[0]).fill('blank'), successes: 0, crits: 0 }; return orig(...a); };
  c.withDecisions(() => { g.monsterAttack(m, h, 'alerta'); return true; }, () => c.pushLocal(g.drain()));
});
let q = null;
for (let i = 0; i < 20 && !q; i++) { await wait(400); const v = await view(); if (v.btns.some(b => /Rolar a Defesa/.test(b))) q = v; }
console.log('sem acertos:', JSON.stringify(q));
await page.screenshot({ path: `${OUT}/nohits.png` });
const ok2 = !!q && q.atkDice > 0 && q.btns.some(b => /Manter/.test(b));
let ok3 = true;
if (process.env.ROLL) {
  await click('Rolar a Defesa');
  let def = 0, extraClick = false;
  for (let i = 0; i < 20; i++) { await wait(300); const v = await view(); if (v.btns.some(b => /Rolar defesa/i.test(b))) extraClick = true; def = Math.max(def, await page.evaluate(() => document.querySelectorAll('#dicecenter .cd-def:not(.cd-off) .cd-die').length)); await click('Crítico|Manter$|✔ Manter'); }
  console.log('rolou a Defesa:', def, 'dados; pediu outro clique?', extraClick);
  ok3 = def > 0 && !extraClick;
} else await click('Manter');
await wait(2500);
console.log(ok1 && ok2 && ok3 ? 'DEFESAS INDIVIDUAIS OK' : 'FALHOU');
await browser.close();
