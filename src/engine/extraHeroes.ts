// Gerado por tools/build_extra_heroes.py — Heróis extras (só na Biblioteca; ainda não jogáveis).
// art: retrato em public/portraits/x_<id>.webp · model: corpo inteiro em public/extras/x_<id>.webp
export interface ExtraHero { id: string; name: string; def: number; hp: number; ability: string; text: string; art: boolean; model: boolean; rr?: number }
export const EXTRA_HEROES: ExtraHero[] = [
  {
    "id": "bob",
    "name": "Bob",
    "def": 2,
    "hp": 3,
    "ability": "Zás-Trás",
    "text": "Se rolar algum ✷ num ataque Mágico, qualquer Herói vivo da sua Guilda pode ser colocado Perto do alvo.",
    "art": true,
    "model": true
  },
  {
    "id": "black_newt",
    "name": "Black Newt",
    "def": 3,
    "hp": 2,
    "ability": "Cheiro de Sangue",
    "text": "Rola +1 dado nas rolagens de ataque contra um alvo ferido.",
    "art": true,
    "model": true
  },
  {
    "id": "bowie",
    "name": "Bowie",
    "def": 4,
    "hp": 2,
    "ability": "Bate e Corre",
    "text": "Logo depois de atacar com uma carta de ataque de Arco, ganha 2 Pontos de Movimento extras para usar na hora.",
    "art": true,
    "model": true
  },
  {
    "id": "chooloo",
    "name": "Chooloo",
    "def": 3,
    "hp": 3,
    "ability": "Ataque Mental",
    "text": "Pode exaustar a carta de Herói para Atordoar um Inimigo em Linha de Visão.",
    "art": true,
    "model": true
  },
  {
    "id": "elysia",
    "name": "Elysia",
    "def": 3,
    "hp": 3,
    "ability": "Olhar Petrificante",
    "text": "Para cada ✷ que rolar num ataque, coloca 1 marcador da sua Guilda no alvo. O alvo perde 1 Ponto de Movimento por marcador. Descansar remove os marcadores. Sem efeito em Vilões.",
    "art": true,
    "model": true
  },
  {
    "id": "frowny_faceless",
    "name": "Frowny Faceless",
    "def": 3,
    "hp": 3,
    "ability": "Feitiço Tenaz",
    "text": "Não exausta a carta de ataque Mágica ao atacar um alvo ferido.",
    "art": true,
    "model": true
  },
  {
    "id": "hitch",
    "name": "Hitch",
    "def": 2,
    "hp": 4,
    "ability": "Suga-Mente",
    "text": "Dividindo o Espaço com um Herói, pode atacar com uma carta de Ataque não exaustada desse Herói, sem exaustá-la.",
    "art": true,
    "model": true
  },
  {
    "id": "king_of_thieves",
    "name": "King of Thieves",
    "def": 2,
    "hp": 4,
    "ability": "Cobiça",
    "text": "Rola +2 dados de ataque se o alvo tiver algum marcador de Exploração.",
    "art": true,
    "model": true
  },
  {
    "id": "koba",
    "name": "Koba",
    "def": 2,
    "hp": 4,
    "ability": "Teleporte",
    "text": "Pode exaustar a carta de Herói para se colocar Perto de qualquer Herói Aliado.",
    "art": true,
    "model": true
  },
  {
    "id": "lilith",
    "name": "Lilith",
    "def": 2,
    "hp": 4,
    "ability": "Ritual de Sangue",
    "text": "Para cada Ferimento que causar com um ataque Mágico, cura 1 dos seus Ferimentos.",
    "art": true,
    "model": true
  },
  {
    "id": "lord_fang",
    "name": "Lord Fang",
    "def": 5,
    "hp": 2,
    "ability": "Chamado",
    "text": "Pode exaustar a carta de Herói para colocar um Herói em Linha de Visão num Espaço Perto dele.",
    "art": true,
    "model": true
  },
  {
    "id": "lydia",
    "name": "Lydia",
    "def": 2,
    "hp": 4,
    "ability": "Lâmina Sugadora",
    "text": "Para cada Ferimento que causar com um ataque de Espada, Machado ou Lança, cura 1 dos seus Ferimentos.",
    "art": true,
    "model": true
  },
  {
    "id": "monkey_king",
    "name": "Monkey King",
    "def": 2,
    "hp": 4,
    "ability": "Trapaceiro",
    "text": "Cada ✷ na rolagem de Defesa conta um bloqueio extra. Se rolar algum ✷, pode se colocar num Espaço Perto.",
    "art": true,
    "model": true
  },
  {
    "id": "monkey_queen",
    "name": "Monkey Queen",
    "def": 3,
    "hp": 3,
    "ability": "Macaco Vê, Macaco Faz",
    "text": "A qualquer momento da ativação, pode copiar a Habilidade Natural de um Herói em Linha de Visão até o fim do turno.",
    "art": true,
    "model": true
  },
  {
    "id": "montoya",
    "name": "Montoya",
    "def": 1,
    "hp": 5,
    "ability": "Mestre Espadachim",
    "text": "Pode exaustar a carta de Herói para somar +2 dados a uma carta de ataque de Espada.",
    "art": true,
    "model": true
  },
  {
    "id": "morgan",
    "name": "Morgan",
    "def": 1,
    "hp": 1,
    "ability": "Aura Mística",
    "text": "+1 dado de Defesa e +1 de Vida para cada carta de ataque Mágica equipada.",
    "art": true,
    "model": true
  },
  {
    "id": "pigsy",
    "name": "Pigsy",
    "def": 2,
    "hp": 4,
    "ability": "Hora do Lanche",
    "text": "Cura todos os seus Ferimentos sempre que a Guilda Descansa.",
    "art": true,
    "model": true
  },
  {
    "id": "pluck",
    "name": "Pluck",
    "def": 3,
    "hp": 3,
    "ability": "Tiro Explosivo",
    "text": "Se acertar um ataque a Distância não Mágico, pode mover os personagens do Espaço do alvo até 2 Espaços. Não aciona Reação de Alerta.",
    "art": true,
    "model": true
  },
  {
    "id": "prince_aaron",
    "name": "Prince Aaron",
    "def": 3,
    "hp": 3,
    "ability": "Presença Poderosa",
    "text": "Todos os Inimigos Perto dele têm −2 de Defesa contra ataques dele ou dos seus Aliados.",
    "art": true,
    "model": true
  },
  {
    "id": "queen_of_beggars",
    "name": "Queen of Beggars",
    "def": 1,
    "hp": 4,
    "ability": "Doces ou Travessuras",
    "text": "Se terminar o movimento Perto de um Herói Inimigo, ele precisa lhe dar um marcador de Exploração ou sofrer 1 Ferimento. Limite de 1 Herói por turno.",
    "art": true,
    "model": true
  },
  {
    "id": "serious_faceless",
    "name": "Serious Faceless",
    "def": 3,
    "hp": 3,
    "ability": "Feitiço da Pressa",
    "text": "Logo depois de atacar com uma carta de ataque Mágica, ganha 2 Pontos de Movimento extras para usar na hora.",
    "art": true,
    "model": true
  },
  {
    "id": "smiley_faceless",
    "name": "Smiley Faceless",
    "def": 3,
    "hp": 3,
    "ability": "Feitiço Trapaceiro",
    "text": "Ao atacar com uma carta de ataque Mágica, pode usar todas as Rerrolagens da sua Guilda.",
    "art": true,
    "model": true,
    "rr": 1
  },
  {
    "id": "sonja",
    "name": "Sonja",
    "def": 1,
    "hp": 4,
    "ability": "Frenesi",
    "text": "Rola +1 dado por Inimigo Perto nas rolagens de ataque Próximo não Mágico.",
    "art": true,
    "model": true
  },
  {
    "id": "sting",
    "name": "Sting",
    "def": 1,
    "hp": 5,
    "ability": "Pária",
    "text": "Rola +1 dado ao atacar Monstros.",
    "art": true,
    "model": true
  },
  {
    "id": "surprised_faceless",
    "name": "Surprised Faceless",
    "def": 3,
    "hp": 3,
    "ability": "Feitiço da Banshee",
    "text": "Se o ataque Mágico causar Ferimento, o alvo fica Atordoado.",
    "art": true,
    "model": true
  },
  {
    "id": "the_heartless",
    "name": "The Heartless",
    "def": 1,
    "hp": 4,
    "ability": "Ataque Cardíaco",
    "text": "Ao atacar com uma carta de ataque de Espada, o alvo não rola dados de Defesa.",
    "art": true,
    "model": true
  },
  {
    "id": "the_nameless",
    "name": "The Nameless",
    "def": 0,
    "hp": 6,
    "ability": "Mente Brilhante",
    "text": "Se o ataque Mágico rolar algum ✷, outro Herói Aliado pode ser ativado só para fazer o Movimento.",
    "art": true,
    "model": true
  },
  {
    "id": "tomrick",
    "name": "Tomrick",
    "def": 2,
    "hp": 4,
    "ability": "Sorte de Apostador",
    "text": "Depois de rolar um ataque Mágico, pode exaustar a carta de Herói para trocar um dado que falhou por um ✷.",
    "art": true,
    "model": true
  },
  {
    "id": "viktor",
    "name": "Viktor",
    "def": 3,
    "hp": 3,
    "ability": "Caçador",
    "text": "Se o ataque matar o alvo, pode usar outra carta de ataque neste turno.",
    "art": true,
    "model": true
  },
  {
    "id": "aeric",
    "name": "Aeric",
    "def": 1,
    "hp": 5,
    "ability": "Resistência do Panda",
    "text": "Rola +2 dados de Defesa contra ataques a Distância.",
    "art": true,
    "model": true
  },
  {
    "id": "brenna",
    "name": "Brenna",
    "def": 2,
    "hp": 4,
    "ability": "Relâmpago",
    "text": "Uma vez por ativação, pode sofrer 1 Ferimento para causar 1 Ferimento em todos os Inimigos Perto.",
    "art": true,
    "model": true
  },
  {
    "id": "farfalla",
    "name": "Farfalla",
    "def": 2,
    "hp": 4,
    "ability": "Efeito Borboleta",
    "text": "Ao usar uma das suas cartas de Ataque, pode exaustar a carta de Ataque de um Herói Perto no lugar dela.",
    "art": true,
    "model": true
  },
  {
    "id": "haldor",
    "name": "Haldor",
    "def": 1,
    "hp": 5,
    "ability": "Contagem de Corpos",
    "text": "Rola +1 dado em todos os ataques Próximos não Mágicos para cada Herói Inimigo que matou neste cenário.",
    "art": true,
    "model": true
  },
  {
    "id": "hassan",
    "name": "Hassan",
    "def": 3,
    "hp": 3,
    "ability": "Encantado",
    "text": "Nenhuma Rerrolagem pode ser usada ao atacá-lo ou ao se defender do ataque dele.",
    "art": true,
    "model": true
  },
  {
    "id": "leeroy",
    "name": "Leeroy",
    "def": 2,
    "hp": 4,
    "ability": "Lobo Solitário",
    "text": "+1 dado em todas as rolagens enquanto não tiver Aliados em Linha de Visão.",
    "art": true,
    "model": true
  },
  {
    "id": "mchammer",
    "name": "McHammer",
    "def": 1,
    "hp": 5,
    "ability": "Briga",
    "text": "Para cada ✷ que rolar num ataque Próximo não Mágico, pode causar 1 Ferimento a outro Inimigo Perto.",
    "art": true,
    "model": true
  },
  {
    "id": "mittens",
    "name": "Mittens",
    "def": 2,
    "hp": 4,
    "ability": "Garras de Gatinho",
    "text": "Causa 1 Ferimento a qualquer Inimigo que saia de um Espaço Perto dele. Limite de 1 Ferimento por Inimigo por turno.",
    "art": true,
    "model": true
  },
  {
    "id": "nibbles",
    "name": "Nibbles",
    "def": 1,
    "hp": 5,
    "ability": "Devorar",
    "text": "Sempre que mata um Inimigo, cura todos os seus Ferimentos.",
    "art": true,
    "model": true
  },
  {
    "id": "tiaret",
    "name": "Tiaret",
    "def": 1,
    "hp": 5,
    "ability": "Arremesso Selvagem",
    "text": "Pode usar cartas de ataque de Lança e Exóticas como ataques a Distância (ainda precisa de ícones ⚔ Próximo para acertar).",
    "art": true,
    "model": true
  },
  {
    "id": "yun",
    "name": "Yun",
    "def": 2,
    "hp": 4,
    "ability": "Implacável",
    "text": "Se rolar algum ✷ na Defesa, pode restaurar uma das suas cartas.",
    "art": true,
    "model": true
  },
  {
    "id": "zahra",
    "name": "Zahra",
    "def": 2,
    "hp": 4,
    "ability": "Acrobata",
    "text": "No Movimento, entrar num Espaço ocupado por um Herói não lhe custa Ponto de Movimento.",
    "art": true,
    "model": true
  }
];
