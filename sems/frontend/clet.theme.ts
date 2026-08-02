/**
 * SEMS WorldSkills Ghana CTVET theme overrides for @rfdtech/components.
 * Import once at app startup (side effect) after library CSS.
 */
import { cletTheme } from "@rfdtech/components/next";

/** Brand palette — WorldSkills Ghana CTVET */
const CTVET = {
  deepBlue: "#003764",
  red: "#E30613",
  gold: "#FFCC00",
  green: "#00853F",
  highlight: "#FEE300",
  orange: "#FF6C0C",
  magenta: "#D51067",
  darkNeutral: "#1C2526",
  white: "#FFFFFF",
} as const;

cletTheme({
  all: {
    primary: CTVET.green,
    onPrimary: CTVET.white,
    focus: CTVET.green,
    error: CTVET.red,
    errorText: CTVET.red,
    success: CTVET.green,
    warning: CTVET.gold,
    secondary: CTVET.gold,
  },
  light: {
    bg: "#F5F7F6",
    mainBg: "#F5F7F6",
    text: CTVET.darkNeutral,
    textSecondary: "#3D4A4C",
    textMuted: "#5C6B6D",
    border: "#D5DDD8",
    borderSubtle: "#E8EEEA",
    borderStrong: "#A8B5B0",
    surfaceCard: CTVET.white,
    surfacePanel: CTVET.white,
    surfaceSubtle: "#EBF1ED",
    primaryLight: "#E6F4EC",
    hover: "#DCEEE4",
    errorBg: "#FDE8EA",
  },
  dark: {
    primary: "#22A35A",
    onPrimary: CTVET.white,
    focus: "#22A35A",
    bg: CTVET.darkNeutral,
    mainBg: "#141A1B",
    text: "#F5F7F6",
    textSecondary: "#C5CDCF",
    textMuted: "#8A9698",
    border: "#2E383A",
    borderSubtle: "#252E30",
    borderStrong: "#3D4A4C",
    surfaceCard: "#222A2C",
    surfacePanel: "#1A2123",
    surfaceSubtle: "#252E30",
    surfaceDark: "#0F1415",
    primaryLight: "#1A3D2A",
    hover: "#2A3537",
    errorBg: "#3F1518",
    errorText: "#FF6B72",
    warning: CTVET.gold,
    success: "#22A35A",
  },
  components: {
    AppHeader: {
      all: {
        bg: CTVET.deepBlue,
        color: CTVET.white,
      },
    },
  },
});
