// Títulos da campanha (Livro de Campanha). Cada Título dá vantagem em cenários específicos.
export const TITLES: Record<string, string> = {
  guardiao_portao: 'Guardião do Portão',
  destruidor_pedra: 'Destruidor da Pedra Sangrenta',
  senhor_aguias: 'Senhor das Águias',
  cacador_trolls: 'Caçador de Trolls',
  protetor_fogo: 'Protetor do Fogo',
  mestre_conhecimento: 'Mestre do Conhecimento',
  lider_rebelde: 'Líder Rebelde',
  forjador_almas: 'Forjador de Almas',
  // Beyond the Grave
  orador_mortos: 'Orador dos Mortos',
  mente_mestra: 'Mente Mestra',
  purificador: 'Purificador',
  casamenteiro: 'Casamenteiro',
  coveiro: 'Coveiro',
  capitao_milicia: 'Capitão da Milícia',
  mestre_morte: 'Mestre da Morte',
  alquimista: 'Alquimista',
};

export const TITLE_TEXT: Record<string, string> = {
  guardiao_portao: 'No Distrito do Alquimista e no Distrito Sempressombrio, os Monstros do Cemitério não voltam ao tabuleiro.',
  destruidor_pedra: 'No Pátio da Universidade e na Praça da Aurora Vermelha, os Orcs e Goblins enfrentam você com a carta de um nível abaixo.',
  senhor_aguias: 'No Pátio da Universidade e no Distrito Sempressombrio, só você pode usar os portais vermelhos.',
  cacador_trolls: 'No Distrito do Alquimista e na Praça da Aurora Vermelha, só você abre a porta do Esconderijo do Troll e leva a carta guardada lá.',
  protetor_fogo: 'No Templo do Amanhecer Crepuscular, imune aos efeitos extras de Armadilhas e Baús.',
  mestre_conhecimento: 'No Templo do Amanhecer Crepuscular, escolheria os marcadores de Exploração (ainda não implementado).',
  lider_rebelde: 'No Templo do Amanhecer Crepuscular, a Resistência mata 2 Orcs perto da sua Área Inicial.',
  forjador_almas: 'No Templo do Amanhecer Crepuscular, seus Heróis não recebem Maldições Mortais ao morrer (último cenário).',
  orador_mortos: 'No Santuário Negro e no Moinho das Almas, seus Heróis ganham +1 Rerrolagem por personagem no Tabuleiro de Entrada.',
  mente_mestra: 'No Moinho das Almas e no Laboratório Secreto, as Reações que você provoca atacam outro Herói Perto do Monstro, se houver.',
  purificador: 'No Santuário Negro e no Laboratório Secreto, ressuscitaria sem Descansar (ainda não implementado).',
  casamenteiro: 'No Mausoléu Profano, ativaria o Frank a cada Inimigo morto (ainda não implementado).',
  coveiro: 'No Mausoléu Profano, removeria Maldições Mortais por 1 moeda (ainda não implementado).',
  capitao_milicia: 'No Mausoléu Profano, só você passa pela porta trancada dos fundos do Templo (e usa o portal de dentro).',
  mestre_morte: 'No Mausoléu Profano, cada Inimigo que seus Heróis matam revela uma carta de Lápide para você.',
  alquimista: 'No Mausoléu Profano, você começa com uma Poção de Cura, uma Revigorante e uma de Turno Adicional.',
};
