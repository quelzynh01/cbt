// Online com 2 janelas: votação 'voltar a jogada' (abrir, votar, desfazer a última jogada).
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
// VOTAÇÃO: quem está jogando faz uma jogada; o amigo abre a votação pelo menu; o anfitrião vota sim
const st = async () => host.evaluate(() => { const g = window.cbt.game; return { cur: g.currentGuild().id, act: g.s.activation?.heroId ?? null, turn: g.s.turn, mine: window.cbt.myGuild }; });
console.log('antes', JSON.stringify(await st()));
const who = (await st()).cur === (await host.evaluate(() => window.cbt.myGuild)) ? host : cli;
await who.evaluate(() => { const c = window.cbt, g = c.game; const h = g.heroesOf(g.currentGuild().id).find(u => u.alive && u.cell); c.act({ type: 'activate', heroId: h.id }); });
await wait(2500);
console.log('depois da jogada', JSON.stringify(await st()));
await cli.evaluate(() => { window.cbt.openMenu(); }); await wait(500);
await shot(cli, 'v1-menu');
await cli.evaluate(() => document.getElementById('gm-vote').click()); await wait(1500);
await shot(host, 'v2-host-poll'); await shot(cli, 'v2-cli-poll');
await host.evaluate(() => document.getElementById('up-yes').click()); await wait(3000);
console.log('depois da votação', JSON.stringify(await st()));
await shot(host, 'v3-host-after'); await shot(cli, 'v3-cli-after');
console.log('cliente igual ao anfitrião?', JSON.stringify(await cli.evaluate(() => { const g = window.cbt.game; return { act: g.s.activation?.heroId ?? null }; })));
await browser.close();
