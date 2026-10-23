// Campanha online com 2 janelas: termina o 1º mapa e confere a escolha das Maldições Mortais no amigo (sem travar).
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
// mortes: 1 Herói de cada Guilda humana morreu (para sair Maldição) e o anfitrião termina o mapa
await host.evaluate(() => {
  const c = window.cbt, g = c.game;
  for (const gid of g.s.guildOrder) { const h = g.heroesOf(gid)[0]; h.deaths = 1; }
  const me = c.myGuild;
  for (const m of g.s.missions.filter(m => m.kind === 'pve').slice(0, 2)) g.completeMission(me, m.id);
  g.s.pending = null; g.endTurn(); c.pushLocal(g.drain());
});
await wait(4000);
await host.evaluate(() => document.getElementById('go-camp')?.click());
await wait(3000);
const state = async () => ({
  host: await host.evaluate(() => ({ h3: document.querySelector('.cr-step h3')?.textContent, next: !!document.querySelector('.cr-back.next'), res: document.querySelector('.cr-result')?.textContent?.slice(0, 60) })),
  cli: await cli.evaluate(() => ({ h3: document.querySelector('.cr-step h3')?.textContent, next: !!document.querySelector('.cr-back.next'), res: document.querySelector('.cr-result')?.textContent?.slice(0, 60) })),
});
for (let k = 0; k < 14; k++) {
  const s1 = await state();
  console.log(k, JSON.stringify(s1));
  if (s1.host.next) await host.evaluate(() => document.querySelector('.cr-back.next').click());
  else if (s1.cli.next) await cli.evaluate(() => document.querySelector('.cr-back.next').click());
  await wait(1800);
}
await shot(host, 'cu-host'); await shot(cli, 'cu-cli');
await browser.close();
