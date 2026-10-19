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
| Câmera | arrastar = mover · roda = zoom · **C** = mapa inteiro · **F** = focar herói · **V** (ou botão no topo) = *Visão livre* / *Visão dos jogadores* |
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

Já com arte: **Vapor, Espetado, Hobsbawm, Saqueador Orc e Arqueiro Goblin**.

Para adicionar outro personagem: coloque em `ref/modelos/<nome>.jpg` uma imagem com **fundo verde**, a pose de
**frente à esquerda** e a de **costas à direita**, registre o nome em `NAMES` dentro de `tools/chroma_sprites.py`
e rode `python tools/chroma_sprites.py` (precisa de Pillow, numpy e scipy). O script recorta pelo verde, espelha as
duas poses para formar as 4 direções e atualiza o `manifest.json`.

## Multiplayer Online (até 4 jogadores)

Peer-to-peer, sem servidor pago: o navegador de quem **cria a sala** (anfitrião) roda as regras, rola os dados e
envia o resultado para todos via WebRTC (biblioteca PeerJS; o "aperto de mão" inicial usa o servidor público
gratuito do PeerJS). Os outros jogadores só enviam as jogadas.

1. Menu → **🌐 Multiplayer Online** → digite seu nome → **Criar sala**.
2. Envie o **código** (ou o link `…/?sala=CODIGO`) para os amigos; eles clicam em **Entrar**.
3. Cada um escolhe 3 heróis (não pode repetir herói entre Guildas). Vagas vazias: **+ Adicionar IA**.
4. O anfitrião clica **Começar partida**. Áreas Iniciais e jogador inicial são sorteados.

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

## Mapas (cenários)

Os 11 cenários do Livro de Campanha estão jogáveis (transcritos das páginas do livro):

| Círculo | Cenários |
|---|---|
| Exterior | Distrito dos Martelos · Arena do Sol Brilhante · O Portão da Lua · O Viveiro das Águias · A Mansão · Covil dos Orcs |
| Interior | Distrito do Alquimista · Praça da Aurora Vermelha · O Pátio da Universidade · Distrito Sempressombrio |
| Final | O Templo do Amanhecer Crepuscular |

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
