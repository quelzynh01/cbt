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
};
