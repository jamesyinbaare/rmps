export type LunchCouponBrandColorKey =
  | "ctvred"
  | "navy"
  | "forest"
  | "royal"
  | "burgundy"
  | "slate";

export type LunchCouponBrandColorOption = {
  key: LunchCouponBrandColorKey;
  label: string;
  hex: string;
};

export const LUNCH_COUPON_BRAND_COLORS: LunchCouponBrandColorOption[] = [
  { key: "ctvred", label: "CTVET Red", hex: "#CE1126" },
  { key: "navy", label: "Navy", hex: "#1E3A5F" },
  { key: "forest", label: "Forest", hex: "#1F5C4A" },
  { key: "royal", label: "Royal Blue", hex: "#1D4ED8" },
  { key: "burgundy", label: "Burgundy", hex: "#7F1D1D" },
  { key: "slate", label: "Slate", hex: "#334155" },
];

export const DEFAULT_LUNCH_COUPON_BRAND_COLOR: LunchCouponBrandColorKey = "ctvred";
