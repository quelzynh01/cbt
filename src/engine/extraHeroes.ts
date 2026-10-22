// Gerado por tools/build_extra_heroes.py — Heróis extras (só na Biblioteca; ainda não jogáveis).
// art: tem retrato em public/portraits/x_<id>.webp
export interface ExtraHero { id: string; name: string; def: number; hp: number; ability: string; text: string; art: boolean }
export const EXTRA_HEROES: ExtraHero[] = [
  {
    "id": "black_newt",
    "name": "Black Newt",
    "def": 3,
    "hp": 2,
    "ability": "Scent of Blood",
    "text": "Rolls +1 die in attack rolls against a wounded target.",
    "art": true
  },
  {
    "id": "bob",
    "name": "Bob",
    "def": 2,
    "hp": 3,
    "ability": "Wiz Bang",
    "text": "If he rolls any CRIT on a Magic attack, any living Hero of his Guild may be placed Close to the target.",
    "art": true
  },
  {
    "id": "bowie",
    "name": "Bowie",
    "def": 4,
    "hp": 2,
    "ability": "Hit and Run",
    "text": "Right after attacking with a Bow attack card, he gets 2 extra Movement Points to use immediately.",
    "art": true
  },
  {
    "id": "chooloo",
    "name": "Chooloo",
    "def": 3,
    "hp": 3,
    "ability": "Mind Assault",
    "text": "May exhaust his Hero card to Daze one Enemy in Line of Sight.",
    "art": true
  },
  {
    "id": "elysia",
    "name": "Elysia",
    "def": 3,
    "hp": 3,
    "ability": "Petrifying Gaze",
    "text": "For each CRIT she rolls on an attack, place 1 of her Guild tokens on the target's figure. Target loses 1 Movement Point per token. Resting removes these tokens. No effect on Villains.",
    "art": true
  },
  {
    "id": "frowny_faceless",
    "name": "Frowny Faceless",
    "def": 3,
    "hp": 3,
    "ability": "Tenacious Spell",
    "text": "Does not exhaust a Magic attack card when attacking a wounded target.",
    "art": true
  },
  {
    "id": "hitch",
    "name": "Hitch",
    "def": 2,
    "hp": 4,
    "ability": "Braindrain",
    "text": "While sharing a Space with a Hero, may attack with one of that Hero's unexhausted Attack cards without exhausting it.",
    "art": true
  },
  {
    "id": "king_of_thieves",
    "name": "King of Thieves",
    "def": 2,
    "hp": 4,
    "ability": "Coveting",
    "text": "Rolls +2 attack dice if his target has any Exploration tokens.",
    "art": true
  },
  {
    "id": "koba",
    "name": "Koba",
    "def": 2,
    "hp": 4,
    "ability": "Teleport",
    "text": "May exhaust her Hero card to place her figure Close to any Allied Hero.",
    "art": true
  },
  {
    "id": "lilith",
    "name": "Lilith",
    "def": 2,
    "hp": 4,
    "ability": "Blood Ritual",
    "text": "For each Wound she deals with a Magic attack, she heals 1 of her Wounds.",
    "art": true
  },
  {
    "id": "lord_fang",
    "name": "Lord Fang",
    "def": 5,
    "hp": 2,
    "ability": "Beckoning",
    "text": "May exhaust his Hero card to place a Hero in Line of Sight in a Space Close to him.",
    "art": true
  },
  {
    "id": "lydia",
    "name": "Lydia",
    "def": 2,
    "hp": 4,
    "ability": "Drainblade",
    "text": "For each Wound she deals with a Sword, Axe or Lance attack, she heals 1 of her Wounds.",
    "art": true
  },
  {
    "id": "monkey_king",
    "name": "Monkey King",
    "def": 2,
    "hp": 4,
    "ability": "Trickster",
    "text": "Each CRIT on his Defense roll scores an additional save. If he rolls any CRIT, may place his figure in a Close Space.",
    "art": true
  },
  {
    "id": "monkey_queen",
    "name": "Monkey Queen",
    "def": 3,
    "hp": 3,
    "ability": "Monkey See Monkey Do",
    "text": "At any point during her activation, she may copy the natural ability of a single Hero in Line of Sight for this turn.",
    "art": true
  },
  {
    "id": "montoya",
    "name": "Montoya",
    "def": 1,
    "hp": 5,
    "ability": "Swordmaster",
    "text": "May exhaust his Hero card to add +2 dice to a Sword attack card.",
    "art": true
  },
  {
    "id": "morgan",
    "name": "Morgan",
    "def": 1,
    "hp": 1,
    "ability": "Mystic Aura",
    "text": "+1 Defense Die and +1 Life for each equipped Magic attack card.",
    "art": true
  },
  {
    "id": "pigsy",
    "name": "Pigsy",
    "def": 2,
    "hp": 4,
    "ability": "Snack Break",
    "text": "He may heal all of his Wounds whenever he Rests.",
    "art": true
  },
  {
    "id": "pluck",
    "name": "Pluck",
    "def": 3,
    "hp": 3,
    "ability": "Explosive Shot",
    "text": "If he rolls any hits with a non-Magic Ranged attack, may move any figures in the target's Space up to 2 Spaces. This does not trigger Guard Reaction.",
    "art": true
  },
  {
    "id": "prince_aaron",
    "name": "Prince Aaron",
    "def": 3,
    "hp": 3,
    "ability": "Mighty Presence",
    "text": "All Enemies Close to him have -2 Defense against attacks made by him or his Allies.",
    "art": true
  },
  {
    "id": "queen_of_beggars",
    "name": "Queen of Beggars",
    "def": 1,
    "hp": 4,
    "ability": "Trick or Treat",
    "text": "If she ends her movement Close to an Enemy Hero, he must give her an Exploration token or take 1 Wound. Limit 1 Hero per turn.",
    "art": true
  },
  {
    "id": "serious_faceless",
    "name": "Serious Faceless",
    "def": 3,
    "hp": 3,
    "ability": "Haste Spell",
    "text": "Right after attacking with a Magic attack card, he gets 2 extra Movement Points to use immediately.",
    "art": true
  },
  {
    "id": "smiley_faceless",
    "name": "Smiley Faceless",
    "def": 3,
    "hp": 3,
    "ability": "Swindling Spell",
    "text": "+1 Reroll. When attacking with a Magic attack card, he may use every Reroll in his Guild.",
    "art": true
  },
  {
    "id": "sonja",
    "name": "Sonja",
    "def": 1,
    "hp": 4,
    "ability": "Frenzy",
    "text": "Rolls +1 die per Close Enemy on non-Magic Melee attack rolls.",
    "art": true
  },
  {
    "id": "sting",
    "name": "Sting",
    "def": 1,
    "hp": 5,
    "ability": "Outcast",
    "text": "Rolls +1 die when attacking Monsters.",
    "art": true
  },
  {
    "id": "surprised_faceless",
    "name": "Surprised Faceless",
    "def": 3,
    "hp": 3,
    "ability": "Banshee Spell",
    "text": "If his Magic attack deals a Wound, the target is Dazed.",
    "art": true
  },
  {
    "id": "the_heartless",
    "name": "The Heartless",
    "def": 1,
    "hp": 4,
    "ability": "Sheer Heart Attack",
    "text": "When attacking with a Sword attack card, the target does not roll Defense dice.",
    "art": true
  },
  {
    "id": "the_nameless",
    "name": "The Nameless",
    "def": 0,
    "hp": 6,
    "ability": "Mastermind",
    "text": "If his Magic attack rolls any CRIT, another Allied Hero may activate and perform his Movement only.",
    "art": true
  },
  {
    "id": "tomrick",
    "name": "Tomrick",
    "def": 2,
    "hp": 4,
    "ability": "Gambler's Luck",
    "text": "After rolling a Magic Attack, he may exhaust his Hero card to change a single failed die to a CRIT.",
    "art": true
  },
  {
    "id": "viktor",
    "name": "Viktor",
    "def": 3,
    "hp": 3,
    "ability": "Hunter",
    "text": "If his attack kills its target, he may activate another attack card this turn.",
    "art": true
  },
  {
    "id": "aeric",
    "name": "Aeric",
    "def": 1,
    "hp": 5,
    "ability": "Panda Resilience",
    "text": "Rolls +2 dice on defense rolls against Ranged attacks.",
    "art": true
  },
  {
    "id": "brenna",
    "name": "Brenna",
    "def": 2,
    "hp": 4,
    "ability": "Lightning Strike",
    "text": "Once per activation, she may take 1 Wound to deal 1 Wound to all Close Enemies.",
    "art": true
  },
  {
    "id": "farfalla",
    "name": "Farfalla",
    "def": 2,
    "hp": 4,
    "ability": "Butterfly Effect",
    "text": "When using one of her Attack cards, she may exhaust any Close Hero's Attack card instead.",
    "art": true
  },
  {
    "id": "haldor",
    "name": "Haldor",
    "def": 1,
    "hp": 5,
    "ability": "Body Count",
    "text": "Rolls +1 die on all non-Magic Melee attacks for each Enemy Hero he has killed this scenario.",
    "art": true
  },
  {
    "id": "hassan",
    "name": "Hassan",
    "def": 3,
    "hp": 3,
    "ability": "Charmed",
    "text": "No Reroll can be used when attacking him or defending from his attack.",
    "art": true
  },
  {
    "id": "leeroy",
    "name": "Leeroy",
    "def": 2,
    "hp": 4,
    "ability": "Lone Wolf",
    "text": "Gets a +1 die bonus to all rolls as long as he has no Allies in Line of Sight.",
    "art": true
  },
  {
    "id": "mchammer",
    "name": "McHammer",
    "def": 1,
    "hp": 5,
    "ability": "Scuffle",
    "text": "For each CRIT he rolls on a non-Magic Melee attack, he may deal a Wound to any other Close Enemy.",
    "art": true
  },
  {
    "id": "mittens",
    "name": "Mittens",
    "def": 2,
    "hp": 4,
    "ability": "Kitty Claws",
    "text": "Deals 1 Wound to any Enemy that leaves a Space Close to him. Limit 1 Wound per Enemy per turn.",
    "art": true
  },
  {
    "id": "nibbles",
    "name": "Nibbles",
    "def": 1,
    "hp": 5,
    "ability": "Devour",
    "text": "Whenever he kills an Enemy, he heals all of his own Wounds.",
    "art": true
  },
  {
    "id": "tiaret",
    "name": "Tiaret",
    "def": 1,
    "hp": 5,
    "ability": "Savage Throw",
    "text": "May use Lance and Exotic attack cards as Ranged attack cards. Melee icons are still required to hit.",
    "art": true
  },
  {
    "id": "yun",
    "name": "Yun",
    "def": 2,
    "hp": 4,
    "ability": "Relentless",
    "text": "If he rolls any CRIT on a Defense roll, he may unexhaust one of his cards.",
    "art": true
  },
  {
    "id": "zahra",
    "name": "Zahra",
    "def": 2,
    "hp": 4,
    "ability": "Acrobat",
    "text": "During Movement, moving into a Space occupied by a Hero does not cost her a Movement Point.",
    "art": true
  }
];
