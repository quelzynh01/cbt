// Fúria de Combate do Grom: prints da aura (acendendo e parada, em cada cor de Guilda) e som da Rajada de Vento:
// o vento só toca no empurrão, nunca no ataque (PORT=)
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
const ids = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const hs = g.heroesOf(g.currentGuild().id).filter(u => u.alive && u.cell);
  const h = hs.find(u => u.defId !== 'grom') ?? hs[0];
  const m = g.units().filter(u => u.kind === 'monster' && u.alive && u.cell)[0];
  c.renderer.focus?.([m.cell]);
  return { h: h.id, m: m.id };
});
await wait(500);

// Rajada de Vento: o ataque não toca o vento; o empurrão toca
const winds = () => page.evaluate(() => window.__sounds.filter(s => s.startsWith('rajada')).length);
await page.evaluate(() => { document.body.click(); window.__sounds.length = 0; });
const ms = await page.evaluate(i => window.cbt.renderer.animateAttack({ attackerId: i.h, cardName: 'Rajada de Vento', attackType: 'ranged', targets: [{ id: i.m }], hits: 3 }), ids);
await wait(ms + 300);
const atk = await winds();
await page.evaluate(i => {
  const c = window.cbt, u = c.game.unit(i.m);
  c.renderer.enqueue([{ t: 'move', id: i.m, from: u.cell, to: u.cell, push: true }]);
}, ids);
await wait(800);
const push = await winds();
console.log('vento no ataque:', atk, '| depois do empurrão:', push);
if (atk !== 0 || push !== 1) errors++;

// Grom ferido, olhando de perto
const setup = guild => page.evaluate(g => {
  const c = window.cbt, r = c.renderer, gm = c.game;
  const u = gm.units().find(x => x.kind === 'hero' && x.alive && x.cell && x.defId === 'grom') ?? gm.units().find(x => x.kind === 'hero' && x.alive && x.cell);
  u.defId = 'grom'; u.wounds = 0;
  const v = r.units.get(u.id);
  v.defId = 'grom'; v.guild = g; v.wounds = 0; v.furyOn = false;
  r.focus?.([u.cell]);
  r.cam.zoom = 1.5;
  const p = u.cell, s = r.unitScreenPos(u.id);
  r.cam.x += 700 - s.x; r.cam.y += 480 - s.y;
  window.__g = { u, v, p };
  return gm.ab(u);
}, guild);
console.log('habilidade:', await setup('vermelho'));
await wait(300);
await page.screenshot({ path: `${OUT}/fury_00_sem.png`, clip: { x: 350, y: 80, width: 700, height: 640 } });
await page.evaluate(() => { window.__sounds.length = 0; const { u, v } = window.__g; u.wounds = 1; v.wounds = 1; });
for (const [t, name] of [[140, '01_acende'], [260, '02_acende'], [400, '03_acende']]) {
  await wait(t);
  await page.screenshot({ path: `${OUT}/fury_${name}.png`, clip: { x: 350, y: 80, width: 700, height: 640 } });
}
console.log('sons ao acender:', await page.evaluate(() => window.__sounds.join(',')));
for (const g of ['vermelho', 'azul', 'verde', 'laranja']) {
  await page.evaluate(g => { window.__g.v.guild = g; }, g);
  await wait(1500);
  await page.screenshot({ path: `${OUT}/fury_guild_${g}.png`, clip: { x: 350, y: 80, width: 700, height: 640 } });
}
console.log(errors ? 'FALHOU' : 'FÚRIA OK (veja os prints)');
await browser.close();
