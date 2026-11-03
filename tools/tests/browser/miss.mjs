// Ataque sem Ferimento: sem som do golpe, alvo desvia e aparece MISS. Com Ferimento: som normal, sem desvio. Vários alvos: só quem não foi ferido desvia (PORT=)
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const PORT = process.env.PORT ?? '5199';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('PAGEERR', e.message); });
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.evaluateOnNewDocument(() => {
  window.__sounds = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__sounds.push(this.src.split('/').pop()); return play.call(this); };
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(2500);
await page.evaluate(() => document.body.click());
const ids = await page.evaluate(() => {
  const c = window.cbt, r = c.renderer, g = c.game;
  const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell);
  const ms = g.units().filter(u => u.kind === 'monster' && u.alive && u.cell).slice(0, 2);
  h.cell = { c: ms[0].cell.c, r: Math.max(0, ms[0].cell.r - 1) };
  r.sync(); r.focus?.([ms[0].cell]); r.cam.zoom = 1.4;
  const q = r.unitScreenPos(ms[0].id); r.cam.x += 700 - q.x; r.cam.y += 420 - q.y;
  return { h: h.id, m: ms[0].id, m2: ms[1].id };
});
await wait(500);
const check = (name, ok, got) => { console.log(ok ? 'ok ' : 'FALHOU', name, JSON.stringify(got)); if (!ok) errors++; };
async function atk(cardName, attackType, targets, shot) {
  const ms = await page.evaluate((i, cardName, attackType, targets) => {
    window.__sounds.length = 0;
    const r = window.cbt.renderer;
    window.__dg = {};
    const ms = r.animateAttack({ attackerId: i.h, cardName, attackType, targets, hits: 2 });
    for (const t of targets) window.__dg[t.id] = !!r.units.get(t.id).dodge;
    return ms;
  }, ids, cardName, attackType, targets);
  const imp = await page.evaluate(() => window.cbt.renderer.lastImpact);
  await wait(imp + 120);
  const float = await page.evaluate(() => window.cbt.renderer.floaters.map(f => f.text));
  if (shot) await page.screenshot({ path: `${OUT}/${shot}.png` });
  await wait(ms + 400);
  return { sounds: await page.evaluate(() => window.__sounds.slice()), dodge: await page.evaluate(() => window.__dg), float };
}
const a1 = await atk('Lâmina Confiável', 'melee', [{ id: ids.m, wounds: 0 }], 'miss_melee');
check('errou (corpo a corpo): sem som, desvia, MISS', !a1.sounds.length && a1.dodge[ids.m] && a1.float.includes('MISS'), a1);
const a2 = await atk('Arco Crescente', 'ranged', [{ id: ids.m, wounds: 0 }], 'miss_arco');
check('errou (distância): sem som, desvia, MISS', !a2.sounds.length && a2.dodge[ids.m] && a2.float.includes('MISS'), a2);
const a3 = await atk('Raio Nova', 'ranged', [{ id: ids.m, wounds: 0 }]);
check('errou (magia): sem som', !a3.sounds.length && a3.float.includes('MISS'), a3);
const a4 = await atk('Lâmina Confiável', 'melee', [{ id: ids.m, wounds: 1 }]);
check('acertou: som normal, sem desvio', a4.sounds.includes('atack-sword.mp3') && !a4.dodge[ids.m] && !a4.float.includes('MISS'), a4);
const a5 = await atk('Raio Nova', 'ranged', [{ id: ids.m, wounds: 1 }, { id: ids.m2, wounds: 0 }]);
check('2 alvos, 1 ferido: som toca, só o outro desvia', a5.sounds.length > 0 && !a5.dodge[ids.m] && a5.dodge[ids.m2] && a5.float.filter(x => x === 'MISS').length === 1, a5);
console.log(errors ? 'FALHOU' : 'MISS OK');
await browser.close();
