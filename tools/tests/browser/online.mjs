// Campanha online de verdade (PeerJS): anfitrião + amigo em janelas separadas.
// Joga a mesa sozinho, termina o 1º mapa à força e confere se o amigo continua conectado na Fase de Melhorias.
// DROP=1: derruba a conexão do amigo na fase de melhorias e confere a volta.
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function mkPage(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1300, height: 820 });
  page.on('pageerror', e => console.log(name, 'PAGEERR', e.message));
  page.on('console', m => { const t = m.text(); if (/peer|conex|Conex|ERR|rror/i.test(t) && !/404|favicon/.test(t)) console.log(name, 'console:', t.slice(0, 160)); });
  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
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
// termina o 1º mapa: o anfitrião cumpre 2 Missões e encerra
await host.evaluate(() => {
  const c = window.cbt, g = c.game, me = g.s.guildOrder.find(x => g.guild(x).controller === 'human' && x === c.myGuild) ?? 'azul';
  for (const m of g.s.missions.filter(m => m.kind === 'pve').slice(0, 2)) g.completeMission(me, m.id);
  g.s.pending = null;
  g.endTurn();
  c.pushLocal(g.drain());
});
await wait(4000);
await shot(host, 'o2-host-over'); await shot(cli, 'o2-cli-over');
console.log('fim do mapa: amigo vê', await cli.evaluate(() => document.getElementById('gameover')?.innerText.slice(0, 120).replace(/\n/g, ' ')));
await host.evaluate(() => document.getElementById('go-camp')?.click());
await wait(2500);
const state = async () => ({
  host: await host.evaluate(() => [...document.querySelectorAll('.lb-seat, .tb-seat, .op-seat')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 60)).join(' | ') || document.querySelector('.lb-status')?.textContent),
  cli: await cli.evaluate(() => (document.querySelector('.lb-status')?.textContent ?? '') + ' / ' + (document.querySelector('.cp-step h3, .tb-step h3, h3')?.textContent ?? '')),
});
console.log('depois do mapa', await state());
if (process.env.DROP) {
  // simula o celular dormindo: corta a conexão do amigo
  if (process.env.DROP === '2') await cli.evaluate(() => { window.cbtLobby.session.peer.destroy(); });
  else await cli.evaluate(() => { const s = window.cbtLobby.session; s.conn?.peerConnection?.close(); s.conn?.close(); });
  console.log('conexão do amigo cortada');
  for (let i = 1; i <= 8; i++) { await wait(4000); const st = await state(); console.log(`${i * 4}s depois`, st.cli); if (/Reconectado/.test(st.cli)) break; }
}
// joga a Fase de Melhorias até o próximo mapa
for (let i = 0; i < 160; i++) {
  const a = await auto(host), b = await auto(cli);
  if (i % 15 === 0) console.log('melhorias', i, a, b, JSON.stringify(await state()).slice(0, 220));
  const inGame = await cli.evaluate(() => !!window.cbt?.game && !document.getElementById('hud').classList.contains('hidden'));
  if (inGame && a === 'jogo') { console.log('2º mapa começou nas duas janelas ✔'); break; }
  await wait(700);
}
await shot(host, 'o3-host'); await shot(cli, 'o3-cli');
await browser.close();
