// Gerado por tools/build_maps.py a partir de ref/maps/desc_maps.txt — não edite à mão.
export interface MapLore {
  benefitsFrom: string[];
  benefits: string[];
  title: string;
  pve: { name: string; text: string; gives: string }[];
  reward: string;
  setup: string[];
  rules: string[];
  advantages: string[];
}

export const MAP_LORE: Record<string, MapLore> = {
  "distrito-sempressombrio": {
    "benefitsFrom": [
      "O Portão da Lua",
      "O Viveiro das Águias"
    ],
    "benefits": [
      "O Templo do Amanhecer Crepuscular"
    ],
    "title": "Se um jogador matar a Alma do Lorde Presas, ele completará a Missão \"Matar o Lorde Presas\" e se tornará o \"Forjador de Almas\". Ele não receberá as Maldições Mortais que um Herói recebe quando morre no cenário \"O Templo do Amanhecer Crepuscular\".",
    "pve": [
      {
        "name": "Matar o Lorde Presas",
        "text": "",
        "gives": "Dá Título"
      },
      {
        "name": "Salvar a Nobreza Miserável",
        "text": "Encontre o marcador de Missão Vermelho ou Verde e leve-o para sua área inicial.",
        "gives": "Dá uma carta de Recompensa"
      }
    ],
    "reward": "Capa do Assassino (x2)",
    "setup": [
      "Separe os 8 marcadores de Exploração que serão colocados no tabuleiro e embaralhe-os, com as faces viradas para baixo, junto dos marcadores de Missão Vermelho, Laranja, Verde e Azul. Distribua-os, virados para baixo, pelos Espaços indicados no mapa.",
      "Se algum jogador recebeu o Título \"Senhor das Águias\" por salvar uma águia no cenário \"O Viveiro das Águias\" coloque 4 portais vermelhos, como indicado no mapa.",
      "Neste cenário, utilize todas as miniaturas de Orc para representar os Saqueadores Orcs, inclusive as que estão carregando espadas."
    ],
    "rules": [
      "Se um Herói matar a Alma do Lorde Presas, ele completará imediatamente a Missão \"Matar o Lorde Presas\" e receberá o Título de \"Senhor das Almas\" para o último cenário \"O Templo do Amanhecer Crepuscular\"",
      "Se um Herói encontrar o marcador de Missão Verde (que representa o Rei dos Ladrões) ou o marcador de Missão Vermelho (que representa a Rainha dos Mendigos) e levá-lo para sua área inicial, sem que haja inimigos dividindo o mesmo Espaço, o jogador completará imediatamente a Missão \"Salvar a Realeza Miserável\" Ele descartará o marcador da partida e receberá uma das cartas de Recompensa. Somente um máximo de 2 jogadores poderão completar esta Missão e receber a carta de Recompensa. Um mesmo jogador não poderá descartar os dois marcadores de Missão.",
      "Se um Herói encontrar o marcador de Missão Azul ou Laranja, o marcador será imediatamente substituído por uma Irmã do Prazer. A Irmã do Prazer fará um ataque livre contra o Herói que a encontrou,"
    ],
    "advantages": [
      "Se um jogador receber o Título \"Guardião do Portão\" por ter sido o primeiro a ajudar a fechá-lo no cenário \"O Portão da Lua\" ele controlará os marcadores de Entrada de Monstro. Em vez de rolar os dados para colocar os Monstros de volta, o Guardião do Portão determinará se cada monstro será removido da partida ou colocado no marcador disponível de Entrada de Monstro à sua escolha.",
      "Somente os jogadores que receberam o Título \"Senhor das Águias\", por salvar uma águia no cenário \"O Viveiro das Águias\" poderão usar os portais vermelhos. Os portais azuis estarão disponíveis para todos os jogadores."
    ]
  },
  "patio-da-universidade": {
    "benefitsFrom": [
      "O Viveiro das Águias",
      "Covil dos Orcs"
    ],
    "benefits": [
      "O Templo do Amanhecer Crepuscular"
    ],
    "title": "O primeiro jogador que recuperar 2 Tomos (marcadores de Missão) completará a Missão \"Encontrar os Tomos\" e se tornará o \"Mestre do Conhecimento\" Ele poderá escolher quais marcadores de Exploração serão colocados e onde colocar esses marcadores no cenário \"O Templo do Amanhecer Crepuscular\" O jogador ainda terá de seguir o mapa do cenário.",
    "pve": [
      {
        "name": "Encontrar os Tomos",
        "text": "Recupere 2 marcadores de Missão (Vermelho, Azul, Verde ou Laranja).",
        "gives": "Dá Título"
      },
      {
        "name": "Matar o Troll",
        "text": "",
        "gives": "Dá uma carta de Recompensa"
      },
      {
        "name": "Matar o Minotauro",
        "text": "",
        "gives": "Dá uma carta de Recompensa"
      }
    ],
    "reward": "Tomo da Iluminação (x2)",
    "setup": [
      "Separe os 8 marcadores de Exploração que serão colocados no tabuleiro e embaralhe-os, com as faces viradas para baixo, junto dos marcadores de Missão Laranja e Azul. Distribua-os, virados para baixo, pelos Espaços indicados no mapa.",
      "Se algum jogador recebeu o Título \"Senhor das Águias\" por salvar uma águia no cenário \"O Viveiro das Águias\" coloque 4 portais vermelhos, como indicado no mapa.",
      "Neste cenário, utilize todas as miniaturas de Orc para representar os Saqueadores Orcs, inclusive as que estão carregando espadas."
    ],
    "rules": [
      "Se os Heróis de um jogador tiverem 2 dos 4 marcadores de Missão (Vermelho, Azul, Verde ou Laranja), ele completará imediatamente a Missão \"Encontrar os Tomos\" e receberá o Título de \"Senhor do Conhecimento\". Esses marcadores ainda estão em jogo, por isso outros jogadores podem completar a Missão, mas não receberão o Título.",
      "Se um Herói matar o Troll, ele completará imediatamente a Missão \"Matar o Troll\" e receberá uma das cartas de Recompensa.",
      "Se um Herói matar o Minotauro, ele completará imediatamente a Missão \"Matar o Minotauro\" e receberá uma das cartas de Recompensa."
    ],
    "advantages": [
      "Somente os jogadores que receberam o Título \"Senhor das Águias\" por salvar uma águia no cenário \"O Viveiro das Águias\" poderão usar os portais vermelhos. Os portais azuis estarão disponíveis para todos os jogadores.",
      "Qualquer jogador que tenha recebido o Título \"Destruidor da Pedra Sangrenta\" por destruir uma pedra mágica no cenário \"Covil dos Orcs\" enfrentará versões mais fracas dos Orcs.",
      "Quando os Heróis desse jogador entrarem em combate com um Orc, use sua carta de Monstro nível 2-3 em vez da carta de Monstro nível 4-5."
    ]
  },
  "praca-da-aurora-vermelha": {
    "benefitsFrom": [
      "A Mansão",
      "Covil dos Orcs"
    ],
    "benefits": [
      "O Templo do Amanhecer Crepuscular"
    ],
    "title": "Se um jogador recuperar e escoltar um dos membros da Resistência (marcador de Missão Laranja ou Azul), ele completará a Missão \"Ajudar a Resistência\" e se tornará o \"Líder Rebelde\" A Resistência matará os 2 orcs que são colocados próximos da área inicial do jogador na preparação do cenário \"O Templo do Amanhecer Crepuscular\".",
    "pve": [
      {
        "name": "Ajudar a Resistência",
        "text": "Recupere o marcador de Missão Laranja ou Azul e leve-o para a área indicada no mapa.",
        "gives": "Dá Título"
      },
      {
        "name": "Matar o Lorde Presas",
        "text": "Pise no marcador de Missão Vermelho ou Verde para tentar invocar a Sombra do Lorde Presas.",
        "gives": "Dá uma carta de Recompensa"
      }
    ],
    "reward": "Coroa de Sangue (x1)",
    "setup": [
      "Se um jogador recebeu o Título \"Caçador de Trolls\" por matar Schmetterling no cenário \"A Mansão\" ele então colocará uma das cartas de Recompensa \"Schmetterling\" disponíveis na área designada \"Esconderijo do Troll\" no mapa.",
      "Coloque a miniatura do Lorde Presas próxima do tabuleiro."
    ],
    "rules": [
      "Se um Herói recuperar um dos membros da Resistência (marcador de Missão Laranja ou Azul), ele deverá escoltar o marcador até um dos espaços indicados por uma \"!\" no mapa.",
      "Quando o herói que está carregando o marcador chegar na área indicada, e não houver nenhum inimigo dividindo o mesmo Espaço, o jogador completará a Missão \"Ajudar a Resistência\" e removerá esse marcador da partida.",
      "Se um Herói entrar no Espaço que contém os marcadores de Missão Vermelho ou Verde, remova imediatamente esse marcador da partida e role para colocar em jogo a Sombra do Lorde Presas (e somente ela). Se o marcador de Entrada de Monstro rolado estiver disponível, coloque a miniatura do Lorde Presas nesse Espaço. Caso contrário, deixe-a próxima do tabuleiro. Se a Sombra do Lorde Presas entrar no tabuleiro, o jogador que matá-la completará a Missão \"Matar o Lorde Presas\" e receberá a Carta de Recompensa."
    ],
    "advantages": [
      "Se um jogador receber o Título de \"Caçador de Trolls\" por matar Schmetterling no cenário \"A Mansão\" esse jogador será o único que conseguirá abrir a porta fechada que dá acesso para o \"Esconderijo do Troll\" e receberá a carta de Recompensa que está dentro desse Esconderijo.",
      "Qualquer jogador que tenha recebido o Título \"Destruidor da Pedra Sangrenta\" por destruir uma pedra mágica no cenário \"Covil dos Orcs\" enfrentará versões mais fracas dos Orcs.",
      "Quando os Heróis desse jogador entrarem em combate com um Orc, use sua carta de Monstro nível 2-3 em vez da carta de Monstro nível 4-5."
    ]
  },
  "distrito-do-alquimista": {
    "benefitsFrom": [
      "O Portão da Lua",
      "A Mansão"
    ],
    "benefits": [
      "O Templo do Amanhecer Crepuscular"
    ],
    "title": "Se um jogador recuperar sua respectiva Bomba (Marcador de Missão), ele completará a Missão \"Recuperar a Bomba\" e se tornará o \"Protetor do Fogo\". O jogador ficará imune aos efeitos de Armadilhas e Tesouros (marcadores de Exploração) no cenário \"O Templo do Amanhecer Crepuscular\".",
    "pve": [
      {
        "name": "Recuperar a Bomba",
        "text": "Recupere seu respectivo marcador de Missão.",
        "gives": "Dá Título"
      },
      {
        "name": "Matar uma Irmã",
        "text": "",
        "gives": "Dá uma carta de Recompensa"
      }
    ],
    "reward": "Bomba (x2)",
    "setup": [
      "Separe os marcadores de Missão Verde, Laranja, Azul e Vermelho e coloque-os virados com as faces para cima na ponta extrema oposta das áreas iniciais de suas respectivas Guildas, como indicado no mapa.",
      "Se um jogador recebeu o Título \"Caçador de Trolls\" por matar Schmetterling no cenário \"A Mansão\" ele então colocará uma das cartas de Recompensa \"Schmetterling\" disponíveis na área designada \"Esconderijo do Troll\" no mapa.",
      "Neste cenário, utilize todas as miniaturas de Orc para representar os Saqueadores Orcs, inclusive as que estão carregando espadas."
    ],
    "rules": [
      "Se o Herói ativo estiver no mesmo Espaço que o marcador de Missão da cor da sua Guilda, e não houver nenhum Inimigo nesse Espaço, o Herói recuperará o marcador, completando, assim, a Missão \"Recuperar a Bomba\"",
      "Se um Herói matar A Irmã da Dor ou A Irmã do Prazer, ele completará imediatamente a Missão \"Matar uma Irmã\" e receberá uma das cartas de Recompensa. O Capitão Orc, em vez de ir para o tabuleiro de Entrada de Monstro, retorna para a caixa do jogo, por isso somente um máximo de 2 jogadores poderá completar a Missão e receberá a recompensa."
    ],
    "advantages": [
      "Se um jogador receber o Título \"Guardião do Portão\" por ter sido o primeiro a ajudar a fechá-lo no cenário \"O Portão da Lua\", ele controlará os marcadores de Entrada de Monstro. Em vez de rolar os dados para colocar os Monstros de volta, o Guardião do Portão determinará se cada monstro será removido da partida ou colocado no marcador disponível de Entrada de Monstro à sua escolha.",
      "Se um jogador receber o Título de \"Caçador de Trolls\" por matar Schmetterling no cenário \"A Mansão\", esse jogador será o único que conseguirá abrir a porta fechada que dá acesso para o \"Esconderijo do Troll\" e receberá a carta de Recompensa que está dentro desse Esconderijo."
    ]
  },
  "covil-dos-orcs": {
    "benefitsFrom": [],
    "benefits": [
      "Praça da Aurora Vermelha",
      "O Pátio da Universidade"
    ],
    "title": "Se um jogador destruir uma das pedras mágicas, ele completará a Missão \"Destruir Uma Pedra\", irá se tornar o \"Destruidor da Pedra Sangrenta\" e enfrentará a versão mais fraca dos orcs nos cenários \"Praça da Aurora Vermelha\" e \"O Pátio da Universidade\". Todos os outros jogadores enfrentarão os Orcs no nível normal desse cenário, mas o jogador (ou jogadores) que tiver o Título \"Destruidor da Pedra Sangrenta\" enfrentará os Orcs no nível com a próxima versão mais inferior.",
    "pve": [
      {
        "name": "Destruir Uma Pedra",
        "text": "",
        "gives": "Dá Título"
      },
      {
        "name": "Matar o Capitão Orc",
        "text": "",
        "gives": "Dá uma carta de Recompensa"
      }
    ],
    "reward": "Maldição dos Peles-Verdes (x2)",
    "setup": [
      "Insira as bases plásticas roxas nas miniaturas dos Capitães Orcs para diferenciá-los dos Saqueadores Orcs."
    ],
    "rules": [
      "Se um jogador matar 1 dos Capitães Orcs, ele completará imediatamente a Missão \"Matar o Capitão Orc\" e receberá uma das cartas de Recompensa. O Capitão Orc, em vez de ir para o tabuleiro de Entrada de Monstro, retorna para a caixa do jogo, por isso somente um máximo de 2 jogadores poderá completar a Missão e receber a recompensa.",
      "Quando um Herói entrar em um Espaço que contém um dos quatro marcadores de Missão, e não houver nenhum Inimigo nesse mesmo Espaço, o jogador destruirá a pedra mágica, retornará o marcador de Missão para a caixa do jogo e completará a Missão \"Destruir Uma Pedra\" Cada jogador poderá destruir somente uma única pedra."
    ],
    "advantages": []
  },
  "mansao": {
    "benefitsFrom": [],
    "benefits": [
      "Distrito do Alquimista",
      "Praça da Aurora Vermelha"
    ],
    "title": "Se um jogador matar Schmetterling, esse jogador completará a Missão \"Matar o Troll\", irá se tornar o \"Caçador de Trolls\" e será o único a ter acesso aos esconderijos dos cenários \"Distrito do Alquimista\" e \"Praça da Aurora Vermelha\". Esses esconderijos guardam os prêmios especiais do Troll.",
    "pve": [
      {
        "name": "Matar o Troll",
        "text": "",
        "gives": "Dá Título"
      },
      {
        "name": "Salvar os Nobres",
        "text": "Recupere os marcadores de Missão Vermelho, Verde, Azul ou Laranja.",
        "gives": "Dá uma carta de Recompensa"
      }
    ],
    "reward": "Coração de Angelis (x2)",
    "setup": [
      "Insira as bases plásticas roxas nas miniaturas dos Capitães Orcs para diferenciá-los dos Saqueadores Orcs.",
      "Ao jogar este cenário, utilize a carta de Monstro Schmetterling em vez da carta de Monstro Troll."
    ],
    "rules": [
      "Se um Herói matar Schmetterling, ele completará imediatamente a Missão \"Matar o Troll\".",
      "Se um jogador recuperar os marcadores de Missão Vermelho, Verde, Azul ou Laranja, ele completará imediatamente a Missão \"Salvar os Lordes\" e trocará o marcador por uma das Cartas de Recompensa. O mesmo jogador poderá recuperar apenas 1 marcador de Missão. Todos os jogadores podem completar esta Missão, mas apenas o primeiro e o segundo jogadores que a completarem receberão cartas de Recompensa."
    ],
    "advantages": []
  },
  "viveiro-das-aguias": {
    "benefitsFrom": [],
    "benefits": [
      "O Pátio da Universidade",
      "Distrito Sempressombrio"
    ],
    "title": "Se um jogador resgatar uma das águias (marcadores de Missão Vermelho, Verde, Azul ou Laranja e escoltá-la até um portal azul, o jogador completará a Missão \"Resgatar as Águias\", irá se tornar o \"Senhor das Águias\" e terá acesso a um conjunto exclusivo de portais nos cenários \"O Pátio da Universidade\" e \"Distrito Sempressombrio\". Esses cenários têm 2 conjuntos diferentes de portais. Os portais azuis podem ser usados por todos os jogadores, mas os portais vermelhos só podem ser usados pelos jogadores que tiverem o Título \"Senhor das Águias\"",
    "pve": [
      {
        "name": "Resgatar as Águias",
        "text": "Recupere 1 marcador de Missão e leve-o para 1 marcador de portal azul.",
        "gives": "Dá Título"
      },
      {
        "name": "Matar o Feral Martelador",
        "text": "",
        "gives": "Dá uma carta de Recompensa"
      }
    ],
    "reward": "Lança Feral (x2)",
    "setup": [
      "Insira as bases plásticas roxas nas miniaturas dos Capitães Orcs para diferenciá-los dos Saqueadores Orcs."
    ],
    "rules": [
      "Cada Guilda só pode ter um único marcador de Missão por vez.",
      "Se um jogador resgatar uma das Águias (marcadores de Missão Vermelho, Verde, Azul ou Laranja), ele deverá escoltar o marcador até o portal azul. Quando um Herói que está carregando o marcador entrar no Espaço com o portal, e não houver nenhum inimigo nesse Espaço, ele descartará seu marcador de Missão da partida e completará a Missão \"Resgatar as Águias\".",
      "Se um Herói matar um Feral Martelador, ele completará a Missão \"Matar o Feral Martelador\" e receberá imediatamente uma das cartas de Recompensa. O Feral Martelador, em vez de ir para o tabuleiro de Entrada de Monstro, retorna para a caixa do jogo, por isso somente um máximo de 2 jogadores poderá completar a Missão e receber a recompensa."
    ],
    "advantages": []
  },
  "portao-da-lua": {
    "benefitsFrom": [],
    "benefits": [
      "Distrito do Alquimista",
      "Distrito Sempressombrio"
    ],
    "title": "O primeiro jogador a pisar nos marcadores de Missão Vermelho ou Verde completará a Missão \"Fechar o Portão\" e se tornará o \"Guardião do Portão\". O jogador passará a controlar os marcadores de Entrada de Monstro nos cenários \"Distrito do Alquimista\" e \"Distrito Sempressombrio\". Ao jogar um desses cenários, e tiver que colocar os Monstros de volta no tabuleiro, em vez de rolar os dados para fazer isso, o Guardião do Portão decidirá se o Monstro será removido da partida ou se será colocado de volta em qualquer marcador de Entrada de Monstro disponível.",
    "pve": [
      {
        "name": "Fechar o Portão",
        "text": "Pise no marcador de Missão Vermelho ou Verde para ajudar a fechar o portão (recupere 1 marcador de Entrada de Monstro).",
        "gives": "Dá Título"
      },
      {
        "name": "Matar o Capitão Orc",
        "text": "",
        "gives": "Dá uma carta de Recompensa"
      }
    ],
    "reward": "Espada do Capitão (x2)",
    "setup": [
      "Insira as bases plásticas roxas nas miniaturas dos Capitães Orcs para diferenciá-los dos Saqueadores Orcs."
    ],
    "rules": [
      "Quando o Herói ativo estiver em um Espaço que contém marcadores Vermelhos ou Verdes, e não houver nenhum inimigo no mesmo Espaço, ele completará a Missão \"Fechar o Portão\" Ele escolherá e removerá imediatamente 1 marcador de Entrada de Monstro do tabuleiro. Além disso, o primeiro jogador a completar esta Missão receberá o Título de \"Guardião do Portão\" A Missão \"Fechar o Portão\" continuará disponível para os outros jogadores, mas depois que a completarem, eles não receberão o Título associado a essa Missão.",
      "Nota: Os marcadores de Missão não podem ser retirados do tabuleiro.",
      "Se um Herói matar 1 dos Capitães Orcs, ele completará imediatamente a Missão \"Matar o Capitão Orc\" e receberá uma das cartas de Recompensa. Os Capitães Orcs, em vez de irem para o tabuleiro de Entrada de Monstro, retornam para a caixa do jogo, por isso somente um máximo de 2 jogadores poderá completar a Missão e receber a recompensa."
    ],
    "advantages": []
  },
  "arena-do-sol-brilhante": {
    "benefitsFrom": [],
    "benefits": [],
    "title": "Este cenário não dá nenhum Título.",
    "pve": [
      {
        "name": "Rei da Arena",
        "text": "Acabe 5 turnos com seu Herói ativado em 1 marcador de Missão, ou 1 turno em cada marcador de Missão.",
        "gives": "Dá uma carta de Recompensa"
      },
      {
        "name": "Matar o Minotauro",
        "text": "",
        "gives": ""
      }
    ],
    "reward": "Escudo das Almas (x2)",
    "setup": [
      "Ao jogar este cenário, utilize a carta de Monstro Urratouro em vez da carta de Monstro Minotauro.",
      "Neste cenário, utilize todas as miniaturas de Orc para representar os Saqueadores Orcs, inclusive as que estão carregando espadas."
    ],
    "rules": [
      "Quando um Herói terminar sua ativação no mesmo Espaço de um dos 4 marcadores de Missão, e sem nenhum Inimigo nesse mesmo Espaço, coloque um dos marcadores de Guilda desse Herói em seu Espaço. Quando um jogador colocar seu 5° marcador de Guilda em um marcador de Missão, ou pelo menos 1 marcador de Guilda em cada um dos 4 marcadores de Missão, ele completará a Missão \"Rei da Arena\". Os 2 primeiros jogadores que completarem a Missão recebem 1 das cartas de Recompensa.",
      "Nota: Os marcadores de Missão não podem ser retirados do tabuleiro.",
      "Se um jogador matar o Urratouro, ele completará a Missão \"Matar o Minotauro\"."
    ],
    "advantages": []
  },
  "distrito-dos-martelos": {
    "benefitsFrom": [],
    "benefits": [],
    "title": "Este cenário não dá nenhum Título.",
    "pve": [
      {
        "name": "Encontrar as Armas Perdidas",
        "text": "Recupere 1 marcador de Missão.",
        "gives": "Dá uma carta de Recompensa"
      },
      {
        "name": "Matar 3 Monstros",
        "text": "",
        "gives": ""
      }
    ],
    "reward": "Quebra-Crânio (x2)",
    "setup": [
      "Neste cenário, utilize todas as miniaturas de Orc para representar os Saqueadores Orcs, inclusive as que estão carregando espadas."
    ],
    "rules": [
      "Se um jogador recuperar o marcador de Missão Vermelho ou Azul, ele completará imediatamente a Missão \"Encontrar as Armas Perdidas\" e trocará o marcador por uma das 2 cartas de Recompensa. Somente um máximo de 2 jogadores podem completar esta Missão e recuperar a Recompensa.",
      "Se um jogador matar 3 monstros, ele completará imediatamente a Missão \"Matar 3 Monstros\" Quando um jogador matar seu primeiro Orc ou Goblin, coloque o marcador de Guilda desse jogador no espaço \"1\" da carta de Missão. À medida que ele matar mais Monstros, avance seu marcador para o espaço seguinte até chegar no espaço \"3\" indicando que ele completou a Missão."
    ],
    "advantages": []
  }
};
