/**
 * NamesGenerator - Shared calculator for name and number generation
 * Used by both MCP tool (generate_names) and NamesPage UI
 */

// ============ Types ============

export type GeneratorMode = 'names' | 'numbers';
export type NameCategory = 'human' | 'pet';
export type HumanNameType = 'first' | 'full' | 'fantasy';
export type PetType = 'dog' | 'cat' | 'other';
export type Gender = 'any' | 'male' | 'female';

export interface NamesGeneratorInput {
  mode: GeneratorMode;
  // For names mode
  nameCategory?: NameCategory;
  humanNameType?: HumanNameType;
  petType?: PetType;
  gender?: Gender;
  // For numbers mode
  min?: number;
  max?: number;
  // Common
  count?: number;
}

export interface NamesGeneratorOutput {
  mode: GeneratorMode;
  results: string[];
  count: number;
  // Names mode details
  nameCategory?: NameCategory;
  humanNameType?: HumanNameType;
  petType?: PetType;
  gender?: Gender;
  // Numbers mode details
  min?: number;
  max?: number;
  range?: string;
}

// ============ Name Data ============

const FIRST_NAMES = {
  male: ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Joseph', 'Charles', 'Thomas', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian'],
  female: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle']
};

const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White'];

const FANTASY_PREFIXES = ['Aer', 'Bal', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Hor', 'Ith', 'Jor', 'Kal', 'Lor', 'Mor', 'Nar', 'Ori', 'Pyr', 'Qua', 'Rav', 'Syl', 'Thr', 'Ul', 'Val', 'Wyr', 'Xan', 'Yor', 'Zar'];
const FANTASY_SUFFIXES = ['ion', 'ius', 'ara', 'iel', 'oth', 'wyn', 'dor', 'rin', 'las', 'mir', 'ven', 'thos', 'gar', 'nak', 'zul'];

const DOG_NAMES = {
  male: ['Max', 'Charlie', 'Buddy', 'Cooper', 'Rocky', 'Bear', 'Duke', 'Tucker', 'Jack', 'Leo', 'Milo', 'Zeus', 'Finn', 'Apollo', 'Bruno', 'Rex', 'Buster', 'Diesel', 'Thor', 'Ace'],
  female: ['Bella', 'Luna', 'Lucy', 'Daisy', 'Sadie', 'Molly', 'Lola', 'Bailey', 'Stella', 'Maggie', 'Chloe', 'Penny', 'Zoey', 'Lily', 'Roxy', 'Ruby', 'Rosie', 'Gracie', 'Coco', 'Nala']
};

const CAT_NAMES = {
  male: ['Oliver', 'Leo', 'Milo', 'Charlie', 'Simba', 'Max', 'Loki', 'Oscar', 'Jasper', 'Buddy', 'Tiger', 'Shadow', 'Smokey', 'Felix', 'Oreo', 'Gizmo', 'Salem', 'Binx', 'Whiskers', 'Mittens'],
  female: ['Luna', 'Bella', 'Lily', 'Chloe', 'Lucy', 'Nala', 'Kitty', 'Cleo', 'Willow', 'Stella', 'Daisy', 'Mia', 'Zoe', 'Pepper', 'Ginger', 'Misty', 'Princess', 'Callie', 'Sophie', 'Olive']
};

const OTHER_PET_NAMES = {
  male: ['Nibbles', 'Peanut', 'Coco', 'Biscuit', 'Gizmo', 'Oreo', 'Patches', 'Bubbles', 'Ziggy', 'Pip', 'Thumper', 'Whiskers', 'Scooter', 'Bandit', 'Chewy', 'Nugget', 'Pickles', 'Waffles', 'Mochi', 'Tofu'],
  female: ['Daisy', 'Honey', 'Cookie', 'Buttercup', 'Snowball', 'Pebbles', 'Cupcake', 'Sprinkles', 'Tinkerbell', 'Pixie', 'Maple', 'Hazel', 'Clover', 'Poppy', 'Rosie', 'Sunny', 'Peaches', 'Jellybean', 'Marshmallow', 'Twinkle']
};

// ============ Helper Functions ============

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const getGenderChoice = (gender: Gender): 'male' | 'female' => {
  return gender === 'any' ? (Math.random() < 0.5 ? 'male' : 'female') : gender;
};

// ============ Main Generator Function ============

export function generateNames(input: NamesGeneratorInput): NamesGeneratorOutput {
  const {
    mode,
    nameCategory = 'human',
    humanNameType = 'first',
    petType = 'dog',
    gender = 'any',
    min = 1,
    max = 100,
    count = 5,
  } = input;

  // Validate count
  const validCount = Math.min(Math.max(1, count), 100);

  if (mode === 'numbers') {
    // Generate random numbers
    const validMin = Math.min(min, max);
    const validMax = Math.max(min, max);
    const results = Array.from({ length: validCount }, () =>
      (Math.floor(Math.random() * (validMax - validMin + 1)) + validMin).toString()
    );
    return {
      mode: 'numbers',
      results,
      count: validCount,
      min: validMin,
      max: validMax,
      range: `${validMin} - ${validMax}`,
    };
  }

  // Generate names
  const results: string[] = [];

  for (let i = 0; i < validCount; i++) {
    const genderChoice = getGenderChoice(gender);

    if (nameCategory === 'pet') {
      // Pet names
      let petNames: { male: string[]; female: string[] };
      switch (petType) {
        case 'dog': petNames = DOG_NAMES; break;
        case 'cat': petNames = CAT_NAMES; break;
        default: petNames = OTHER_PET_NAMES; break;
      }
      results.push(pick(petNames[genderChoice]));
    } else {
      // Human names
      if (humanNameType === 'fantasy') {
        results.push(`${pick(FANTASY_PREFIXES)}${pick(FANTASY_SUFFIXES)}`);
      } else {
        const firstName = pick(FIRST_NAMES[genderChoice]);
        if (humanNameType === 'first') {
          results.push(firstName);
        } else {
          results.push(`${firstName} ${pick(LAST_NAMES)}`);
        }
      }
    }
  }

  return {
    mode: 'names',
    results,
    count: validCount,
    nameCategory,
    humanNameType: nameCategory === 'human' ? humanNameType : undefined,
    petType: nameCategory === 'pet' ? petType : undefined,
    gender,
  };
}

