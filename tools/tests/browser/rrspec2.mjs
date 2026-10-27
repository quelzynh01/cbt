// Online com 2 janelas: o anfitrião acompanha a rolagem e a escolha de Rerrolagem do amigo.
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function mkPage(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1300, height: 820 });
  page.on('pageerror', e => console.log(name, 'PAGEERR', e.message));
  
  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
  await page.evaluate(m => localStorage.setItem('cbt.settings', JSON.stringify({ battle: m })), process.env.BATTLE ?? 'always');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  return page;
}
const host = await mkPage('HOST');
const cli = await mkPage('AMIGO');
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
// cria a sala
await host.evaluate(() => { document.getElementById('m-online').click(); });
await wait(500);
await host.evaluate(() => { const i = document.getElementById('lb-name'); i.value = 'Anfitriao'; document.getElementById('lb-create').click(); });
let code = '';
for (let i = 0; i < 40 && !code; i++) { await wait(500); code = await host.evaluate(() => document.querySelector('.lb-codebox b')?.textContent ?? ''); }
console.log('sala', code);
if (!code) { await shot(host, 'o-fail'); process.exit(1); }
await cli.evaluate(c => { document.getElementById('m-online').click(); setTimeout(() => { document.getElementById('lb-name').value = 'Amigo'; document.getElementById('lb-code').value = c; document.getElementById('lb-join').click(); }, 400); }, code);
for (let i = 0; i < 40; i++) { await wait(500); const n = await host.evaluate(() => document.querySelectorAll('.lb-seat:not(.empty)').length); if (n >= 2) break; }
console.log('amigo entrou');
await host.evaluate(() => document.getElementById('lb-start').click());
// robô da mesa: clica no que estiver disponível
const auto = p => p.evaluate(() => {
  const q = s => document.querySelector(s);
  const click = el => { if (el && !el.disabled) { el.click(); return true; } return false; };
  const anyway = [...document.querySelectorAll('button')].find(b => /assim mesmo/.test(b.textContent));
  if (anyway) { anyway.click(); return 'confirm'; }
  if (q('[data-h]') && q('#tb-pick')) { if (q('#tb-pick').disabled) click(q('[data-h]')); else click(q('#tb-pick')); return 'pick'; }
  if (q('.tb-votes [data-v]') && !q('.tb-votes [data-v].sel')) { click(q('.tb-votes [data-v]')); return 'vote'; }
  if (click(q('#tb-equip'))) return 'equip';
  if (q('.cr-back.next')) { click(q('.cr-back.next')); return 'flip'; }
  const up = [...document.querySelectorAll('[data-up]')];
  if (up.length && q('#up-go')) {
    const buy = /Comprar/.test(q('#up-go').textContent);
    if (!q('#up-go').disabled) { click(q('#up-go')); return 'up'; }
    if (buy) { click(up.find(e => e.classList.contains('sel'))); return 'up-'; }
    click(up.find(e => !e.classList.contains('sel'))); return 'up+';
  }
  if (click(q('[data-next]'))) return 'next';
  const cont = [...document.querySelectorAll('.tb-actions button')].find(b => !b.disabled);
  if (cont) { cont.click(); return 'cont'; }
  const yes = [...document.querySelectorAll('button')].find(b => /Sim, terminar/.test(b.textContent));
  if (yes) { yes.click(); return 'deploy2'; }
  if (click(q('.rl-go'))) return 'roleta';
  if (click(q('#dp-ok'))) return 'deploy';
  return document.querySelector('#hud:not(.hidden)') ? 'jogo' : '-';
});
// até a partida começar nas duas janelas
for (let i = 0; i < 120; i++) {
  const a = await auto(host), b = await auto(cli);
  if (i % 10 === 0) console.log('mesa', i, a, b);
  const inGame = await host.evaluate(() => !!window.cbt?.game && !document.getElementById('hud').classList.contains('hidden') && !window.cbt.game.s.deploying?.length);
  if (inGame) break;
  await wait(700);
}
await wait(3000);
await shot(host, 'o1-host-game'); await shot(cli, 'o1-cli-game');


// um Monstro ataca o Herói do AMIGO, que tem Rerrolagem: o amigo decide; o anfitrião acompanha
await host.evaluate(() => {
  const c = window.cbt, g = c.game;
  const other = g.s.guildOrder.find(x => x !== c.myGuild);
  const h = g.heroesOf(other).find(u => u.alive && u.cell);
  h.cards = [{ uid: 'rrx', defId: 'espada_capitao', exhausted: false, uses: 0 }];
  const m = g.units().find(u => u.kind === 'monster' && u.alive && /^(orc|goblin)/.test(u.defId));
  m.cell = { ...h.cell };
  c.pushLocal([]);
  setTimeout(() => c.withDecisions(() => { g.monsterAttack(m, h, 'alerta'); return true; }, () => c.pushLocal(g.drain())), 1500);
});
// anfitrião: o ataque aparece rolando? e o painel continua o mesmo até o resultado (não reabre)?
await host.evaluate(() => {
  window.__atkRolling = false; window.__rebuilt = 0; window.__mark = null;
  const tick = () => {
    const box = document.getElementById('dicecenter');
    if (box.querySelector('.cd-row.atk .cd-die.rolling')) window.__atkRolling = true;
    const cb = box.querySelector('.cd-box');
    if (window.__mark && cb && !cb.dataset.mark) window.__rebuilt++;
    if (window.__mark && cb) cb.dataset.mark = '1';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const log = [];
let sawChoosing = false, rerolled = false;
for (let i = 0; i < 60; i++) {
  await wait(500);
  const txt = await host.evaluate(() => document.getElementById('dicecenter').innerText.replace(/\s+/g, ' ').slice(-120));
  if (/escolhendo (quais dados|se mantém)/.test(txt) && !sawChoosing) { sawChoosing = true; await host.evaluate(() => { window.__mark = 1; const cb = document.querySelector('#dicecenter .cd-box'); if (cb) cb.dataset.mark = '1'; }); }
  log.push(txt.slice(0, 80));
  // o amigo: rola; na escolha da Rerrolagem, marca 1 dado e rerrola (ou mantém se não houver)
  const c = await cli.evaluate(() => {
    const rr = document.querySelector('#cd-rr');
    if (rr) { if (rr.disabled) { const d = document.querySelector('#dicecenter .cd-def .cd-die.pickable, #dicecenter .cd-die.pickable'); d?.click(); return 'pick'; } rr.click(); return 'rr'; }
    const keep = document.querySelector('#cd-keep'); if (keep) { keep.click(); return 'keep'; }
    const b = document.querySelector('.cd-roll'); if (b) { b.click(); return b.textContent; } return '';
  });
  if (c === 'rr') { rerolled = true; log.push('amigo: rerrolou'); }
  if ((c === 'rr' || c === 'keep') && sawChoosing) break;
}
await wait(6000);
const res = await host.evaluate(() => ({ atkRolling: window.__atkRolling, rebuilt: window.__rebuilt, final: document.querySelector('#dicecenter .cd-final')?.textContent ?? '' }));
for (const l of log.slice(-6)) console.log(l);
console.log('anfitrião:', JSON.stringify(res), 'amigo rerrolou?', rerolled);
await shot(host, 'rr2-host');
console.log(sawChoosing && res.atkRolling && res.rebuilt === 0 ? 'ACOMPANHAR SEM SPOILER OK' : 'FALHOU');
await browser.close();
