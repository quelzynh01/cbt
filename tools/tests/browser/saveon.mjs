// Online com 2 janelas: anfitrião sai no meio da partida e na Fase de Melhorias, reabre a partida salva e o amigo volta para a vaga.
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
const toGame = async (label) => {
  for (let i = 0; i < 120; i++) {
    const a = await auto(host), b = await auto(cli);
    if (i % 10 === 0) console.log(label, i, a, b);
    const inGame = await host.evaluate(() => !!window.cbt?.game && !document.getElementById('hud').classList.contains('hidden') && !window.cbt.game.s.deploying?.length);
    if (inGame) return true;
    await wait(700);
  }
  return false;
};
await host.evaluate(() => document.getElementById('lb-start').click());
console.log('jogo começou', await toGame('mesa'));
await wait(2000);
// marca o estado para conferir depois
const mark = await host.evaluate(() => { const g = window.cbt.game; g.s.turn = 3; g.guild(g.s.guildOrder[0]).coins = 7; return { turn: g.s.turn, coins: g.guild(g.s.guildOrder[0]).coins, guild: g.s.guildOrder[0] }; });
await wait(4500);
const leave = async () => {
  await host.evaluate(() => { document.getElementById('op-leave').click(); });
  await wait(500);
  await host.evaluate(() => document.querySelector('.gd-yes')?.click());
  await wait(1500);
};
await leave();
console.log('amigo vê:', await cli.evaluate(() => document.querySelector('.lb-status')?.textContent || document.body.innerText.match(/anfitri[^\n]*/)?.[0]));
const saves = await host.evaluate(() => JSON.parse(localStorage.getItem('cbt.onlineSaves') ?? '[]').map(s => ({ code: s.lobby.code, turn: s.state?.turn, step: s.lobby.setup?.step, seats: s.lobby.seats.map(x => x.name) })));
console.log('saves', JSON.stringify(saves));
// "no dia seguinte": os dois recarregam a página
const reopen = async () => {
  await host.reload({ waitUntil: 'networkidle0' }); await cli.reload({ waitUntil: 'networkidle0' }); await wait(1500);
  await host.evaluate(() => document.getElementById('m-online').click()); await wait(600);
  await shot(host, 's1-saves');
  await host.evaluate(() => document.querySelector('[data-load]').click());
  let c2 = '';
  for (let i = 0; i < 40 && !c2; i++) { await wait(500); c2 = await host.evaluate(() => document.querySelector('.lb-codebox b')?.textContent ?? ''); }
  console.log('sala reaberta', c2);
  await cli.evaluate(c => { document.getElementById('m-online').click(); setTimeout(() => { document.getElementById('lb-name').value = 'Amigo'; document.getElementById('lb-code').value = c; document.getElementById('lb-join').click(); }, 400); }, c2);
  for (let i = 0; i < 40; i++) { await wait(500); if (await host.evaluate(() => /voltou/.test(document.querySelector('.lb-seats')?.innerText ?? ''))) break; }
  await wait(800);
  await shot(host, 's2-room'); await shot(cli, 's2-cli');
  console.log('sala:', await host.evaluate(() => document.querySelector('.lb-seats')?.innerText.replace(/\s+/g, ' ')));
  await host.evaluate(() => document.getElementById('lb-continue').click());
  await wait(4000);
};
await reopen();
const after = await host.evaluate(g0 => { const g = window.cbt.game; return { turn: g.s.turn, coins: g.guild(g0).coins }; }, mark.guild);
const cliAfter = await cli.evaluate(() => ({ inGame: !document.getElementById('hud').classList.contains('hidden'), turn: window.cbt?.game?.s.turn, mine: window.cbt?.myGuild }));
console.log('antes', JSON.stringify(mark), 'depois host', JSON.stringify(after), 'amigo', JSON.stringify(cliAfter));
await shot(host, 's3-host'); await shot(cli, 's3-cli');
// termina o mapa -> Fase de Melhorias -> sai e volta na mesa
await host.evaluate(() => {
  const c = window.cbt, g = c.game, me = c.myGuild;
  for (const m of g.s.missions.filter(m => m.kind === 'pve').slice(0, 2)) g.completeMission(me, m.id);
  g.s.pending = null; g.endTurn(); c.pushLocal(g.drain());
});
await wait(4000);
await host.evaluate(() => document.getElementById('go-camp')?.click());
await wait(3000);
const step1 = await host.evaluate(() => JSON.parse(localStorage.getItem('cbt.onlineSaves'))[0]?.lobby.setup?.step);
console.log('salvo na mesa, passo:', step1);
await host.evaluate(() => document.querySelector('.mp-back')?.click()); await wait(1500);
await reopen();
console.log('mesa depois de voltar: host', await host.evaluate(() => window.cbtLobby.lobby?.setup?.step), 'amigo', await cli.evaluate(() => window.cbtLobby.lobby?.setup?.step));
await shot(host, 's4-host'); await shot(cli, 's4-cli');
await browser.close();
