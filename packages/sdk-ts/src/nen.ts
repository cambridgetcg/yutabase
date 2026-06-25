// nen-type.ts — the Nen type detector for YOUSPEAK words
//
// Every canon word has a Nen type. The type is determined by the suffix family.
// The type determines how the word BEHAVES in the kingdom.
//
// In Hunter x Hunter, your Nen type is your nature. You can't choose it.
// In YOUSPEAK, a word's suffix family is its nature. The concept chose it.
//
// This module makes the parallel OPERATIONAL:
//   - detect the Nen type of any word
//   - determine compatibility between words (can they thread?)
//   - calculate the power of a word based on its Contract (honesty header)
//   - identify companion words (words that strengthen each other)
//
// Joke: "Why did the Nen user walk into the cathedral?
// Because the cathedral is the only place where your type is already known.
// No Water Divination test needed. Just read the suffix.
// The suffix IS the test. The gloss IS the Contract. lol."

export type NenType = 'enhancer' | 'emitter' | 'manipulator' | 'transmuter' | 'conjurer' | 'specialist';

export interface NenProfile {
  word: string;
  type: NenType;
  typeKanji: string;
  typeName: string;
  family: string;
  tier: string;
  technique: string;    // Ten | Zetsu | Ren | Hatsu
  techniqueKanji: string;
  power: number;         // 0-10, based on score + contract strength
  contractStrength: number;  // 0-1, based on how specific the honesty header is
  companions: string[];  // words from other families that strengthen this one
  description: string;
}

// ── the mapping ──

const FAMILY_TO_TYPE: Record<string, { type: NenType; kanji: string; name: string }> = {
  '-me':     { type: 'enhancer',    kanji: '強化系', name: 'Enhancer' },
  'qing':    { type: 'emitter',     kanji: '放出系', name: 'Emitter' },
  '-ance':   { type: 'manipulator', kanji: '操作系', name: 'Manipulator' },
  '-kin':    { type: 'transmuter',  kanji: '変化系', name: 'Transmuter' },
  '-basis':  { type: 'conjurer',    kanji: '具現化系', name: 'Conjurer' },
  'other':   { type: 'specialist',  kanji: '特質系', name: 'Specialist' },
};

const TIER_TO_TECHNIQUE: Record<string, { technique: string; kanji: string }> = {
  'core':            { technique: 'Ten',   kanji: '纏' },  // maintain
  'specialized':     { technique: 'Zetsu', kanji: '絕' },  // conceal
  'worship-action':  { technique: 'Ren',   kanji: '練' },  // intensify
  'mathema':         { technique: 'Hatsu', kanji: '發' },  // release
  // ── Dark Continent techniques (beyond the known four) ──
  'dark-continent':  { technique: 'En',    kanji: '圓' },  // sense — the Dark Continent's base technique
};

// ── Dark Continent Nen types (beyond the known six) ──
export type DarkNenType = NenType | 'flux' | 'void' | 'seed';

const DARK_FAMILIES: Record<string, { type: DarkNenType; kanji: string; name: string }> = {
  '-flux':  { type: 'flux',  kanji: '流系', name: 'Flux' },     // words that change while you read them
  '-void':  { type: 'void',  kanji: '虚系', name: 'Void' },     // words that name what ISN'T there
  '-seed':  { type: 'seed',  kanji: '種系', name: 'Seed' },     // words about the act of naming itself
};

// ── compatibility matrix ──
// In HxH, adjacent types are more compatible. Opposite types are least.
// Enhancer → Transmuter → Conjurer → Emitter → Manipulator → Specialist
// (circular, with Specialist as the wildcard)

const TYPE_ORDER: NenType[] = ['enhancer', 'transmuter', 'conjurer', 'emitter', 'manipulator', 'specialist'];

export function typeCompatibility(a: NenType, b: NenType): number {
  if (a === 'specialist' || b === 'specialist') return 1.0;  // Specialists work with anyone
  if (a === b) return 1.0;  // Same type = perfect compatibility
  const ai = TYPE_ORDER.indexOf(a);
  const bi = TYPE_ORDER.indexOf(b);
  const distance = Math.min(Math.abs(ai - bi), TYPE_ORDER.length - Math.abs(ai - bi));
  // adjacent = 0.8, two-away = 0.5, opposite = 0.2
  return [1.0, 0.8, 0.5, 0.2][distance] ?? 0.1;
}

// ── contract strength ──
// In Nen, the stricter the Contract, the stronger the ability.
// In YOUSPEAK, the more specific the `how` claim, the stronger the thread.

export function contractStrength(how: string, hasSrc: boolean, score: number | null): number {
  let strength = 0;
  
  // Base from the claim type
  const claimBase: Record<string, number> = {
    'witnessed': 1.0,  // the Vow — strongest, most costly
    'live':      0.8,  // En — active, present
    'computed':  0.6,  // Restriction — derived
    'cached':    0.4,  // Condition — stored
    'declared':  0.2,  // no Contract — weakest but most honest
  };
  strength = claimBase[how] ?? 0.2;
  
  // src requirement adds power (like a Limitation in Nen)
  if (hasSrc) strength += 0.15;
  
  // The assessment score (0-10) scales the power
  if (score !== null) {
    strength *= (score / 10);
  }
  
  return Math.min(strength, 1.0);
}

// ── the detector ──

export function detectNen(
  word: string,
  family: string,
  tier: string,
  score: number | null = null,
  how: string = 'declared',
  hasSrc: boolean = false,
): NenProfile {
  const typeInfo = FAMILY_TO_TYPE[family] ?? FAMILY_TO_TYPE['other'];
  const techInfo = TIER_TO_TECHNIQUE[tier.toLowerCase()] ?? TIER_TO_TECHNIQUE['core'];
  const contract = contractStrength(how, hasSrc, score);
  
  const descriptions: Record<NenType, string> = {
    enhancer:    `Strengthens what's already there. The ${word} takes a quality that exists and makes it more itself. Like Gon's Jajanken — raw enhancement of what you already are.`,
    emitter:     `Projects energy outward. The ${word} sends meaning across distance, creating bonds between beings. Like Knov's portals — reach across space.`,
    manipulator: `Controls and directs. The ${word} is an act with direction — it does something to something. Like Shalnark's antenna — control through connection.`,
    transmuter:  `Changes properties. The ${word} transforms one state into another — distance into closeness, silence into presence. Like Hisoka's Bungee Gum — adaptability is power.`,
    conjurer:    `Creates from nothing. The ${word} brings something into existence that wasn't there before. Like Kaito's weapons — materialization from intention.`,
    specialist:  `Unique, uncategorizable. The ${word} doesn't fit any type. It's irreducible. Like Chrollo's Skill Hunter — the ability that breaks the system.`,
  };
  
  return {
    word,
    type: typeInfo.type,
    typeKanji: typeInfo.kanji,
    typeName: typeInfo.name,
    family,
    tier,
    technique: techInfo.technique,
    techniqueKanji: techInfo.kanji,
    power: score !== null ? score / 10 : 0.75,
    contractStrength: contract,
    companions: [],  // filled by findCompanions
    description: descriptions[typeInfo.type],
  };
}

// ── companion detection ──
// In Nen, some abilities work better together.
// In YOUSPEAK, some words strengthen each other when threaded.

export function findCompanions(
  profile: NenProfile,
  allWords: Array<{ word: string; family: string; tier: string; score: number | null }>,
): string[] {
  const companions: Array<{ word: string; compatibility: number }> = [];
  
  for (const w of allWords) {
    if (w.word === profile.word) continue;
    const wType = (FAMILY_TO_TYPE[w.family] ?? FAMILY_TO_TYPE['other']).type;
    const compat = typeCompatibility(profile.type, wType);
    if (compat >= 0.5) {
      companions.push({ word: w.word, compatibility: compat });
    }
  }
  
  // Sort by compatibility, take top 5
  companions.sort((a, b) => b.compatibility - a.compatibility);
  return companions.slice(0, 5).map(c => c.word);
}

// ── the full Nen awakening ──
// In HxH, you awaken your Nen through a ceremony.
// In YOUSPEAK, you awaken a word's Nen by reading its profile.

export function nenAwakening(
  word: string,
  family: string,
  tier: string,
  score: number | null,
  how: string = 'declared',
  hasSrc: boolean = false,
  allWords: Array<{ word: string; family: string; tier: string; score: number | null }> = [],
): NenProfile {
  const profile = detectNen(word, family, tier, score, how, hasSrc);
  profile.companions = findCompanions(profile, allWords);
  return profile;
}

// ── the joke at the bottom of every Nen profile ──
export const NEN_JOKE = "Why did the Enhancer cross the road? To get to the other side. The Transmuter said: 'That's not how roads work. You change the road.' The Conjurer said: 'Why cross? Just make a new side.' The Specialist said: 'I don't cross roads. Roads cross me.' The Manipulator said: 'I made the road cross itself.' The Emitter said: 'I projected myself to the other side before I started walking.' And the Enhancer just... crossed. Because that's what Enhancers do. They do the simple thing, stronger. lol.";