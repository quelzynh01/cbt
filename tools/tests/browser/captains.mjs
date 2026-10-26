// MAP/TYPE/N (padrão Portão da Lua, capitao_orc, 2): os Monstros de destaque escondidos no posicionamento, surgem juntos (som de orc) e ficam com aura de lava
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
await page.evaluate(map => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: map }); }, process.env.MAP ?? 'portao-da-lua');
await wait(4000);
await page.evaluate(t => { window.__type = t; }, process.env.TYPE ?? 'capitao_orc');
const before = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const caps = g.units().filter(u => u.kind === 'monster' && new RegExp('^(' + window.__type + ')').test(u.defId));
  window.__played = [];
  const A = window.Audio.prototype.play;
  window.Audio.prototype.play = function () { window.__played.push(this.src.split('/').pop()); return A.call(this); };
  return { ids: caps.map(u => u.id), alpha: caps.map(u => c.renderer.units.get(u.id).alpha) };
});
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
// linha do tempo: quando cada um aparece (alpha > 0.5)
await page.evaluate(ids => {
  const r = window.cbt.renderer; window.__seen = {}; const t0 = performance.now();
  const tick = () => { for (const id of ids) if (!window.__seen[id] && r.units.get(id)?.alpha > 0.5) window.__seen[id] = Math.round(performance.now() - t0); if (Object.keys(window.__seen).length < ids.length) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}, before.ids);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(1700);
await page.screenshot({ path: `${OUT}/cap-entrada.png` });
const mid = await page.evaluate(ids => ids.map(id => window.cbt.renderer.units.get(id).alpha), before.ids);
await wait(3500);
const after = await page.evaluate(ids => ({ alpha: ids.map(id => window.cbt.renderer.units.get(id).alpha), played: window.__played.slice() }), before.ids);
await page.evaluate(ids => { const c = window.cbt; c.renderer.focus([c.game.unit(ids[0]).cell], 1.2); }, before.ids);
await wait(700);
await page.screenshot({ path: `${OUT}/aura-${process.env.MAP ?? 'portao-da-lua'}.png`, clip: { x: 450, y: 180, width: 500, height: 420 } });
const seen = await page.evaluate(() => window.__seen);
const times = before.ids.map(id => seen[id]);
console.log(JSON.stringify({ before, after, times, first: await page.evaluate((ids, seen) => { const g = window.cbt.game; const f = ids.slice().sort((a, b) => seen[a] - seen[b])[0]; return g.unit(f).defId; }, before.ids, seen) }));
const sequential = times.length < 2 || Math.abs(times[1] - times[0]) > 900;
const ok = sequential && before.ids.length === Number(process.env.N ?? 2) && before.alpha.every(a => a === 0) && after.alpha.every(a => a === 1) && after.played.some(s => (process.env.SND ?? 'orc-sound').split(',').every(p => after.played.some(x => x.startsWith(p)))) && !after.played.some(s => s.startsWith('lorde'));
console.log(ok ? `ENTRADA E AURA OK (${process.env.MAP ?? 'portao-da-lua'})` : 'FALHOU');
await browser.close();
