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
const hostTxt = () => host.evaluate(() => { const cd = document.getElementById('dicecenter'); return { txt: cd && !cd.classList.contains('hidden') ? cd.innerText.replace(/\s+/g, ' ').slice(0, 140) : '', dice: document.querySelectorAll('#dicecenter .cd-die').length }; });
const log = [];
let sawWaitRoll = false, sawChoosing = false;
for (let i = 0; i < 40; i++) {
  await wait(600);
  const h = await hostTxt();
  if (/Aguardando .* rolar/.test(h.txt)) sawWaitRoll = true;
  if (/escolhendo quais dados/.test(h.txt)) sawChoosing = true;
  log.push(`[${h.dice}] ${h.txt.slice(0, 70)}`);
  // o amigo: rola (ataque do Monstro que ele controla, Defender, ✷) e, quando aparecer a escolha, espera 3 s e mantém
  const c = await cli.evaluate(() => { const keep = document.querySelector('#bt-keep, #cd-keep, #rr-keep'); if (keep) return 'keep'; const b = document.querySelector('.bt-act, .cd-roll, #rr-roll'); if (b) { b.click(); return b.textContent; } return ''; });
  if (c === 'keep' && sawChoosing) { await cli.evaluate(() => document.querySelector('#bt-keep, #cd-keep, #rr-keep').click()); log.push('amigo: manteve'); break; }
}
for (const l of log) console.log(l);
console.log('anfitrião viu "aguardando rolar"?', sawWaitRoll, '| viu "escolhendo quais dados"?', sawChoosing);
await shot(host, 'rr-host-spectate');
console.log(sawChoosing ? 'REROLAGEM ACOMPANHADA OK' : 'FALHOU');
await browser.close();
