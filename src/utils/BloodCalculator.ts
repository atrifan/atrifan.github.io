/**
 * Shared Blood Calculator
 * 
 * This is the SINGLE SOURCE OF TRUTH for blood-related calculation logic.
 * Used by both the MCP API (/api/mcp) and the UI (BloodPage.tsx).
 * 
 * Contains three calculators:
 * 1. Blood Donation Eligibility
 * 2. Blood Type Compatibility
 * 3. Baby Blood Type Prediction
 * 
 * GUIDELINE FOR MODIFYING CALCULATOR FUNCTIONS:
 * 1. Ensure MCP tool definition (tools-definitions.ts) matches these parameters
 * 2. Ensure MCP execution (route.ts) calls this shared function
 * 3. Ensure UI component uses this same function
 * 4. Keep parameter names consistent across all three locations
 * 5. Update outputSchema in tools-definitions.ts if return type changes
 */

// ============ ENUMS & TYPES ============
export type Gender = 'male' | 'female';
export type UnitSystem = 'metric' | 'imperial';
export type BloodTypeABO = 'A' | 'B' | 'AB' | 'O';
export type RhFactor = '+' | '-';
export type FullBloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

// ============ CONSTANTS ============
const BLOOD_TYPE_ALLELES: Record<BloodTypeABO, string[]> = {
  'A': ['AA', 'AO'], 'B': ['BB', 'BO'], 'AB': ['AB'], 'O': ['OO'],
};

const RH_ALLELES: Record<RhFactor, string[]> = {
  '+': ['++', '+-'], '-': ['--'],
};

const DONATION_COMPATIBILITY: Record<FullBloodType, FullBloodType[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

const RECEIVE_COMPATIBILITY: Record<FullBloodType, FullBloodType[]> = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

// ============ DONATION ELIGIBILITY ============
export interface DonationEligibilityInput {
  age: number;
  weight: number;
  height: number;
  gender: Gender;
  /** Unit system for weight/height. Default: 'metric' */
  unitSystem?: UnitSystem;
  /** Height in feet (for imperial) */
  heightFeet?: number;
  /** Height in inches (for imperial) */
  heightInches?: number;
}

export interface DonationEligibilityOutput {
  eligible: boolean;
  amount: number;
  maxSafeAmount: number;
  bloodVolume: number;
  warnings: string[];
  tips: string[];
}

/** Calculate blood volume using Nadler's formula */
function calculateBloodVolume(weightKg: number, heightCm: number, gender: Gender): number {
  const heightM = heightCm / 100;
  if (gender === 'male') {
    return 0.3669 * Math.pow(heightM, 3) + 0.03219 * weightKg + 0.6041;
  }
  return 0.3561 * Math.pow(heightM, 3) + 0.03308 * weightKg + 0.1833;
}

export function calculateDonationEligibility(input: DonationEligibilityInput): DonationEligibilityOutput {
  const { age, gender, unitSystem = 'metric' } = input;
  
  // Convert to metric if imperial
  let weightKg: number;
  let heightCm: number;
  
  if (unitSystem === 'imperial') {
    weightKg = input.weight * 0.453592; // lbs to kg
    const feet = input.heightFeet || 0;
    const inches = input.heightInches || 0;
    heightCm = (feet * 12 + inches) * 2.54;
  } else {
    weightKg = input.weight;
    heightCm = input.height;
  }
  
  const warnings: string[] = [];
  const tips: string[] = [];
  let eligible = true;
  
  // Age check (minimum 17)
  if (age < 17) {
    eligible = false;
    warnings.push('Must be at least 17 years old to donate blood (16 with parental consent in some regions).');
  } else if (age > 65) {
    warnings.push('First-time donors should be under 66. Regular donors can continue until 70+.');
  }
  
  // Weight check (minimum 50 kg / 110 lbs)
  if (weightKg < 50) {
    eligible = false;
    warnings.push('Must weigh at least 50 kg (110 lbs) to donate blood safely.');
  }
  
  // Calculate blood volume and safe donation amount
  const bloodVolume = calculateBloodVolume(weightKg, heightCm, gender);
  const bloodVolumeML = bloodVolume * 1000;
  const maxSafeDonation = Math.min(500, bloodVolumeML * 0.105);
  const recommendedDonation = Math.round(Math.max(0, Math.min(maxSafeDonation, 470)));
  
  // Add tips
  tips.push('Eat a healthy meal before donating');
  tips.push('Stay well hydrated - drink plenty of water');
  tips.push('Avoid alcohol 24 hours before donation');
  tips.push('Get a good night\'s sleep');
  
  return {
    eligible,
    amount: eligible ? recommendedDonation : 0,
    maxSafeAmount: Math.round(maxSafeDonation),
    bloodVolume: Math.round(bloodVolume * 100) / 100,
    warnings,
    tips,
  };
}

// ============ BLOOD COMPATIBILITY ============
export interface BloodCompatibilityInput {
  bloodType: BloodTypeABO;
  rhFactor: RhFactor;
}

export interface BloodCompatibilityOutput {
  fullBloodType: FullBloodType;
  canDonateTo: FullBloodType[];
  canReceiveFrom: FullBloodType[];
  isUniversalDonor: boolean;
  isUniversalRecipient: boolean;
}

export function calculateBloodCompatibility(input: BloodCompatibilityInput): BloodCompatibilityOutput {
  const fullType = `${input.bloodType}${input.rhFactor}` as FullBloodType;

  return {
    fullBloodType: fullType,
    canDonateTo: DONATION_COMPATIBILITY[fullType] || [],
    canReceiveFrom: RECEIVE_COMPATIBILITY[fullType] || [],
    isUniversalDonor: fullType === 'O-',
    isUniversalRecipient: fullType === 'AB+',
  };
}

// ============ BABY BLOOD TYPE ============
export interface BabyBloodTypeInput {
  fatherBloodType: BloodTypeABO;
  fatherRh: RhFactor;
  motherBloodType: BloodTypeABO;
  motherRh: RhFactor;
}

export interface PossibleBloodType {
  type: string;
  percentage: number;
}

export interface BabyBloodTypeOutput {
  possibleTypes: PossibleBloodType[];
  rhIncompatibilityRisk: boolean;
  rhWarning: string | null;
}

export function calculateBabyBloodType(input: BabyBloodTypeInput): BabyBloodTypeOutput {
  const { fatherBloodType, fatherRh, motherBloodType, motherRh } = input;

  // Calculate possible ABO types using Punnett square
  const fatherAlleles = BLOOD_TYPE_ALLELES[fatherBloodType];
  const motherAlleles = BLOOD_TYPE_ALLELES[motherBloodType];

  const possibleGenotypes: Record<string, number> = {};
  let totalCombinations = 0;

  for (const fAllele of fatherAlleles) {
    for (const mAllele of motherAlleles) {
      for (const f of fAllele.split('')) {
        for (const m of mAllele.split('')) {
          const combo = [f, m].sort().join('');
          possibleGenotypes[combo] = (possibleGenotypes[combo] || 0) + 1;
          totalCombinations++;
        }
      }
    }
  }

  // Convert genotypes to phenotypes
  const phenotypes: Record<string, number> = {};
  for (const [genotype, count] of Object.entries(possibleGenotypes)) {
    let phenotype: string;
    if (genotype === 'AA' || genotype === 'AO') phenotype = 'A';
    else if (genotype === 'BB' || genotype === 'BO') phenotype = 'B';
    else if (genotype === 'AB') phenotype = 'AB';
    else phenotype = 'O';
    phenotypes[phenotype] = (phenotypes[phenotype] || 0) + count;
  }

  // Calculate Rh possibilities
  const fatherRhAlleles = RH_ALLELES[fatherRh];
  const motherRhAlleles = RH_ALLELES[motherRh];

  let rhPositiveChance = 0;
  let rhNegativeChance = 0;
  let rhCombinations = 0;

  for (const fRh of fatherRhAlleles) {
    for (const mRh of motherRhAlleles) {
      for (const f of fRh.split('')) {
        for (const m of mRh.split('')) {
          rhCombinations++;
          if (f === '+' || m === '+') rhPositiveChance++;
          else rhNegativeChance++;
        }
      }
    }
  }

  // Combine ABO and Rh
  const possibleTypes: PossibleBloodType[] = [];
  for (const [type, count] of Object.entries(phenotypes)) {
    const aboPercentage = (count / totalCombinations) * 100;
    if (rhPositiveChance > 0) {
      possibleTypes.push({
        type: `${type}+`,
        percentage: Math.round(aboPercentage * (rhPositiveChance / rhCombinations)),
      });
    }
    if (rhNegativeChance > 0) {
      possibleTypes.push({
        type: `${type}-`,
        percentage: Math.round(aboPercentage * (rhNegativeChance / rhCombinations)),
      });
    }
  }

  // Sort by percentage descending and filter out 0%
  possibleTypes.sort((a, b) => b.percentage - a.percentage);
  const filteredTypes = possibleTypes.filter(t => t.percentage > 0);

  // Check for Rh incompatibility risk
  const rhIncompatibilityRisk = motherRh === '-' && fatherRh === '+';
  const rhWarning = rhIncompatibilityRisk
    ? 'Rh incompatibility detected! If the mother is Rh-negative and the father is Rh-positive, the baby may be Rh-positive. This can cause the mother\'s immune system to produce antibodies against the baby\'s blood cells. Consult with a doctor about RhoGAM injection.'
    : null;

  return {
    possibleTypes: filteredTypes,
    rhIncompatibilityRisk,
    rhWarning,
  };
}

