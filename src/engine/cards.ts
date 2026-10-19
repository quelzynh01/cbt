import type { AttackType } from './types';

// Cartas de Arcadia Quest (fonte: ref/wiki/items.csv e rewards.csv).
// Iniciais (I), Melhorias por nível (1-5) e Recompensas (R). `partial`: o efeito especial
// ainda não está implementado no jogo (a carta funciona só com os números).

export type CardKind = 'attack' | 'boost' | 'permanent';

export interface CardFx {
  // ataque
  critExtra?: number; // cada ✷ causa N acertos adicionais
  vsOrcs?: number; // +N dados contra Orcs e Goblins
  vsHeroes?: number; // +N dados contra Heróis
  vsExhausted?: number; // +N dados contra Heróis com cartas exaustadas
  steady?: number; // +N dados se o Herói não fez Movimento
  daze?: 'target' | 'plus1' | 'all'; // causar Ferimento atordoa
  onlyCritSaves?: boolean; // só ✷ na Defesa bloqueia
  extraOnCrit?: boolean; // com ✷, atinge um Inimigo adicional Perto do alvo
  allClose?: boolean; // atinge também todos os Inimigos Perto do alvo
  drain?: 'self' | 'ally1' | 'allies'; // cada acerto cura
  critNoDefense?: boolean; // com ✷, o alvo não rola Defesa
  hate?: boolean; // ✷ contra Herói: exausta todas as cartas dele
  bomb?: boolean; // campo de minas
  astral?: boolean; // só alvos Perto de um Aliado, em qualquer lugar do tabuleiro
  // ampliação
  boostDice?: number;
  boostFor?: 'any' | 'bow' | 'melee_nonmagic' | 'magic';
  selfWound?: number; // o Herói sofre N Ferimentos ao usar
  noExhaust?: boolean; // a carta de Ataque ampliada não é exaustada
  lifesteal?: boolean; // cada Ferimento causado cura 1
  rage?: boolean; // +1 dado por Ferimento no Herói
  // permanentes
  grrr?: number; // uma vez por ataque, sofre N Ferimentos para +N dados
  cleave?: 'one' | 'all'; // Espada/Machado atinge Inimigo(s) adicional(is) Perto do Herói
  retribution?: boolean; // cada acerto cancelado pela Defesa fere o atacante
  genesis?: number; // cura N no início do turno da Guilda
  bookDead?: boolean; // +1 dado por marcador de Morte na Guilda
  lastStand?: boolean; // +X Defesa (X = Ferimentos)
  dragonHeart?: boolean; // ✷ na Defesa = bloqueio extra
  rawr?: number; // +N dados em todos os ataques
  moonShield?: boolean; // dobra os dados de Defesa
  soulseeker?: boolean; // ✷ em ataque de Arco = +1 acerto
  sackBones?: boolean; // cura 2 ao matar um Inimigo
  magicSlots?: number; // espaços extras de inventário para cartas Mágicas
  armor?: boolean; // limite 1 armadura por Herói
}

export interface CardDef {
  id: string;
  name: string;
  code: string;
  kind: CardKind;
  level: string; // 'I' inicial, '1'..'5', 'R' recompensa
  cost: number;
  qty: number;
  attackType?: AttackType;
  dice: number;
  group: string;
  magic?: boolean;
  defBonus?: number;
  hpBonus?: number;
  rerolls?: number;
  text: string;
  fx: CardFx;
  partial?: boolean;
  /** Recompensa: cenário de origem. */
  scenario?: string;
}

type Opt = Partial<Omit<CardDef, 'id' | 'name' | 'code' | 'kind' | 'level' | 'cost' | 'qty' | 'group'>>;

const LIST: CardDef[] = [];
function atk(id: string, name: string, code: string, level: string, qty: number, cost: number, type: AttackType, group: string, dice: number, o: Opt = {}) {
  LIST.push({ id, name, code, kind: 'attack', level, qty, cost, attackType: type, group, dice, magic: group === 'Mágica', text: '', fx: {}, ...o });
}
function perm(id: string, name: string, code: string, level: string, qty: number, cost: number, group: string, o: Opt = {}) {
  LIST.push({ id, name, code, kind: 'permanent', level, qty, cost, group, dice: 0, text: '', fx: {}, ...o });
}
function boost(id: string, name: string, code: string, level: string, qty: number, cost: number, group: string, o: Opt = {}) {
  LIST.push({ id, name, code, kind: 'boost', level, qty, cost, group, dice: 0, text: '', fx: {}, ...o });
}

// ------------------------------------------------------------------ Iniciais
atk('espada_enferrujada', 'Espada Enferrujada', 'S-01', 'I', 4, 0, 'melee', 'Espada', 3);
atk('adaga_aparadora', 'Adaga Aparadora', 'S-02', 'I', 4, 0, 'melee', 'Espada', 2, { defBonus: 1, text: '+1 Defesa (mesmo exaustada).' });
atk('estilingue', 'Estilingue', 'S-03', 'I', 4, 0, 'ranged', 'Arco', 2);
atk('raio_nova', 'Raio Nova', 'S-04', 'I', 4, 0, 'ranged', 'Mágica', 2, { fx: { extraOnCrit: true }, text: 'Se rolar algum ✷, pode atingir um Inimigo adicional Perto do alvo.' });
atk('drenar_vida', 'Drenar Vida', 'S-05', 'I', 4, 0, 'ranged', 'Mágica', 2, { fx: { drain: 'self' }, text: 'Cada acerto cura 1 Ferimento deste Herói.' });

// ------------------------------------------------------------------ Nível 1
atk('lamina_confiavel', 'Lâmina Confiável', '01-01', '1', 3, 1, 'melee', 'Espada', 3, { defBonus: 1, rerolls: 1 });
atk('sangradora', 'Sangradora', '01-02', '1', 2, 2, 'melee', 'Machado', 3, { fx: { critExtra: 1 }, text: 'Cada ✷ causa 1 acerto adicional.' });
atk('esmaga_orcs', 'Esmaga-Orcs', '01-03', '1', 1, 8, 'melee', 'Martelo', 4, { fx: { vsOrcs: 1 }, text: '+1 dado contra Orcs e Goblins.' });
atk('arco_crescente', 'Arco Crescente', '01-04', '1', 3, 3, 'ranged', 'Arco', 3);
atk('rajada_vento', 'Rajada de Vento', '01-05', '1', 3, 4, 'ranged', 'Mágica', 3, { partial: true, text: 'Se acertar, move o alvo até 3 Espaços (sem Reação de Alerta).' });
perm('anel_sol', 'Anel do Sol', '01-06', '1', 2, 0, 'Joia', { rerolls: 1 });
boost('anel_lua', 'Anel da Lua', '01-07', '1', 2, 4, 'Joia', { fx: { boostDice: 1, boostFor: 'any' }, text: '+1 dado em uma carta de Ataque.' });
perm('pele_orc', 'Pele de Orc', '01-08', '1', 2, 5, 'Armadura', { defBonus: 2, fx: { armor: true }, text: 'Limite de 1 armadura por Herói.' });
perm('grrr', 'Grrrrrrrrr!', '01-09', '1', 2, 7, 'Habilidade', { fx: { grrr: 1 }, text: 'Uma vez por ataque, pode sofrer 1 Ferimento para +1 dado.' });
perm('fender', 'Fender', '01-10', '1', 2, 5, 'Habilidade', { fx: { cleave: 'one' }, text: 'Ataques de Espada e Machado podem atingir um Inimigo adicional Perto deste Herói.' });
perm('das_boot', 'Das Boot', '01-11', '1', 2, 0, 'Equipamento', { partial: true, text: 'Ao ativar outro Herói, pode mover este Herói 1 Espaço.' });

// ------------------------------------------------------------------ Nível 2
atk('esmaga_cara', 'Esmaga-Cara', '02-01', '2', 2, 1, 'melee', 'Martelo', 4, { fx: { daze: 'target' }, text: 'Se causar Ferimento, o alvo fica Atordoado.' });
atk('tiro_rapido', 'Tiro Rápido', '02-02', '2', 2, 4, 'ranged', 'Arco', 3, { fx: { onlyCritSaves: true }, text: 'Só ✷ na rolagem de Defesa bloqueia este ataque.' });
atk('drenar_vida2', 'Drenar Vida II', '02-03', '2', 2, 3, 'ranged', 'Mágica', 3, { fx: { drain: 'ally1' }, text: 'Cada acerto cura 1 Ferimento deste Herói e de um Aliado Perto.' });
atk('dizimador', 'Dizimador', '02-04', '2', 3, 2, 'melee', 'Machado', 4, { fx: { critExtra: 1 }, text: 'Cada ✷ causa 1 acerto adicional.' });
atk('odio', 'Ódio', '02-05', '2', 2, 4, 'ranged', 'Mágica', 3, { fx: { hate: true }, text: 'Com ✷ contra um Herói, exausta todas as cartas dele.' });
perm('armadura_cavaleiro', 'Armadura de Cavaleiro', '02-06', '2', 2, 6, 'Armadura', { hpBonus: 1, defBonus: 2, fx: { armor: true }, text: 'Limite de 1 armadura por Herói.' });
perm('escudo_cavaleiro', 'Escudo de Cavaleiro', '02-07', '2', 1, 1, 'Escudo', { defBonus: 1, partial: true, text: 'Pode exaustar o Herói para obrigar a rolar de novo um ataque contra você.' });
perm('amuleto_retribuicao', 'Amuleto da Retribuição', '02-08', '2', 1, 8, 'Joia', { fx: { retribution: true }, text: 'Cada acerto cancelado pela Defesa deste Herói causa 1 Ferimento ao atacante.' });
perm('coracao_unicornio', 'Coração do Unicórnio', '02-09', '2', 2, 0, 'Joia', { hpBonus: 2, rerolls: 1 });
boost('tiro_flamejante', 'Tiro Flamejante', '02-10', '2', 2, 4, 'Equipamento', { fx: { boostDice: 2, boostFor: 'bow', selfWound: 1 }, text: '+2 dados em ataque de Arco. Este Herói sofre 1 Ferimento.' });
perm('manto_deslocamento', 'Manto do Deslocamento', '02-11', '2', 1, 1, 'Equipamento', { partial: true, text: 'No início do turno, pode trocar de lugar com um Aliado.' });
perm('bastao_celeridade', 'Bastão da Celeridade', '02-12', '2', 1, 6, 'Equipamento', { partial: true, text: 'Pode sofrer 1 Ferimento para restaurar todas as suas cartas.' });
boost('manopla_esmagadora', 'Manopla Esmagadora', '02-13', '2', 2, 3, 'Equipamento', { fx: { boostDice: 2, boostFor: 'melee_nonmagic', selfWound: 1 }, text: '+2 dados em ataque Próximo não Mágico. Este Herói sofre 1 Ferimento.' });
atk('raiar_dia', 'Raiar do Dia', '02-14', '2', 1, 9, 'melee', 'Martelo', 4, { fx: { vsHeroes: 1 }, text: '+1 dado contra Heróis.' });

// ------------------------------------------------------------------ Nível 3
atk('furia_noturna', 'Fúria Noturna', '03-01', '3', 2, 3, 'melee', 'Espada', 4, { defBonus: 2, rerolls: 2 });
atk('espinho', 'Espinho', '03-02', '3', 2, 3, 'ranged', 'Arco', 4);
atk('enxofre', 'Enxofre', '03-03', '3', 2, 1, 'melee', 'Martelo', 4, { fx: { daze: 'plus1' }, text: 'Se causar Ferimento, o alvo e mais 1 Inimigo Perto dele ficam Atordoados.' });
atk('bombastica', 'Bombástica', '03-04', '3', 1, 9, 'ranged', 'Arremesso', 3, { fx: { bomb: true }, text: 'Limite 1 bomba por Guilda. Se acertar, cria minas no Espaço do alvo e nos Espaços Perto.' });
atk('raio_nova2', 'Raio Nova II', '03-05', '3', 2, 4, 'ranged', 'Mágica', 4, { fx: { extraOnCrit: true }, text: 'Se rolar algum ✷, pode atingir um Inimigo adicional Perto do alvo.' });
atk('golpe_astral', 'Golpe Astral', '03-06', '3', 1, 6, 'melee', 'Mágica', 3, { fx: { astral: true }, text: 'Só ataca Inimigos Perto de um Aliado seu, em qualquer lugar do tabuleiro.' });
atk('rajada_vento2', 'Rajada de Vento II', '03-07', '3', 2, 4, 'ranged', 'Mágica', 4, { partial: true, text: 'Se acertar, move o alvo até 3 Espaços (sem Reação de Alerta).' });
perm('die_booten', 'Die Booten', '03-08', '3', 1, 2, 'Equipamento', { partial: true, text: 'Ao ativar outro Herói, pode mover este Herói 2 Espaços.' });
perm('mais_grrr', 'Mais Grrrrrrrrr!', '03-09', '3', 1, 4, 'Habilidade', { fx: { grrr: 2 }, text: 'Uma vez por ataque, pode sofrer 2 Ferimentos para +2 dados.' });
perm('coracao_grifo', 'Coração do Grifo', '03-10', '3', 1, 0, 'Joia', { hpBonus: 3 });
perm('vidro_genesis', 'Vidro do Gênesis', '03-11', '3', 1, 8, 'Joia', { fx: { genesis: 1 }, text: 'No início do seu turno, este Herói cura 1 Ferimento.' });
perm('armadura_lorde', 'Armadura do Lorde', '03-12', '3', 2, 6, 'Armadura', { hpBonus: 1, defBonus: 4, fx: { armor: true }, text: 'Limite de 1 armadura por Herói.' });
perm('anel_sol2', 'Anel do Sol II', '03-13', '3', 2, 0, 'Joia', { rerolls: 3 });
perm('grito_guerra', 'Grito de Guerra', '03-14', '3', 2, 4, 'Habilidade', { partial: true, text: 'Se o ataque rolar algum ✷, pode ativar outro Herói Aliado neste turno.' });
boost('varinha_pressa', 'Varinha da Pressa', '03-15', '3', 2, 3, 'Equipamento', { fx: { boostDice: 1, boostFor: 'magic', noExhaust: true }, text: '+1 dado em ataque Mágico. Não exausta a carta Mágica ampliada.' });

// ------------------------------------------------------------------ Nível 4
atk('ulceracao', 'Ulceração', '04-01', '4', 2, 2, 'melee', 'Espada', 4, { defBonus: 1, rerolls: 1, fx: { vsExhausted: 2 }, text: '+2 dados contra Heróis com alguma carta exaustada.' });
atk('raio_duplo', 'Raio Duplo', '04-02', '4', 2, 4, 'ranged', 'Arco', 4, { fx: { onlyCritSaves: true }, text: 'Só ✷ na rolagem de Defesa bloqueia este ataque.' });
atk('incinerar', 'Incinerar', '04-03', '4', 2, 6, 'ranged', 'Mágica', 4, { fx: { allClose: true }, text: 'Também atinge todos os Inimigos Perto do alvo.' });
atk('sede_sangue', 'Sede de Sangue', '04-04', '4', 2, 4, 'melee', 'Machado', 5, { fx: { critExtra: 2 }, text: 'Cada ✷ causa 2 acertos adicionais.' });
atk('odio2', 'Ódio II', '04-05', '4', 2, 4, 'ranged', 'Mágica', 5, { fx: { hate: true }, text: 'Com ✷ contra um Herói, exausta todas as cartas dele.' });
atk('enxame_morte', 'Enxame da Morte', '04-06', '4', 1, 8, 'ranged', 'Mágica', 5, { partial: true, text: 'Com ✷, pega 2 Monstros do Cemitério e os coloca em qualquer lugar.' });
perm('armadura_rei', 'Armadura do Rei', '04-07', '4', 2, 6, 'Armadura', { hpBonus: 2, defBonus: 4, fx: { armor: true }, text: 'Limite de 1 armadura por Herói.' });
boost('anel_lua2', 'Anel da Lua II', '04-08', '4', 2, 3, 'Joia', { fx: { boostDice: 2, boostFor: 'any' }, text: '+2 dados em uma carta de Ataque.' });
atk('drenar_vida3', 'Drenar Vida III', '04-09', '4', 2, 4, 'ranged', 'Mágica', 5, { fx: { drain: 'allies' }, text: 'Cada acerto cura 1 Ferimento deste Herói e de todos os Aliados Perto.' });
perm('escudo_rei', 'Escudo do Rei', '04-10', '4', 2, 5, 'Escudo', { defBonus: 2, rerolls: 2, partial: true, text: 'Pode exaustar o Herói para +2 dados numa rolagem de Defesa.' });
perm('livro_mortos', 'Livro dos Mortos', '04-11', '4', 1, 0, 'Equipamento', { fx: { bookDead: true }, text: 'Ao atacar, +1 dado por marcador de Morte na sua Guilda.' });
boost('rouba_vidas', 'Rouba-Vidas', '04-12', '4', 1, 2, 'Equipamento', { fx: { lifesteal: true, boostFor: 'magic' }, text: 'Cada Ferimento causado pelo ataque Mágico ampliado cura 1 deste Herói.' });
perm('coracao_fenix', 'Coração da Fênix', '04-13', '4', 2, 0, 'Joia', { hpBonus: 2, rerolls: 2 });
perm('fender2', 'Fender II', '04-14', '4', 1, 9, 'Habilidade', { fx: { cleave: 'all' }, text: 'Ataques de Espada e Machado atingem todos os Inimigos Perto deste Herói.' });

// ------------------------------------------------------------------ Nível 5
atk('golpe_flamejante', 'Golpe Flamejante', '05-01', '5', 2, 4, 'melee', 'Espada', 5, { defBonus: 1, rerolls: 1, fx: { critNoDefense: true }, text: 'Se rolar algum ✷, o alvo não rola Defesa.' });
atk('tiro_certeiro', 'Tiro Certeiro', '05-02', '5', 2, 3, 'ranged', 'Arco', 6);
atk('bomba_apetitosa', 'Bomba Apetitosa', '05-03', '5', 2, 9, 'ranged', 'Arremesso', 5, { fx: { bomb: true }, text: 'Limite 1 bomba por Guilda. Se acertar, cria minas no Espaço do alvo e nos Espaços Perto.' });
atk('pilao', 'Pilão', '05-04', '5', 2, 2, 'melee', 'Martelo', 5, { fx: { daze: 'all' }, text: 'Se causar Ferimento, o alvo e todos os Inimigos Perto dele ficam Atordoados.' });
atk('golpe_astral2', 'Golpe Astral II', '05-05', '5', 2, 4, 'melee', 'Mágica', 5, { fx: { astral: true }, text: 'Só ataca Inimigos Perto de um Aliado seu, em qualquer lugar do tabuleiro.' });
atk('incinerar2', 'Incinerar II', '05-06', '5', 2, 5, 'ranged', 'Mágica', 5, { fx: { allClose: true }, text: 'Também atinge todos os Inimigos Perto do alvo.' });
perm('armadura_imperador', 'Armadura do Imperador', '05-07', '5', 2, 8, 'Armadura', { hpBonus: 4, defBonus: 6, fx: { armor: true }, text: 'Limite de 1 armadura por Herói.' });
perm('escudo_lua', 'Escudo da Lua', '05-08', '5', 1, 3, 'Escudo', { fx: { moonShield: true }, text: 'Dobra o total de dados de Defesa.' });
perm('ultima_resistencia', 'Última Resistência', '05-09', '5', 1, 1, 'Joia', { fx: { lastStand: true }, text: '+X Defesa, X = Ferimentos neste Herói.' });
perm('coracao_dragao', 'Coração do Dragão', '05-10', '5', 1, 2, 'Joia', { hpBonus: 2, fx: { dragonHeart: true }, text: 'Cada ✷ na Defesa deste Herói conta um bloqueio extra.' });
perm('amuleto_rawr', 'Amuleto Rawr!', '05-11', '5', 1, 7, 'Joia', { fx: { rawr: 2 }, text: '+2 dados nas rolagens de Ataque.' });
perm('caca_almas', 'Caça-Almas', '05-12', '5', 1, 0, 'Equipamento', { fx: { soulseeker: true }, text: 'Cada ✷ em ataque de Arco causa 1 acerto extra.' });
perm('apocalipse', 'Apocalipse', '05-13', '5', 1, 3, 'Joia', { partial: true, text: 'No início da ativação, pode causar 1 Ferimento a todos os Inimigos Perto.' });
boost('pedra_furia', 'Pedra da Fúria', '05-14', '5', 1, 0, 'Joia', { fx: { rage: true, boostFor: 'any' }, text: '+1 dado por Ferimento neste Herói.' });
boost('anel_lua3', 'Anel da Lua III', '05-15', '5', 2, 4, 'Joia', { fx: { boostDice: 3, boostFor: 'any' }, text: '+3 dados em uma carta de Ataque.' });
perm('vidro_genesis2', 'Vidro do Gênesis II', '05-16', '5', 1, 6, 'Joia', { fx: { genesis: 2 }, text: 'No início do seu turno, este Herói cura 2 Ferimentos.' });

// ------------------------------------------------------------------ Recompensas
atk('bomba', 'Bomba', 'R-AD', 'R', 2, 0, 'ranged', 'Arremesso', 3, { scenario: 'Distrito do Alquimista', fx: { bomb: true }, text: 'Limite 1 bomba por Guilda. Se acertar, cria minas no Espaço do alvo e nos Espaços Perto; Herói Inimigo que entrar sofre o ataque.' });
perm('escudo_almas', 'Escudo das Almas', 'R-BA', 'R', 2, 0, 'Escudo', { scenario: 'Arena do Sol Brilhante', defBonus: 1, partial: true, text: 'Exausta este Herói para ressuscitar um Aliado na hora.' });
atk('quebra_cranio', 'Quebra-Crânio', 'R-DH', 'R', 2, 0, 'melee', 'Martelo', 3, { scenario: 'Distrito dos Martelos', fx: { daze: 'target', vsHeroes: 1 }, text: 'Se causar Ferimento, o alvo fica Atordoado. +1 dado contra Heróis.' });
perm('manto_assassino', 'Manto do Assassino', 'R-ED', 'R', 2, 0, 'Equipamento', { scenario: 'Distrito Sempressombrio', partial: true, text: 'Ao se mover, causa 1 Ferimento a cada Inimigo Perto.' });
atk('espada_capitao', 'Espada do Capitão', 'R-MG', 'R', 2, 0, 'melee', 'Espada', 4, { scenario: 'O Portão da Lua', defBonus: 1, rerolls: 1 });
atk('maldicao_peles_verdes', 'Maldição dos Peles-Verdes', 'R-OH', 'R', 2, 0, 'ranged', 'Mágica', 3, { scenario: 'Covil dos Orcs', fx: { vsOrcs: 1 }, text: '+1 dado contra Orcs e Goblins.' });
perm('coroa_sangue', 'Coroa de Sangue', 'R-RD', 'R', 1, 0, 'Joia', { scenario: 'Praça da Aurora Vermelha', partial: true, text: 'Causa 2 Ferimentos a um Inimigo que saia de um Espaço Perto deste Herói.' });
perm('saco_ossos', 'Saco de Ossos', 'R-S1', 'R', 1, 0, 'Equipamento', { scenario: 'A Mansão', fx: { sackBones: true }, text: 'Cura 2 Ferimentos sempre que este Herói mata um Inimigo.' });
atk('machado_schmetterling', 'Machado de Schmetterling', 'R-S2', 'R', 1, 0, 'melee', 'Machado', 4, { scenario: 'A Mansão', fx: { critExtra: 1 }, text: 'Cada ✷ causa 1 acerto adicional (e cura 1 Ferimento).' });
perm('coracao_anjos', 'Coração de Anjos', 'R-TM', 'R', 2, 0, 'Joia', { scenario: 'A Mansão', partial: true, text: 'Quando este Herói sofre Ferimentos, cura 1 de todos os Aliados.' });
atk('lanca_feral', 'Lança do Feral', 'R-TR', 'R', 2, 0, 'melee', 'Lança', 3, { scenario: 'O Viveiro das Águias', partial: true, text: 'O primeiro Espaço na diagonal conta como Perto.' });
perm('tomo_iluminacao', 'Tomo da Iluminação', 'R-UP', 'R', 2, 0, 'Equipamento', { scenario: 'O Pátio da Universidade', rerolls: 2, fx: { magicSlots: 2 }, text: '+2 espaços de inventário para cartas de Ataque Mágicas.' });

export const CARDS: Record<string, CardDef> = Object.fromEntries(LIST.map(c => [c.id, c]));

/** Baralho de Melhoria de um nível (com as quantidades). */
export function upgradeDeck(level: number): string[] {
  return LIST.filter(c => c.level === String(level)).flatMap(c => Array(c.qty).fill(c.id));
}

// ------------------------------------------------------------------ Maldições Mortais (deathcurses.csv)
export interface CurseDef { id: string; name: string; value: number; qty: number; text: string; slot?: boolean; hp?: number }
export const CURSES: Record<string, CurseDef> = Object.fromEntries(([
  { id: 'sem_maldicao', name: 'Sem Maldição', value: 0, qty: 10, text: 'Nada acontece.' },
  { id: 'aquafobia', name: 'Aquafobia', value: 1, qty: 1, text: 'Este Herói não pode usar Poções.' },
  { id: 'choque', name: 'Choque', value: 2, qty: 4, text: 'Ocupa um espaço de carta. Sem outro efeito.', slot: true },
  { id: 'sangramento', name: 'Sangramento Nasal', value: 3, qty: 2, text: '−1 Vida.', hp: -1 },
  { id: 'amnesia', name: 'Amnésia', value: 4, qty: 3, text: 'Este Herói perde sua Habilidade Natural.' },
  { id: 'sangramento_grave', name: 'Sangramento Grave', value: 5, qty: 2, text: 'Ocupa um espaço de carta. −1 Vida.', slot: true, hp: -1 },
  { id: 'propenso', name: 'Propenso a Acidentes', value: 6, qty: 1, text: 'Sofre 1 Ferimento se seu ataque não causar Ferimentos.' },
  { id: 'atordoado', name: 'Atordoado e Confuso', value: 7, qty: 1, text: 'Se sofrer pelo menos 1 Ferimento, fica Atordoado.' },
] as CurseDef[]).map(c => [c.id, c]));

export function curseDeck(): string[] {
  return Object.values(CURSES).flatMap(c => Array(c.qty).fill(c.id));
}
