# Champions Battle Tactics

Jogo de tabuleiro tático, clone de Arcadia Quest (Core + Beyond the Grave + heróis Extra). TypeScript + Vite, sem framework de UI, canvas isométrico. Online P2P com PeerJS (um jogador é o anfitrião, os outros são clientes). Deploy na Vercel a partir do GitHub (github.com/quelzynh01/cbt, branch `main`).

## Regras de trabalho

- O usuário escreve em português: responda em português. Textos do jogo também em português.
- **Toda mudança vale para TODOS os modos**: partida local, online (anfitrião E cliente), campanha local e campanha online. Se algo só fizer sentido num modo, avise.
- Commit/push só quando o usuário pedir (`git push origin main`). Mensagem de commit em português.
- Antes de entregar: `npm run build` (tsc + vite build) sem erro. Se mexeu em regras, rode os testes de regras (abaixo).
- No final, diga o que mudou e o que não foi testado de verdade.
- Foco no jogo padrão (Clássico): não testar Beyond the Grave (`btgrules`, mapas do Beyond) até o usuário pedir.

## Arquitetura

- `src/engine/` — regras puras, sem DOM:
  - `game.ts`: classe `Game`, com todas as regras (ataque, rerrolagem, maldições, recompensas, descanso, vingança dos monstros, missões, títulos).
  - `actions.ts`: `applyAction(game, guild, action)`, a única porta de entrada das jogadas (também é o que vem pela rede).
  - `types.ts`: `GameState` (serializável em JSON, é o que vai pela rede) e eventos (`GameEvent`).
  - `cards.ts` / `data.ts`: cartas, heróis, guildas, maldições. `extraHeroes.ts`, `heroBan.ts`, `titles.ts`, `tombstones.ts`.
  - `board.ts` + `maps/`: um arquivo por mapa (paredes, portas, áreas iniciais, missões, títulos).
- `src/ai/` — IA (`SimpleAI`). Mudou regra? Veja se a IA e o modo `'auto'` dos hooks continuam certos.
- `src/ui/controller.ts` — liga engine, renderer, HUD e rede. Cuida dos modos local/host/client, de desfazer, descanso, vingança, deploy e votação.
- `src/ui/hud.ts` — HUD estilo Dota (barra de baixo, placar em cima, dados no centro, avisos à esquerda). O combate é só o painel de dados do centro (`hud.centerDice` / `askDecision` / `spectateDecision`), o mesmo para todos na partida; a tela 2D de batalha ("Sempre") foi removida — `src/ui/battle.ts` hoje só serve para a escolha da arma (modo `prepare`).
- `src/ui/campaignUI.ts` — campanha local. `src/ui/lobby.ts` — lobby online e campanha online.
- `src/ui/upgradeViews.ts` — telas **compartilhadas** da Fase de Melhorias (maldições, compras, ranking). O que deve aparecer igual nas duas campanhas vai aqui.
- `src/campaign/campaign.ts` — estado da campanha (inventário, títulos, medalhas, cenários).
- `src/render/renderer.ts` — canvas, animações e fila de eventos. `renderer.busy` fica ativo enquanto anima; o HUD congela placar/status até a animação acabar (para não dar spoiler).
- `src/net/net.ts` — `HostSession`/`ClientSession` e tipos `Msg`. `src/net/onlineSetup.ts` — fluxo de preparação online.
- CSS: `src/style.css` (jogo), `menu.css`, `cards.css`, `mobile.css`, `polish.css`.
- `tools/*.py` — scripts que geram arte, mapas e sprites a partir de `ref/` (não vai pro git).

## Decisões no meio da jogada

Rerrolar, empurrão, alvo extra, qual marcador pegar, recompensa com inventário cheio:
- O `Game` chama `game.rerollHook` / `game.choiceHook`.
- O controller lança `NeedDecision`, pergunta ao jogador e **repete a ação** com as respostas (`withDecisions`).
- No online, o anfitrião pede a decisão ao jogador remoto pela rede (`HostSession.askDecision`, msgs `'decide'`/`'decision'`). Se não houver resposta em 60 s, a decisão é automática (`AUTO_PICK`).

## Partidas salvas

- Campanha local: o cenário em andamento fica em `CampaignState.match` (salvo a cada 3 s via `controller.autosave` e ao fechar a aba); `main.ts` pergunta "Continuar de onde parou?".
- Online: só o anfitrião salva (`src/net/onlineSaves.ts`, `localStorage['cbt.onlineSaves']`): sala + preparação/campanha (`stash`) + `GameState`. `OnlineLobby.persist()` grava na mesa e durante a partida; apaga quando acaba.
- Reabrir: `HostSession(..., restore)` tenta o mesmo código; a sala fica `restored` (sala de espera) até o anfitrião apertar "Continuar". Jogador volta pela `clientId` (mesmo navegador) ou pelo mesmo nome.

## Revisão dos mapas

- O usuário revisa os mapas em `/#paredes` (`src/ui/wallEditor.ts`): paredes, Espaços bloqueados, decks de madeira e portas.
- Ele manda um texto `PAREDES {...}`: salve num arquivo e rode `python tools/apply_map_review.py <arquivo>`.
- Depois: `sh tools/tests/run-engine.sh mapitems` (nada em cima de Espaço bloqueado), `ALL=1 sh tools/tests/run-engine.sh reach2` e `xsim`.

## Cuidados

- O cliente online **não roda as regras**: recebe o `GameState` + eventos do anfitrião. Toda decisão do jogador precisa ir pela rede.
- O `GameState` precisa continuar serializável: nada de funções/classes dentro dele.
- O texto da carta (`data.ts`/`cards.ts`) deve bater com o que a engine faz.
- "Exaustar o herói" = aquela habilidade não pode ser usada de novo até o Descanso; o herói continua jogável.

## Testes (`tools/tests/`)

Regras, sem navegador (compila com esbuild e roda com node):

```sh
sh tools/tests/run-engine.sh xrules        # habilidades dos heróis extras  -> "TUDO OK"
sh tools/tests/run-engine.sh btgrules      # Beyond the Grave                -> "TUDO OK"
sh tools/tests/run-engine.sh rules         # Core
sh tools/tests/run-engine.sh vdoor         # monstros abrindo/fechando portas na Vingança
sh tools/tests/run-engine.sh boots         # Botas usadas aos poucos (Die Booten: 1 passo + 1 passo)
sh tools/tests/run-engine.sh pushportal    # empurrão (Rajada de Vento, Tiro Explosivo) não atravessa portal -> "EMPURRÃO SEM PORTAL OK"
sh tools/tests/run-engine.sh deathcurse    # Templo: Maldição a cada morte (troca se maior, carta coberta) e Grito de Guerra depois da morte
sh tools/tests/run-engine.sh presas        # Descanso sem ressuscitar; Lorde Presas se cura na Vingança e sobrevive; escolha de quem mais é atingido
sh tools/tests/run-engine.sh reacoes       # vários Monstros atacados: quem controla escolhe qual faz a Vingança; Esconderijo do Troll com inventário cheio
sh tools/tests/run-engine.sh sombra        # Praça da Aurora: marcador Vermelho/Verde invoca a Sombra do Lorde Presas (entra ou fica fora)
sh tools/tests/run-engine.sh escudo        # Escudo das Almas a qualquer hora (Espaço como no Descanso); Botas não pegam o que está no chão
sh tools/tests/run-engine.sh turno         # Poção de Turno Adicional na hora (sem Entrada de Monstros); Grito de Guerra ativa quem andou com as Botas
sh tools/tests/run-engine.sh allpick       # Recrutamento All Pick (campanha local e online)
sh tools/tests/run-engine.sh defesa        # Defesa: sem acertos não rola; já bloqueou tudo = Manter (✷ extra / Rerrolagem só se pedir); escudos no combate
sh tools/tests/run-engine.sh ordem         # ordem dos jogadores sorteada (avulsa e 1º cenário da campanha)
sh tools/tests/run-engine.sh alertas       # aviso de Reação de Alerta antes de andar: nenhuma Reação sem aviso (mesmo caminho do movimento)
sh tools/tests/run-engine.sh vdoor2        # Vingança: abrir/fechar portas Perto do Monstro (1 Movimento cada, até o Movimento dele)
sh tools/tests/run-engine.sh alertas2      # Templo, Grom: todo Espaço x todo destino; nenhuma Reação de Alerta sem aviso
sh tools/tests/run-engine.sh furtivo       # Vapor (Wisp): Furtividade 1 vez por turno, pergunta a cada Reação de Alerta se esquiva dela (até usar); IA esquiva da 1ª
sh tools/tests/run-engine.sh irmas         # ordem de entrada sorteada: Irmãs (Alquimista) e dupla Troll + Minotauro (Pátio)
sh tools/tests/run-engine.sh resthp        # Descanso: não deixa tirar a carta que dá Vida se o Herói ficar com a Vida zerada
sh tools/tests/run-engine.sh fender        # Fender sempre pergunta (mesmo com 1 Inimigo Perto): usar ou não
sh tools/tests/run-engine.sh bencao        # Bênção: o Aliado não troca de volta para quem já jogou; troca normal antes de agir continua
sh tools/tests/run-engine.sh curairma      # Irmã do Prazer/Lorde: ✷ cura 2 antes da retribuição (Espetado/Amuleto); dano além da Vida conta; vive só com Vida >= 1
sh tools/tests/run-engine.sh aiitems       # IA: poções no fim da ativação e Baús/poções com o Herói mais seguro no Descanso
sh tools/tests/run-engine.sh duel 6       # IA nova x IA antiga (tools/tests/engine/ai_old.ts = IA do commit anterior), partidas espelhadas; P={...} muda os pesos
sh tools/tests/run-engine.sh xsim 30 mix   # partidas IA x IA nos mapas Clássicos (mix|core|extra; MAP=id, SEED=n repete uma, BTG=1 inclui Beyond, V=1 detalha) -> 0 travadas/0 erros
ALL=1 sh tools/tests/run-engine.sh reach2  # alcance de todos os mapas       -> "TODOS OS MAPAS OK"
```

Navegador (puppeteer-core + Chrome instalado). Rode uma vez `npm i` em `tools/tests/browser`. Suba o dev server em outra janela com `npx vite --port 5199 --strictPort --base /` e pare-o no fim:

```sh
node tools/tests/browser/shot.mjs <pasta-prints> [largura altura]   # Modo Teste, prints de cada etapa
node tools/tests/browser/batch.mjs <pasta-prints>                   # recompensa cheia, aura, barra de vida, Descanso
node tools/tests/browser/online.mjs <pasta-prints>                  # campanha online com 2 janelas (DROP=1 testa reconexão)
node tools/tests/browser/rrnet.mjs <pasta-prints>                   # rerrolagem do amigo pela rede
node tools/tests/browser/vote.mjs <pasta-prints>                    # votação "voltar a jogada"
node tools/tests/browser/curse.mjs <pasta-prints>                   # Maldições Mortais na campanha online
node tools/tests/browser/saveon.mjs <pasta-prints>                  # partida online salva: sair e voltar (partida e Fase de Melhorias)
node tools/tests/browser/savecamp.mjs <pasta-prints>                # campanha local: sair no meio do cenário e continuar
node tools/tests/browser/dicesync.mjs <pasta-prints>                # online: dados sincronizados (o outro só vê depois do clique de quem rola)
node tools/tests/browser/rrspec.mjs <pasta-prints>                  # online: o anfitrião acompanha a Rerrolagem do amigo
node tools/tests/browser/rrspec2.mjs <pasta-prints>                 # online: quem acompanha vê o ataque rolando e o resultado no MESMO painel (não reabre rolando de novo)
node tools/tests/browser/quickbar.mjs <pasta-prints>                # atalho lá em cima para o item (Botas) de outro Herói; MOB=1 = celular
node tools/tests/browser/keepbar.mjs <pasta-prints>                 # Defesa que já bloqueou tudo: Manter / +1 dado / Rerrolar cabem no quadro; MOB=1 = celular
node tools/tests/browser/cancelatk.mjs <pasta-prints>               # Cancelar ataque: volta ao estado de antes, sem Reação nem dano (RR=1: com Rerrolagem aberta)
node tools/tests/browser/lordentry.mjs <pasta-prints>               # Templo: Lorde Presas escondido no posicionamento e surge com animação e fala depois de todos prontos
node tools/tests/browser/splashdef.mjs <pasta-prints>               # Lorde Presas em 2 Heróis: ataque rola 1 vez, um defensor por vez; sem acertos: pergunta no painel (ROLL=1: rola)
node tools/tests/browser/lordsounds.mjs <pasta-prints>              # Sempressombrio: Alma do Lorde Presas; ataque do Lorde = morcego (rastro de morceguinhos) vai e volta; Irmãs: ✷ = risada, golpe = som do ataque + fala
node tools/tests/browser/vdoorui.mjs <pasta-prints>                 # Vingança: clicar na porta Perto do Monstro abre/fecha antes de ele mover
node tools/tests/browser/shieldui.mjs <pasta-prints>                # Escudo de Cavaleiro / do Rei: pergunta no painel dos dados, com o ataque já rolado
node tools/tests/browser/minotaur.mjs <pasta-prints>                # Arena: entrada do Minotauro, risada no ✷, fala ao matar; Vapor pergunta "Esquivar?"
node tools/tests/browser/captains.mjs <pasta-prints>                # MAP=/TYPE=/N=/SND=: Monstros de destaque (FIRE_BOSSES) surgem juntos com som de orc e aura de lava; Irmãs no Alquimista: MAP=distrito-do-alquimista TYPE=irma_ SND=sister-,lol-sister
node tools/tests/browser/trollsounds.mjs                            # Mansão: entrada do Troll; ataque em 1 = troll-ataque, em 2 = risada; atacado sem dano = risada
node tools/tests/browser/feralspot.mjs <pasta-prints>               # Viveiro: Ferais Marteladores na ponta do Espaço (fora do portal); quem chega pelo portal fica de frente para ele
node tools/tests/browser/bossmark.mjs <pasta-prints>               # círculo de invocação (giz) no chão onde os chefes surgem
node tools/tests/browser/markvis.mjs <pasta-prints>                # círculo some quando o chefe surge e volta quando ele morre; aura das Irmãs no Alquimista
node tools/tests/browser/vapordodge.mjs <pasta-prints>              # Vapor perto de 2 Monstros: antes de sair do Espaço pergunta a cada Reação (Esquivar / Não esquivar / Cancelar = parar aqui)
node tools/tests/browser/blessenter.mjs <pasta-prints>              # Bênção: clicar no Aliado + Enter não ativa (Enter encerra); ativado pelo botão, anda (clicando no Espaço do Hobsbawm)
node tools/tests/browser/alertwarn.mjs <pasta-prints>               # Templo: aviso de Reação de Alerta (Irmãs) aparece antes de andar
node tools/tests/browser/rratk.mjs <pasta-prints>                   # online: Rerrolagem do ATAQUE do amigo acompanhada no painel de dados
```

O jogo expõe `window.cbt` (o controller) para os testes manipularem o estado. Modo Teste via `localStorage['cbt.test']`.
