// Mansão: entrada do Troll (troll-entrance); ataque em 1 Herói = troll-ataque; em 2 = troll-lol; atacado sem dano = troll-lol
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'mansao', heroes: ['vapor', 'grom', 'maya'] }); });
await wait(4000);
await page.evaluate(() => {
  window.__played = [];
  const A = window.Audio.prototype.play;
  window.Audio.prototype.play = function () { window.__played.push(this.src.split('/').pop()); return A.call(this); };
});
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(6000);
const entry = await page.evaluate(() => window.__played.slice());
const clickAll = async () => { for (let i = 0; i < 50; i++) { await wait(300); await page.evaluate(() => { const b = [...document.querySelectorAll('#dicecenter button')].find(x => /Rolar defesa|Rolar ataque|Manter|Crítico|Não usar/i.test(x.textContent)); b?.click(); }); if (i > 4 && await page.evaluate(() => document.getElementById('dicecenter').classList.contains('hidden'))) break; } await wait(3500); };
const run = async (n, heroAttacks) => {
  await page.evaluate((n, heroAttacks) => {
    const c = window.cbt, g = c.game;
    const t = g.units().find(u => u.kind === 'monster' && u.alive && u.defId.startsWith('troll'));
    const hs = g.heroesOf(g.currentGuild().id).filter(u => u.alive).slice(0, n);
    for (const h of hs) { h.cell = { ...t.cell }; h.wounds = 0; }
    t.wounds = 0;
    c.renderer.sync();
    const orig = g.roll.bind(g);
    g.roll = (...a) => heroAttacks
      ? (a[2] !== 'shield' ? { faces: ['blank', 'blank'], successes: 0, crits: 0 } : orig(...a))
      : (a[2] !== 'shield' ? { faces: ['melee', 'blank', 'blank'], successes: 1, crits: 0 } : { faces: ['shield', 'shield'], successes: 2, crits: 0 });
    window.__played = [];
    if (heroAttacks) {
      const h = hs[0];
      g.s.activation = null;
      c.act({ type: 'activate', heroId: h.id });
      const card = g.usableCards(g.unit(h.id)).find(x => g.attackTargets(g.unit(h.id), x).some(u => u.id === t.id));
      c.act({ type: 'attack', cardUid: card.uid, targetId: t.id });
      setTimeout(() => { g.roll = orig; }, 15000);
    } else c.withDecisions(() => { g.monsterAttack(g.unit(t.id), g.unit(hs[0].id), 'alerta'); return true; }, () => { c.pushLocal(g.drain()); g.roll = orig; });
  }, n, heroAttacks);
  await clickAll();
  return page.evaluate(() => window.__played.filter(s => s.startsWith('troll')));
};
const one = await run(1, false), two = await run(2, false), hit = await run(1, true);
console.log(JSON.stringify({ entry: entry.filter(s => s.startsWith('troll') || s.startsWith('orc')), one, two, hit }));
const ok = entry.some(s => s.startsWith('troll-entrance')) && !entry.includes('orc-sound.mp3') && one.some(s => s.startsWith('troll-ataque')) && two.some(s => s.startsWith('troll-lol')) && hit.some(s => s.startsWith('troll-lol'));
console.log(ok ? 'SONS DO TROLL OK' : 'FALHOU');
await browser.close();
