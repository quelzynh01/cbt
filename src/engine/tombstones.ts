// Cartas de Lápide (Beyond the Grave, Livro de Campanha p.4-5).
// Ficam viradas em Espaços do mapa; um Herói no Espaço gasta 1 Ponto de Movimento para revelar (mesmo com Inimigo
// no Espaço e sem acionar Reação de Alerta) e o efeito acontece na hora. A maioria ajuda quem revela; algumas
// ativam um Monstro de um nível (quem revelou move e ataca com ele, mas o crédito das mortes é do jogo).
// O livro não traz o texto das 14 cartas: estes efeitos seguem o que ele descreve.

export type TombEffect =
  | 'ativar_menor' | 'ativar_maior' | 'ativar_vilao'
  | 'tesouro' | 'pocao' | 'cura' | 'restaura' | 'passos' | 'furia' | 'mortalha'
  | 'exorcismo' | 'banir_heroi' | 'maldicao' | 'mao';

export interface TombCard { id: string; name: string; effect: TombEffect; text: string; good: boolean }

export const TOMBSTONES: TombCard[] = [
  { id: 't1', name: 'Erguer Lacaio', effect: 'ativar_menor', good: true, text: 'Ative um Lacaio Menor: ele se move e ataca um Herói à sua escolha.' },
  { id: 't2', name: 'Chamado Sombrio', effect: 'ativar_maior', good: true, text: 'Ative um Lacaio Maior: ele se move e ataca um Herói à sua escolha.' },
  { id: 't3', name: 'Despertar Profano', effect: 'ativar_vilao', good: true, text: 'Ative um Vilão Menor: ele se move e ataca um Herói à sua escolha.' },
  { id: 't4', name: 'Tesouro Enterrado', effect: 'tesouro', good: true, text: 'Sua Guilda ganha 2 moedas.' },
  { id: 't5', name: 'Ladrão de Túmulos', effect: 'pocao', good: true, text: 'Este Herói ganha uma Poção de Cura.' },
  { id: 't6', name: 'Bênção dos Ancestrais', effect: 'cura', good: true, text: 'Este Herói cura todos os seus Ferimentos.' },
  { id: 't7', name: 'Sopro de Vida', effect: 'restaura', good: true, text: 'Este Herói restaura todas as suas cartas.' },
  { id: 't8', name: 'Passos Fantasmas', effect: 'passos', good: true, text: 'Este Herói ganha 2 Pontos de Movimento.' },
  { id: 't9', name: 'Fúria dos Mortos', effect: 'furia', good: true, text: 'O próximo ataque deste Herói nesta ativação rola +2 dados.' },
  { id: 't10', name: 'Mortalha', effect: 'mortalha', good: true, text: 'Este Herói rola +2 dados de Defesa até o próximo turno da sua Guilda.' },
  { id: 't11', name: 'Exorcismo', effect: 'exorcismo', good: true, text: 'Mande um Monstro (não Vilão) em Linha de Visão para o Tabuleiro de Entrada.' },
  { id: 't12', name: 'Portal do Além', effect: 'banir_heroi', good: true, text: 'Mande um Herói Inimigo em Linha de Visão para o Tabuleiro de Entrada.' },
  { id: 't13', name: 'Maldição da Cripta', effect: 'maldicao', good: false, text: 'Este Herói sofre 1 Ferimento.' },
  { id: 't14', name: 'Mão que Sai da Terra', effect: 'mao', good: false, text: 'O primeiro Monstro do Tabuleiro de Entrada volta Perto deste Herói.' },
];
export const TOMB: Record<string, TombCard> = Object.fromEntries(TOMBSTONES.map(t => [t.id, t]));
