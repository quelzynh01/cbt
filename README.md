# Champions Battle Tactics (CBT)

Jogo tático por turnos baseado nas regras de **Arcadia Quest**, com visual isométrico no estilo **Dofus**.

Versão atual: **Modo Teste** — mapa *Distrito dos Martelos*, 3 heróis (Grom, Maya, Zazu), sua Guilda contra a IA.
Modo Solo e Multiplayer Online ficam para depois (a arquitetura já está preparada).

## Rodando

```bash
npm install
npm run dev        # abre em http://localhost:5173  (use /#teste para cair direto no Modo Teste)
npm run build      # build de produção em dist/
```

## Controles

| Ação | Como |
|---|---|
| Ativar herói | clique no herói (ou no retrato da timeline) |
| Mover | clique num Espaço **azul** (o caminho e o custo em PM aparecem ao passar o mouse) |
| Atacar | clique no inimigo marcado em **vermelho** → abre a **Tela de Batalha**: escolha a arma e clique **Atacar**. Quando um herói seu é atacado, clique **Defender** para rolar a defesa (Enter/Espaço também funcionam) |
| Abrir/fechar porta | clique na porta (ou no ícone 🔑) ao lado do herói ativo — 1 PM. O movimento **nunca** abre portas sozinho |
| Encerrar turno / Descansar | **Espaço** / **R** |
| Câmera | arrastar ou **W/A/S/D** (ou setas) = mover · roda = zoom · **C** = mapa inteiro · **F** = focar herói · **V** (ou botão no topo) = *Visão livre* / *Visão dos jogadores* |
| Desfazer jogada (Modo Teste) | **Ctrl+Z** ou painel de teste → *Desfazer* / *Início do turno* (opção: mesmos dados) |
| Painel de teste | **T** · coordenadas da grade: **G** |

## Arquitetura

```
src/
  engine/            Regras puras (sem DOM) — pode rodar no servidor no modo online
    types.ts         Tipos e eventos do jogo
    data.ts          Heróis, cartas, monstros, dados, marcadores
    board.ts         Grade, paredes, portas, portais, "Perto", Linha de Visão
    game.ts          Estado + ações (ativar, mover, atacar, descansar...) → emite eventos
    rng.ts           RNG com seed (partidas reproduzíveis)
    maps/distritoDosMartelos.ts   Mapa transcrito do Livro de Campanha
  ai/ai.ts           IA heurística da Guilda adversária
  render/            Canvas isométrico (projeção 2:1 do Dofus), arte procedural, animações
  ui/                HUD (DOM), controlador de input, painel do Modo Teste
```

O motor recebe **ações** e devolve uma lista de **eventos** (`move`, `attack`, `damage`, `death`...).
O renderer só anima esses eventos. No multiplayer, o servidor roda o `engine/` e envia os eventos para os clientes.

## Regras implementadas (Livro de Regras)

- Turno: **Ativar** um herói *ou* **Descansar** a Guilda.
- Ativação: 3 PM (mover, abrir/fechar porta, usar portal) + 1 Ataque, em qualquer ordem, sem dividir o Movimento.
- Máximo de 2 personagens por Espaço (p.13); Espaços Livre / Ocupado / Bloqueado. Marcadores e itens caídos não contam.
- **Perto** (mesmo Espaço ou ortogonal sem parede/porta fechada) e **Linha de Visão** com a regra das quinas.
- Dados de Ataque: 3 ⚔ (só Próximo), 2 ➶ (só Distância), 1 ✷ crítico (sempre acerta e rola mais 1 dado, acumulando). Dados de Defesa: 4 vazias, 1 ⛨, 1 ✷ (bloqueia e rola mais 1). Defesa conta bônus de cartas exaustadas.
- Rerrolagem (↻, vinda de cartas): após cada rolagem de Ataque ou Defesa do seu Herói abre uma janela para escolher quais dados rolar de novo (Configurações → Rerrolagem: escolher ou automática).
- Cartas exaustam até Descansar; Descansar restaura cartas, recupera atordoados e ressuscita mortos.
- **Reação de Alerta** (sair de perto ou atacar outro alvo) e **Reação de Vingança** (o monstro move até seu Movimento e revida).
- **Quem controla os Monstros** é o jogador à direita do ativo (o anterior na ordem). Na Vingança ele escolhe para onde o Monstro
  anda e se ataca: quando a IA ataca um Monstro, **você** decide (painel roxo); quando você ataca, a IA decide.
- **Extermínio**, recompensas em moedas, marcadores de Morte, Primeiro Bônus.
- Marcadores de Exploração: poções (Cura, Revigorante, Turno Adicional), Baú de Tesouro, Armadilha.
- **Cemitério / Entrada de Monstros**: Lacaios mortos vão para o Cemitério (5 vagas, painel à esquerda). Com 5 monstros, ou sem
  monstros no mapa, no fim do turno cada um rola 2 dados contra os bueiros (Marcadores de Entrada) e revive — ou volta para a caixa.
- Habilidades: Fúria de Combate (Grom), Domínio da Magia (Maya), Oportunista (Zazu), Passos Silenciosos (Vapor).
- Cartas: Espada Enferrujada, Adaga Aparadora, Estilingue, Drenar Vida, Raio Nova e a recompensa Quebra-Crânio.
- Distrito dos Martelos: missões *Encontrar as Armas Perdidas* (máx. 2 Guildas), *Matar 3 Monstros*, *Matar <cor>*.
  Com 2 jogadores, vence quem cumprir **2 Missões**.

## Pontos a confirmar com as cartas físicas

O PDF não traz tudo; estes valores são estimativas e ficam centralizados em `src/engine/data.ts`:

- **Vapor**: o livro só confirma Defesa 2 (p.17). PV 4 e a habilidade *Passos Silenciosos* (não aciona Alerta ao se mover) são estimativas.
- **Monstros Nível 1**: o livro só mostra o Arqueiro Goblin Nível 2-3. Usei Orc PV 2 / Ext 3 / ⚔2 e Goblin PV 1 / Ext 2 / ➶2.
- **Faces dos dados**: ataque `✷ ⚔ ⚔ ⚔ ➶ ➶`, defesa `✷ ⛨ · · · ·` (confirmado pelo usuário).
- **Mistura dos 14 marcadores de Exploração** e os **pares de símbolos** dos marcadores de Entrada de Monstro.
- **Drenar Vida / Raio Nova** tratados como ataques a Distância.
- **Paredes do mapa**: transcritas da imagem do Livro de Campanha. Use o painel de teste (**G**) para ver as coordenadas e
  corrigir em `maps/distritoDosMartelos.ts` se alguma borda estiver diferente do tabuleiro físico.

Modo Teste: ao clicar em **Modo Teste** abre a configuração — **mapa**, **2 a 4 times** (cada um *Você* ou *IA*; todos IA = só assistir),
**seus 3 Heróis** e os **itens** de cada um (até 4 cartas). O Time 1 fica na Área Inicial 1 e joga primeiro; os outros times
recebem Heróis sorteados, sem repetir nenhum. A configuração fica salva no navegador. **Modo Livre** (painel de teste): PM e ataques infinitos, cartas não
exaustam, troca de Herói a qualquer momento e a vez não passa para o adversário.

Simplificações atuais: reorganizar itens ao Descansar ainda não está implementado; o alvo extra do Raio Nova é escolhido automaticamente.

## Personagens (cartas oficiais)

| Herói | Def | PV | Habilidade |
|---|---|---|---|
| Grom | 1 | 5 | Fúria de Combate: +1 dado em todas as rolagens enquanto ferido |
| Maya | 1 | 5 | Domínio da Magia: exausta cada carta Mágica duas vezes |
| Zazu | 2 | 4 | Oportunista: não exausta a carta ao atacar alvo flanqueado |
| Vapor | 2 | 3 | Furtividade: ao se mover não aciona Alerta |
| Espetado | 2 | 3 | Vingança: cada ✷ na Defesa causa 1 Ferimento no atacante |
| Diva | 4 | 4 | Duro na Queda (sem efeito especial) |
| Casacaverde | 2 | 4 | Maestria com Arco: cada ✷ com carta de Arco = +1 acerto |
| Hobsbawm | 2 | 4 | Bênção: ataque Mágico sem Movimento → ativa outro Aliado em LdV |
| Jøhan | 3 | 3 | Arremesso de Lâmina: cartas de Espada a Distância (precisa ⚔) |
| Kanga | 2 | 4 | Autossacrifício: sofre 1 Ferimento em vez de exaustar uma carta |
| Escarlate | 3 | 3 | Apunhalar: +1 dado contra alvo flanqueado |
| Seth | 2 | 3 | Magia Perfurante: com carta Mágica, o alvo não rola Defesa |

Os Heróis do Modo Teste são escolhidos na tela de configuração do teste; os da sala online, em *Trocar heróis* na sala.

## Arte (sprites)

Sprites em PNG ficam em `public/sprites/<id>_<direção>.png` e são listados em `public/sprites/manifest.json`.
Direções isométricas: `se` (frente-direita), `sw` (frente-esquerda), `nw` (costas-esquerda), `ne` (costas-direita).
Se faltar uma direção, a oposta é espelhada; personagens sem PNG usam o desenho por código (`src/render/chibi.ts`).

Já com arte: **os 12 Heróis e todos os Monstros** (Saqueador Orc, Capitão Orc, Arqueiro Goblin, Feral Martelador, Feral Lanceiro, Irmã da Dor, Irmã do Prazer, Troll/Schmetterling, Minotauro/Urratouro e Lorde Presas).

Para adicionar ou trocar um personagem: coloque em `ref/modelos/<nome>.jpg` uma imagem com **fundo verde**, a pose de
**frente à esquerda** e a de **costas à direita**, registre o nome em `NAMES` (e o tamanho em `SIZE`) dentro de
`tools/build_sprites.py` e rode `python tools/build_sprites.py --lineup fila.png` (precisa de Pillow, numpy e scipy).

**Tamanho igual para todos:** as poses têm armas levantadas, braços esticados e pulos, então o script não usa a caixa
da imagem. Ele mede o **corpo** (topo da cabeça → pés, ignorando partes finas como lanças e espadas) e deixa todos os
corpos com a mesma altura × `SIZE` (Heróis 1,0; anão 0,9; Goblin 0,86; Irmãs 1,0; Lorde Presas 1,18; Orc 1,22; Capitão 1,28; Ferais 1,3; Troll e Minotauro 1,62). As armas continuam na imagem e a
âncora no chão é a linha dos **pés**. O manifesto guarda os pés e o topo do corpo de cada direção; o jogo usa uma escala
fixa por pixel. Se a medição errar num modelo, ajuste em `OVERRIDE` (ex.: o Grom pula com a espada acima da cabeça).
`--lineup` gera uma imagem com todos lado a lado no mesmo chão, para conferir.

**Marcadores (tokens):** as imagens ficam em `ref/tokens/` (fundo verde) e viram `public/tokens/<id>.webp` com
`python tools/build_tokens.py`. No mapa, os de Exploração aparecem com o verso (?) até alguém pegar; ao pegar, o marcador
aparece no centro da tela virando do verso para a face, com o nome de quem pegou. A Biblioteca tem a aba **Marcadores**. Os marcadores de Missão ficam deitados no chão, ocupando um dos dois lugares do Espaço (dá para parar em cima).

**Dados:** as faces (dado preto de ataque, branco de defesa) e as placas das Entradas de Monstro vêm de `ref/dados/` via `python tools/build_dice.py` (a placa ✷+⚔ é montada a partir das outras).

**Medalhões das cartas:** Defesa, Vida, Rerrolagem, dados de ataque (Próximo/Distância), moeda (custo/recompensa), caveira (Extermínio) e movimento usam as imagens 1–10 de `ref/dados/+*.jpg`, geradas com `python tools/build_bonus.py` em `public/bonus/`. Valores fora de 1–10 usam o medalhão desenhado.

**Sons:** `ref/sounds/` → `public/sounds/*.mp3` (poções, teleporte, armadilha, pegar marcador, Missão, habilidades do
Vapor e do Espetado, dados, ataques de espada/arco/magia, atordoar, passos a cada Espaço). Música em loop:
`musica-menu` nos menus e `musica-game` na partida (volume baixo por padrão). Botão 🔊/🔇 e volume da música no menu inicial e na barra da partida; "Desativar todos os sons" em Configurações. Depois de colocar sons novos em `ref/sounds/`, rode
`python tools/sync_sounds.py`. Efeitos e música têm liga/desliga e volume separados em Configurações.

**Rolagens:** os dados de quem joga neste computador só rolam ao clicar em **🎲 Rolar** (ou Enter). Com Rerrolagem,
primeiro aparece o resultado; depois os dados escolhidos giram de novo (borda verde).

**Animações:** ao começar, todos olham para o meio do tabuleiro; andando olham para onde vão e atacando viram para o
alvo. Corpo a corpo = investida até encostar no inimigo; a distância = projétil em arco com rastro. Depois vem a rolagem
dos dados no centro da tela. Pegar/usar marcador e rolar dados seguram o jogo até a animação acabar.
Ordem do ataque: primeiro rolam os dados (ataque e defesa) e, com o resultado, vem a investida/o projétil. Se o
Monstro sobreviver e revidar (Vingança), a sua Defesa só é rolada depois da animação do seu ataque — e a janela mostra
os dados do ataque do Monstro antes. Todos os
marcadores pegos num Espaço aparecem juntos: os virados para baixo giram ao mesmo tempo e os que já estavam à mostra
(Missão, itens derrubados) só aparecem.

**Bolsa (🎒, tecla B):** ao lado da lupa e no fim da linha de marcadores (até 3 ícones + "+N"). Poções em cima, com
"Usar"; ao usar, a poção aparece no centro da tela.

Ao abrir o jogo há uma **tela de carregamento** (personagens, marcadores, dados e sons).

**Fim da partida:** quem cumpre as Missões vê "Vitória garantida!", mas o placar e a tela final só aparecem quando o
turno dessa Guilda termina.

**Avisos para todos:** Cartas de Recompensa e Títulos aparecem no centro da tela. No mapa: o Herói que carrega um
marcador de Missão mostra o marcador acima da cabeça ("★ carregando"); na Arena, cada marcador mostra quantas vezes cada
Guilda já o marcou (×N na cor da Guilda). Na sua vez a tela ganha uma moldura na cor da sua Guilda.

**Tela de combate:** uma tela por ataque — o ataque e a defesa ficam juntos; a Rerrolagem é escolhida nela mesma
(clique nos dados). Se o Monstro revidar, abre outra tela: primeiro os dados dele, embaixo você rola a sua Defesa.

## Multiplayer Online (até 4 jogadores)

Peer-to-peer, sem servidor pago: o navegador de quem **cria a sala** (anfitrião) roda as regras, rola os dados e
envia o resultado para todos via WebRTC (biblioteca PeerJS; o "aperto de mão" inicial usa o servidor público
gratuito do PeerJS). Os outros jogadores só enviam as jogadas.

1. Menu → **🌐 Multiplayer Online** → digite seu nome → **Criar sala**.
2. Envie o **código** (ou o link `…/?sala=CODIGO`) para os amigos; eles clicam em **Entrar**. Vagas vazias: **+ Adicionar IA**
   (o anfitrião escolhe a dificuldade). Cada um pode dar um nome ao time.
3. O anfitrião clica **Ir para a mesa** e a preparação é igual à da campanha, numa mesa com as cartas dos outros
   **viradas para baixo** e o status de cada um (⏳ escolhendo… / ✓ pronto):
   - **Recrutamento** (3 rodadas): cada um escolhe 1 Herói da mão, sem ver a escolha dos outros; quando todos escolhem,
     o resto passa para a esquerda. Os Heróis dos outros só aparecem no fim.
   - **Votação do mapa** (votos escondidos até todos votarem; empate = sorteio).
   - **Equipamento inicial**: cada um distribui as 5 cartas iniciais entre seus Heróis.
   - **Modo:** *Partida única* ou **Campanha (6 cenários)** — igual à campanha solo: entre os cenários todos voltam
     para a mesa para as **Maldições Mortais** e a **Fase de Melhorias** (escolher 2 de 6 cartas em 3 rodadas, comprar
     até 3, distribuir no inventário); quem venceu escolhe o próximo cenário; no fim, as Medalhas.
4. A partida começa com o **posicionamento** na Área Inicial (todos ao mesmo tempo). Quem cair durante a mesa é
   substituído pela IA para ninguém ficar esperando.

Durante a partida (painel **🌐 Online**, à direita): lista de jogadores, chat e, para o anfitrião, **IA assume**
(se alguém cair). Quem cair volta pelo mesmo link/código e recebe o estado atual. Regras de 3–4 jogadores: vence quem
cumprir 3 Missões, sendo pelo menos 1 contra o Jogo.

Limitações: o anfitrião precisa manter a aba aberta (se fechar, a partida acaba). Algumas redes (4G de certas
operadoras, redes corporativas) bloqueiam a conexão direta — nesse caso configure um servidor TURN (abaixo).

### Publicar (GitHub + Vercel, grátis)

```bash
git add .
git commit -m "Champions Battle Tactics"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/champions-battle-tactics.git
git push -u origin main
```

No [Vercel](https://vercel.com): **Add New → Project → Import** o repositório. O Vercel detecta Vite sozinho
(Build Command `npm run build`, Output Directory `dist`). Cada `git push` publica uma nova versão.

**TURN opcional** (se algum amigo não conseguir conectar): crie uma conta grátis no
[Metered Open Relay](https://www.metered.ca/stun-turn) e, no Vercel → Settings → Environment Variables, adicione
`VITE_TURN_URLS` (ex.: `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443`), `VITE_TURN_USERNAME` e
`VITE_TURN_CREDENTIAL`. Depois faça um novo deploy.

## Menu inicial

**Campanha** · **Multiplayer Online** · **Modo Teste** · **Biblioteca** (heróis, monstros por nível, itens/cartas,
Maldições e Títulos, mapas e resumo das regras) · **Configurações** (tela de confronto: sempre / só meus heróis /
nunca; velocidade; cronômetro). Na partida, **☰** (ou Esc) abre o menu: reiniciar partida, reiniciar turno (no online só
o anfitrião), Biblioteca, Configurações e sair. Clique numa **Missão** para piscar os objetivos no mapa; o título
**Missões** minimiza/mostra a lista (separada do Cemitério). Ao sair para o menu, a partida para (nada roda em segundo plano).

**HUD da partida:** à esquerda o **Placar** (🪙 moedas, 🏆 Missões e 💀 Monstros; clique no título para os detalhes:
mortes, Heróis vivos, marcadores e Missões cumpridas) e, embaixo, a **ficha** do personagem selecionado; a 🔍 da ficha abre
a carta do Herói ou Monstro com os **valores atuais** — Vida atual, Defesa, Rerrolagem e dados de ataque (verde = melhorado
por itens/efeitos, vermelho = piorado: ferido, Maldição, Atordoado) — e as cartas dele com os dados que rolaria. À direita:
Cemitério, Missões e Registro. A barra dos personagens fica centralizada embaixo. No Modo Teste, o botão **🧪 Teste** da
barra de cima (ou **T**) abre as opções de teste.

**Ficha na visão livre:** fica sempre no último personagem que você clicou, até clicar no ✕ ou em outro personagem. Na
visão dos jogadores ela acompanha quem está jogando (online: o que o jogador da vez clicou).

**Nomes dos times:** opcionais — na configuração do Modo Teste (um por time), na sala online (o seu time) e ao criar a
Campanha (sua Guilda). Vazio = nome da cor.

**Início da partida (todos os modos):** cada time humano posiciona seus Heróis na própria Área Inicial (máx. 2 por Espaço)
e clica **Pronto**; a IA fica pronta na hora. No online todos posicionam ao mesmo tempo; o 1º turno e o cronômetro só
começam quando o último terminar. Cada Herói só pode estar em um time. (No *Covil dos Orcs* as Áreas Iniciais têm 2 Espaços,
como no Livro de Campanha: dois Heróis dividem um Espaço.)

**Câmera — Visão livre / Visão dos jogadores** (Configurações ou botão no topo): na visão dos jogadores a câmera segue
quem está jogando. Contra a IA, ela acompanha cada jogada e mostra uma seta "IA" onde a IA agiu. No online, quem joga
envia a câmera e o mouse; os outros veem a mesma tela e a seta com o nome do jogador.

## Campanha (menu → 🏰 Campanha)

6 cenários como no Livro de Regras: **3 do Círculo Exterior, 2 do Círculo Interior e o Confronto Final**, contra 1 a 3 IAs.
Início: **recrutamento** (cada um recebe uma mão de Heróis — 4, ou 3 com 4 jogadores porque há 12 Heróis —, escolhe 1 e
passa o resto à esquerda), **votação** do primeiro mapa (empate = sorteio), **equipamento inicial** (as 5 cartas iniciais nos
espaços dos Heróis) e **posicionamento** na Área Inicial. Depois, o vencedor de cada cenário escolhe o próximo; o nível
dos Monstros sobe (1º = Nível 1, 2º-3º = 2-3, 4º-5º = 4-5, 6º = 6). Entre os cenários:
- **Maldições Mortais**: cada Herói compra 1 carta por marcador de Morte e fica com a de maior valor.
- **Fase de Melhorias**: 6 cartas do baralho do nível, escolha de 2 em 3 rodadas (as mãos passam para a esquerda),
  compra de até 3 cartas com as moedas (sobra só 1 moeda guardada) e distribuição no inventário (4 espaços por Herói,
  máx. 12 cartas, 1 armadura por Herói, 1 Bomba por Guilda).
- **Títulos**: Guardião do Portão, Destruidor da Pedra Sangrenta, Protetor do Fogo, Mestre do Conhecimento.
- No fim: **Medalhas** (Vencedor, Menos Mortes, Mais Moedas, Ganhou Recompensa, Recebeu Título), grau da vitória e tempo total.

**Descansar** abre uma janela: reorganize cartas e marcadores de Exploração entre os Heróis (Missão e Maldições não se
movem) e escolha onde cada morto ressuscita (Área Inicial ou Perto de um Aliado).

A campanha fica salva no navegador. Cartas (`src/engine/cards.ts`), Monstros por nível, Maldições e Recompensas vêm dos
CSVs em `ref/wiki/`. Cartas com efeito especial ainda não implementado aparecem marcadas.

**Limite de dados** (campanha e sala online): no máximo **8 dados de ataque e 6 de defesa** por rolagem, contando
críticos e rerrolagens — como os dados físicos da caixa.

**Dificuldade dos mapas** (Livro de Campanha), mostrada embaixo do nome:

| Fácil | Médio | Difícil | Muito difícil |
|---|---|---|---|
| Arena do Sol Brilhante · Distrito dos Martelos · Distrito do Alquimista | O Portão da Lua · Praça da Aurora Vermelha · O Pátio da Universidade · O Viveiro das Águias | Distrito Sempressombrio · A Mansão · Covil dos Orcs | O Templo do Amanhecer Crepuscular |

## Mapas (cenários)

Os 11 cenários do Livro de Campanha estão jogáveis (transcritos das páginas do livro):

| Círculo | Cenários |
|---|---|
| Exterior | Distrito dos Martelos · Arena do Sol Brilhante · O Portão da Lua · O Viveiro das Águias · A Mansão · Covil dos Orcs |
| Interior | Distrito do Alquimista · Praça da Aurora Vermelha · O Pátio da Universidade · Distrito Sempressombrio |
| Final | O Templo do Amanhecer Crepuscular |

**Ficha do cenário:** cada mapa tem uma ilustração (3x4) e os textos do Livro de Campanha (Beneficia / Beneficia-se de,
Título, Missões, Carta de Recompensa, Preparação e Regras Especiais, Vantagens do Título), com a disposição dos tabuleiros
embaixo. Aparece na Biblioteca (aba Mapas) e, nas telas de escolha (votação, próximo cenário, Modo Teste), abre pela lupa 🔍
de cada mapa. Ilustrações e textos vêm de `ref/maps/` (fora do git) via `python tools/build_maps.py`,
que gera `public/maps/<id>.webp` e `src/engine/maps/lore.ts`.

Regras especiais novas: **Rei da Arena** (terminar a ativação nos marcadores de Missão), **escolta** (Águias até o portal azul,
Resistência até o “!”, Realeza até a própria Área Inicial), **Sombra do Lorde Presas** invocada ao pisar nos marcadores
Vermelho/Verde, **emboscada** da Irmã do Prazer nos marcadores escondidos, **portas e portais por Título** (Esconderijo do
Troll para o “Caçador de Trolls”, portais vermelhos para o “Senhor das Águias”) e **Líder Rebelde** no Templo.
Títulos novos: Senhor das Águias, Caçador de Trolls, Líder Rebelde e Forjador de Almas.

## IA (Normal e Difícil)

Escolha em Configurações, na tela do Modo Teste ou ao criar a Campanha.

- **Posicionamento e ressurreição:** a IA põe 2 Heróis no Espaço da porta (o mais perto dos objetivos) e ressuscita os
  mortos ali; a Difícil também ressuscita Perto de um Aliado que já está à frente.
- **Na partida:** entende todas as Missões (coletar, escoltar, Arena, invocar, matar alvo, barreira do Templo), usa poções,
  e fica mais ousada quando a Guilda passa vários turnos sem progresso (evita partidas travadas).
- **Difícil:** calcula as chances exatas dos dados (críticos que explodem × Defesa) para escolher o ataque, lê as ameaças
  dos Heróis inimigos, caça quem carrega marcadores de Missão e evita Armadilhas mortais. Normal tem acaso nas escolhas.
- **Campanha:** escolhe Heróis por força e equilíbrio (alcance/resistência) e cartas que combinam com seus Heróis; a
  Difícil compra a melhor combinação que cabe nas moedas.
- **Testes (simulação, 2 jogadores):** Difícil venceu a Normal em 78 de 119 partidas (66%) em 10 mapas; só 1 partida
  travada em 120 (a IA antiga travava ~19%). Campanha só de IAs: 6 de 6 completas.

## Cartas

Visual inspirado nas cartas oficiais (`ref/cards`): moldura colorida pelo nível, título em pergaminho, medalhões
(🪙 custo, dados de ataque, ⛨ Defesa, ❤ Vida, ☠ Extermínio, ↻ Rerrolagem) e caixa de texto (`src/ui/cardview.ts`, `src/cards.css`).
Cartas de Itens, Monstros e Maldições Mortais têm todas o mesmo tamanho (214×344); textos longos usam fonte menor.
A arte dos Monstros é recortada pela área visível do sprite, para todos ocuparem a carta por igual.

| Itens | Cor | | Monstros | Cor |
|---|---|---|---|---|
| Inicial | cinza | | Nível 1 | laranja |
| Nível 1 | azul | | Nível 2-3 | verde |
| Nível 2 | roxo | | Nível 4-5 | azul |
| Nível 3 | verde | | Nível 6 | roxo |
| Nível 4 | laranja | | | |
| Nível 5 | vermelho | | | |
| Recompensa | dourado | | | |

**Efeitos especiais** (todos implementados): Tomo da Iluminação (+2 espaços para Ataques Mágicos), Coração de Anjos,
Coroa de Sangue, Manto do Assassino, Lança do Feral (diagonal), Grito de Guerra, Rajada de Vento (empurra o alvo),
Enxame da Morte. Cartas **ativáveis** têm uma faixa na própria carta: **⚡ Usar** (Apocalipse, Bastão da Celeridade,
Escudo das Almas, Manto do Deslocamento, Das Boot / Die Booten) ou **🛡️ Armar** (Escudo do Rei, Escudo de Cavaleiro —
armado, vale na próxima Defesa). "Exaustar o Herói" = o Herói não pode ser ativado até a Guilda Descansar (💤 na ficha).
Testes: `cardfx` (23 casos).

**Arte das cartas de item:** as imagens ficam em `ref/cards/<nome>.jpg` (fundo verde) e viram `public/cards/<id>.webp` com
`python tools/build_cards.py` (gera também `src/ui/cardArt.ts`). Armas: fundo transparente sobre a cor da carta; Magias:
a ilustração preenche o quadro. Cartas sem imagem continuam com o ícone do grupo. Os medalhões de Defesa, Vida e
Rerrolagem ficam na caixa de texto, embaixo (como nas cartas oficiais). Para novas cartas, coloque o arquivo e adicione o
nome na lista `ITEMS` do script.
