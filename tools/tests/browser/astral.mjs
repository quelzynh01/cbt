// Golpe Astral: a projeção do Herói surge junto do alvo e golpeia; o corpo fica no lugar
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const PORT = process.env.PORT ?? '5199';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(2500);
const info = await page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const [h, ally] = g.heroesOf(g.currentGuild().id).filter(u => u.alive && u.cell);
  h.cards[0] = { uid: 'astral-test', defId: 'golpe_astral', exhausted: false, uses: 0 };
  c.act({ type: 'activate', heroId: h.id });
  // alvo longe do Herói, Perto do Aliado
  const m = g.units().filter(u => u.kind === 'monster' && u.alive && u.cell && Math.abs(u.cell.c - h.cell.c) + Math.abs(u.cell.r - h.cell.r) > 2).sort((p, q) => Math.abs(p.cell.c + p.cell.r - 8) - Math.abs(q.cell.c + q.cell.r - 8))[0];
  ally.cell = { ...m.cell };
  c.renderer.sync?.();
  window.__evs = [];
  const orig = c.renderer.enqueue.bind(c.renderer);
  c.renderer.enqueue = evs => { window.__evs.push(...evs); return orig(evs); };
  window.__h = h.id;
  return { h: h.id, m: m.id, ok: g.attackTargets(h, h.cards[0]).some(t => t.id === m.id), cell: h.cell };
});
console.log(info);
await wait(600);
await page.evaluate(() => { window.__slow = true; });
await page.evaluate(i => {
  const c = window.cbt, h = c.game.unit(i.h);
  c.renderer.focus?.([h.cell, c.game.unit(i.m).cell]);
  if (window.__slow) c.renderer.speed = 0.2; // devagar, para os prints pegarem cada fase
  const st = document.createElement('style'); st.textContent = '#cardview { display: none !important; }'; document.head.append(st);
  c.act({ type: 'attack', cardUid: 'astral-test', targetId: i.m });
}, info);
let shots = 0, seen = 0, body = null, flag = false;
for (let k = 0; k < 400 && shots < 6; k++) {
  await wait(60);
  const s = await page.evaluate(id => {
    document.querySelectorAll('#dicecenter button').forEach(b => { if (!b.disabled && !/Cancelar/i.test(b.textContent || '')) b.click(); });
    const r = window.cbt.renderer, u = r.units.get(id);
    return { n: r.astrals.length, k: r.astrals[0] ? (r.t - r.astrals[0].t0) / r.astrals[0].dur : -1, gx: u.pos.gx, gy: u.pos.gy, lunge: !!u.lunge, flag: window.__evs.some(e => e.t === 'attack' && e.astral) };
  }, info.h);
  flag = flag || s.flag;
  if (s.n) {
    seen++;
    if (s.lunge) body = 'investiu';
    if (s.k >= shots * 0.16) { await page.screenshot({ path: `${OUT}/astral${shots}.png` }); console.log('print', shots, 'k=', s.k.toFixed(2)); shots++; }
  }
}
console.log({ seen, shots, flag, body });
console.log(seen && flag && !body ? 'GOLPE ASTRAL OK' : 'FALHOU');
await browser.close();
