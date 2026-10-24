// Online com 2 janelas: quem não está na vez vê a tela de escolha do ataque do outro e a luta junto.
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


// quem está na vez ataca um Monstro; a outra janela só assiste
const cur = await host.evaluate(() => window.cbt.game.currentGuild().id);
const hostGuild = await host.evaluate(() => window.cbt.myGuild);
const atkPage = cur === hostGuild ? host : cli, viewPage = cur === hostGuild ? cli : host;
console.log('vez de', cur, '| atacante =', cur === hostGuild ? 'anfitrião' : 'amigo');
const ids = await host.evaluate(cg => {
  const c = window.cbt, g = c.game;
  const h = g.heroesOf(cg).find(u => u.alive && u.cell);
  const m = g.units().find(u => u.kind === 'monster' && u.alive && /^(orc|goblin)/.test(u.defId));
  m.cell = { ...h.cell };
  c.pushLocal([]);
  return { h: h.id, m: m.id };
}, cur);
await wait(1500);
await atkPage.evaluate(id => window.cbt.act({ type: 'activate', heroId: id }), ids.h);
await wait(2500);
await atkPage.evaluate(({ h, m }) => window.cbt.openBattle(h, m), ids);
await wait(2500);
const v1 = await viewPage.evaluate(() => ({ mode: window.cbt.battle.mode, txt: document.getElementById('battle')?.innerText.slice(0, 120).replace(/\n/g, ' ') }));
console.log('quem assiste, enquanto o outro escolhe a arma:', JSON.stringify(v1));
await shot(viewPage, 'pk-view-prepare');
await atkPage.evaluate(() => document.querySelector('.bt-go')?.click());
let maxDice = 0, seenPlay = false, log = [];
for (let i = 0; i < 24; i++) {
  await wait(500);
  const crit = await atkPage.evaluate(() => { const b = [...document.querySelectorAll('.bt-act, .cd-roll')].find(x => /Crítico/.test(x.textContent)); if (b) { b.click(); return true; } return false; });
  const v = await viewPage.evaluate(() => ({ mode: window.cbt.battle.mode, dice: document.querySelectorAll('.bt-tray.atk .bdie, .cd-row.atk .cd-die').length, wait: /Aguardando/.test(document.getElementById('battle')?.innerText ?? '') }));
  const a = await atkPage.evaluate(() => document.querySelectorAll('.bt-tray.atk .bdie, .cd-row.atk .cd-die').length);
  log.push(`${a}/${v.dice}${v.wait ? 'w' : ''}${crit ? 'C' : ''}`);
  if (v.mode === 'play') seenPlay = true;
  maxDice = Math.max(maxDice, v.dice);
}
console.log('dados (atacante/quem assiste) a cada 0,5s:', log.join(' '));
const v2 = { mode: seenPlay ? 'play' : 'nunca', dice: maxDice };
console.log('quem assiste viu a luta?', JSON.stringify(v2));
console.log(v1.mode === 'spectate' && v2.dice > 0 ? 'ESCOLHA DO ATAQUE SINCRONIZADA OK' : 'FALHOU');
await browser.close();
