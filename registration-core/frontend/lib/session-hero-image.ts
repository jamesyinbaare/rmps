export const CTVET_HERO_IMAGES = [
  "/auto.jpg",
  "/auto2.jpg",
  "/elect.jpg",
  "/elect2.jpg",
  "/hosp.jpg",
] as const;

const STORAGE_KEY = "ctvet-hero-image";

export function getDefaultHeroImage(): string {
  return CTVET_HERO_IMAGES[0];
}

/**
 * Returns a hero image path stable for the browser tab session.
 * Safe to call only in the browser; on SSR use getDefaultHeroImage().
 */
export function getSessionHeroImage(): string {
  if (typeof window === "undefined") {
    return getDefaultHeroImage();
  }

  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing && (CTVET_HERO_IMAGES as readonly string[]).includes(existing)) {
      return existing;
    }

    const picked =
      CTVET_HERO_IMAGES[Math.floor(Math.random() * CTVET_HERO_IMAGES.length)];
    sessionStorage.setItem(STORAGE_KEY, picked);
    return picked;
  } catch {
    return getDefaultHeroImage();
  }
}
