// Fixed mineral-specific category list (deliberately separate from the
// generic Product Categories module — a mineral's category means something
// different from a retail product's).
export const MINERAL_CATEGORIES = [
  { value: 'metallic', labelKey: 'categoryMetallic' },
  { value: 'non_metallic', labelKey: 'categoryNonMetallic' },
  { value: 'precious', labelKey: 'categoryPrecious' },
  { value: 'energy_fuel', labelKey: 'categoryEnergyFuel' },
  { value: 'industrial', labelKey: 'categoryIndustrial' },
  { value: 'construction', labelKey: 'categoryConstruction' },
];

export const ROYALTY_TYPES = [
  { value: 'percentage', labelKey: 'royaltyTypePercentage' },
  { value: 'fixed_per_unit', labelKey: 'royaltyTypeFixed' },
];
