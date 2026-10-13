// Map the Day! visual themes — clock face + arc color systems matching the app's aesthetic.

export const THEMES = {
  paper: {
    id: "paper",
    name: "Paper",
    face: "#faf8f5",
    faceRing: "#e8e4dc",
    ink: "#2b2620",
    tick: "#3a342c",
    tickMuted: "#b8b0a4",
    hand: "#2b2620",
    handNow: "#e85d04",
    shadow: "rgba(43,38,32,0.08)",
    palette: ["#e85d04", "#f4a261", "#2a9d8f", "#264653", "#e9c46a", "#e76f51", "#277da1", "#9b5de5", "#00bbf9", "#f15bb5", "#06d6a0", "#ff006e"],
    stickerStroke: "#2b2620",
    grid: "rgba(43,38,32,0.06)",
  },
  dark: {
    id: "dark",
    name: "Dark",
    face: "#121212",
    faceRing: "#2a2a2a",
    ink: "#eceae6",
    tick: "#eceae6",
    tickMuted: "#5a5a5a",
    hand: "#eceae6",
    handNow: "#ffd166",
    shadow: "rgba(0,0,0,0.4)",
    palette: ["#ffd166", "#06d6a0", "#118ab2", "#ef476f", "#073b4c", "#f4a261", "#9b5de5", "#00bbf9", "#f15bb5", "#ff006e", "#80ed99", "#c77dff"],
    stickerStroke: "#eceae6",
    grid: "rgba(255,255,255,0.06)",
  },
  forest: {
    id: "forest",
    name: "Forest",
    face: "#0f2e1f",
    faceRing: "#1a4630",
    ink: "#e8f5e9",
    tick: "#a5d6a7",
    tickMuted: "#4a7c59",
    hand: "#e8f5e9",
    handNow: "#ffd166",
    shadow: "rgba(0,0,0,0.35)",
    palette: ["#ffd166", "#80ed99", "#57cc99", "#38a3a5", "#c7f9cc", "#f7e733", "#ff6b6b", "#a8e6cf", "#dcedc1", "#ffd3b5", "#ffaaa5", "#ff8b94"],
    stickerStroke: "#e8f5e9",
    grid: "rgba(255,255,255,0.05)",
  },
  sepia: {
    id: "sepia",
    name: "Sepia",
    face: "#f5ecd8",
    faceRing: "#e0d2b5",
    ink: "#4a3728",
    tick: "#4a3728",
    tickMuted: "#a89070",
    hand: "#4a3728",
    handNow: "#c45c26",
    shadow: "rgba(74,55,40,0.1)",
    palette: ["#c45c26", "#d4a017", "#6b4226", "#8fbc8f", "#b5651d", "#556b2f", "#cd853f", "#a0522d", "#708090", "#bc8f8f", "#6b8e23", "#d2691e"],
    stickerStroke: "#4a3728",
    grid: "rgba(74,55,40,0.07)",
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    face: "#0a0e27",
    faceRing: "#1a2044",
    ink: "#e0e6ff",
    tick: "#8892c8",
    tickMuted: "#3a4270",
    hand: "#e0e6ff",
    handNow: "#ff6b9d",
    shadow: "rgba(0,0,0,0.5)",
    palette: ["#ff6b9d", "#c084fc", "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#38bdf8", "#4ade80", "#fb923c", "#e879f9", "#22d3ee"],
    stickerStroke: "#e0e6ff",
    grid: "rgba(255,255,255,0.04)",
  },
  bloom: {
    id: "bloom",
    name: "Bloom",
    face: "#fff5f7",
    faceRing: "#ffd6e0",
    ink: "#4a2030",
    tick: "#4a2030",
    tickMuted: "#d4a0b0",
    hand: "#4a2030",
    handNow: "#e91e8c",
    shadow: "rgba(74,32,48,0.08)",
    palette: ["#e91e8c", "#ff8fab", "#fb6f92", "#ffccd5", "#c9184a", "#ff4d6d", "#a4133c", "#ff758f", "#ff8fa3", "#ef476f", "#ffd6de", "#ff0a54"],
    stickerStroke: "#4a2030",
    grid: "rgba(74,32,48,0.06)",
  },
};

export const DEFAULT_THEME = "paper";

export function getTheme(id) {
  return THEMES[id] || THEMES[DEFAULT_THEME];
}

export function listThemes() {
  return Object.values(THEMES).map((t) => ({ id: t.id, name: t.name }));
}

export function pickColor(theme, index) {
  const p = theme.palette;
  return p[((index % p.length) + p.length) % p.length];
}
