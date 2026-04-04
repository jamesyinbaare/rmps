/** API JSON uses enum *values* (display strings), matching backend Region / Zone / SchoolType. */

export const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: "Ashanti", label: "Ashanti" },
  { value: "Bono", label: "Bono" },
  { value: "Bono East", label: "Bono East" },
  { value: "Ahafo", label: "Ahafo" },
  { value: "Central", label: "Central" },
  { value: "Eastern", label: "Eastern" },
  { value: "Greater Accra", label: "Greater Accra" },
  { value: "Northern", label: "Northern" },
  { value: "North East", label: "North East" },
  { value: "Savannah", label: "Savannah" },
  { value: "Upper East", label: "Upper East" },
  { value: "Upper West", label: "Upper West" },
  { value: "Volta", label: "Volta" },
  { value: "Oti", label: "Oti" },
  { value: "Western", label: "Western" },
  { value: "Western North", label: "Western North" },
];

const zoneLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const ZONE_OPTIONS: { value: string; label: string }[] = zoneLetters.map(
  (l) => ({ value: l, label: `Zone ${l}` }),
);

export const SCHOOL_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
];
