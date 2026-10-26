// Escudo de Cavaleiro / do Rei: a pergunta aparece no painel dos dados, com os dados do ataque já rolados
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
const view = () => page.evaluate(() => {
  const box = document.getElementById('dicecenter');
  return { open: !box.classList.contains('hidden'), atkDice: box.querySelectorAll('.cd-row.atk .cd-die:not(.rolling)').length, defDice: box.querySelectorAll('.cd-def:not(.cd-off) .cd-die').length,
    btns: [...box.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t !== '🔍'), confirm: !document.getElementById('confirmbox').classList.contains('hidden'), sum: box.querySelector('.cd-def:not(.cd-off) .cd-sum')?.textContent ?? '' };
});
const click = re => page.evaluate(src => { const b = [...document.querySelectorAll('#dicecenter button')].find(x => new RegExp(src, 'i').test(x.textContent)); if (b) { b.click(); return b.textContent.trim(); } return null; }, re);
const res = {};
for (const [card, choice] of [['escudo_cavaleiro', 'Não usar'], ['escudo_rei', '^🛡️']]) {
  await page.evaluate(card => {
    const c = window.cbt, g = c.game;
    const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
    h.spent = false;
    h.cards = h.cards.filter(x => !/escudo_(cavaleiro|rei)/.test(x.defId));
    h.cards.push({ uid: 'sh-' + card, defId: card, exhausted: false, uses: 0 });
    const m = g.units().find(u => u.kind === 'monster' && u.alive && u.cell && /^(goblin|orc)/.test(u.defId));
    m.cell = { ...h.cell }; c.renderer.sync();
    const orig = g.roll.bind(g);
    g.roll = (...a) => a[2] !== 'shield' ? { faces: ['melee', 'melee', 'blank'], successes: 2, crits: 0 } : orig(...a);
    window.__h = h.id;
    c.withDecisions(() => { g.monsterAttack(g.unit(m.id), g.unit(h.id), 'alerta'); return true; }, () => { window.__spentNow = g.unit(window.__h).spent; window.__skill = g.s.log?.slice?.(-3); c.pushLocal(g.drain()); g.roll = orig; });
  }, card);
  let q = null;
  for (let i = 0; i < 30 && !q; i++) { await wait(300); const v = await view(); if (v.btns.some(b => /Não usar/.test(b))) q = v; }
  await page.screenshot({ path: `${OUT}/shield-${card}.png` });
  await click(choice);
  let def = 0, extraClick = false;
  for (let i = 0; i < 30; i++) { await wait(300); const v = await view(); def = Math.max(def, v.defDice); if (v.btns.some(b => /Rolar defesa/i.test(b))) extraClick = true; await click('Crítico|Manter$|✔ Manter|Rolar defesa'); if (!v.open && i > 3) break; }
  res[card] = { pergunta: q && { atkDice: q.atkDice, confirm: q.confirm, sum: q.sum.slice(0, 60) }, defDice: def, extraClick, spent: await page.evaluate(() => !!window.cbt.game.unit(window.__h).spent), spentNow: await page.evaluate(() => window.__spentNow), hero: await page.evaluate(() => window.__h) };
  await wait(1500);
}
console.log(JSON.stringify(res, null, 1));
const k = res.escudo_cavaleiro, r = res.escudo_rei;
console.log(k.pergunta?.atkDice === 3 && !k.pergunta.confirm && !k.spent && r.pergunta?.atkDice === 3 && !r.pergunta.confirm && r.spent && r.defDice > 0 ? 'ESCUDOS NO PAINEL OK' : 'FALHOU');
await browser.close();
