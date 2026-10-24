// Online com 2 janelas: os dados de quem rola em outro computador só aparecem depois do clique dele (BATTLE=never|always).
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

// um Monstro ataca o Herói do AMIGO: a Defesa é do amigo -> na tela do anfitrião os dados de Defesa esperam o clique dele
await host.evaluate(() => {
  const c = window.cbt, g = c.game;
  const other = g.s.guildOrder.find(x => x !== c.myGuild);
  const h = g.heroesOf(other).find(u => u.alive && u.cell);
  h.cards = [];
  const m = g.units().find(u => u.kind === 'monster' && u.alive && /^(orc|goblin)/.test(u.defId));
  m.cell = { ...h.cell };
  let evs = [];
  c.withDecisions(() => { g.monsterAttack(m, h, 'alerta'); return true; }, () => { evs = g.drain(); c.pushLocal(evs); });
  window.__evs = evs.map(e => e.t).join(',');
});
console.log('eventos:', await host.evaluate(() => window.__evs));
for (let i = 0; i < 30; i++) { await wait(1000); if (await cli.evaluate(() => !!document.querySelector('.cd-roll, .bt-act'))) break; }
const hostView = () => host.evaluate(() => {
  const b = document.getElementById('battle'), cd = document.getElementById('dicecenter');
  const txt = (b && !b.classList.contains('hidden') ? b.innerText : '') + ' | ' + (cd && !cd.classList.contains('hidden') ? cd.innerText : '');
  const defDice = document.querySelectorAll('.bt-tray-wrap.def .bdie, .cd-def .cd-die').length;
  return { waiting: /Aguardando/.test(txt), defDice };
});
await wait(4500);
const before = await hostView();
console.log('anfitrião antes do amigo clicar:', JSON.stringify(before));
await shot(host, 'ds-host-wait');
console.log('cli antes:', JSON.stringify(await cli.evaluate(async () => { const m = await import('/src/ui/diceSync.ts'); const b = document.querySelector('.bt-act, .cd-roll'); return { net: !!m.diceSync.net, btn: b?.textContent, busy: window.cbt.renderer.busy, battle: window.cbt.battle.mode }; })));
await cli.evaluate(async () => { const m = await import('/src/ui/diceSync.ts'); const orig = m.diceSync.net.send; m.diceSync.net.send = id => { window.__sent = id; orig(id); }; });
await host.evaluate(async () => { const m = await import('/src/ui/diceSync.ts'); const orig = m.diceSync.receive.bind(m.diceSync); m.diceSync.receive = id => { window.__got = id; orig(id); }; });
// o amigo clica: primeiro "Rolar ataque" (ele controla o Monstro nesta Reação); o anfitrião só mostra o ataque depois
const atkDice = () => host.evaluate(() => document.querySelectorAll('.bt-tray.atk .bdie, .cd-row.atk .cd-die').length);
console.log('anfitrião: dados de ataque antes do clique =', await atkDice());
const clickCli = re => cli.evaluate(src => { const b = [...document.querySelectorAll('.bt-act, .cd-roll')].find(x => new RegExp(src, 'i').test(x.textContent)); if (b) { b.click(); return b.textContent; } return null; }, re);
const clickHost = re => host.evaluate(src => { const b = [...document.querySelectorAll('.bt-act, .cd-roll')].find(x => new RegExp(src, 'i').test(x.textContent)); if (b) { b.click(); return b.textContent; } return null; }, re);
// quem controla o Monstro nesta Reação rola o ataque (pode ser o amigo ou o anfitrião, depende de quem está na vez)
let c1 = null; for (let i = 0; i < 20 && !c1; i++) { c1 = await clickCli('ataque') ?? await clickHost('ataque'); if (!c1) await wait(400); }
console.log('amigo clicou:', c1);
await wait(2500);
console.log('anfitrião: dados de ataque depois =', await atkDice(), '| defesa ainda esperando?', JSON.stringify(await hostView()));
// críticos do ataque (se houver) e a Defesa
for (let i = 0; i < 30; i++) { await clickHost('Crítico'); const c = await clickCli('Crítico|Defender|defesa'); if (c) console.log('amigo clicou:', c); await wait(700); if ((await hostView()).defDice > 0 && !(await cli.evaluate(() => !!document.querySelector('.cd-crit, .bt-crit')))) break; }
await wait(2500);
const after = await hostView();
console.log('enviado:', await cli.evaluate(() => window.__sent), '| recebido:', await host.evaluate(() => window.__got));
console.log('anfitrião depois:', JSON.stringify(after));
await shot(host, 'ds-host-after');
console.log(after.defDice > 0 ? 'SINCRONIZADO OK' : 'FALHOU');
await browser.close();
