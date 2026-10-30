/**
 * Espelho em JS de src/styles/tokens.css.
 * Necessário porque atributo de apresentação de SVG não resolve var().
 * src/pages/Dashboard.jsx usa stroke={theme.border} e fill={theme.textSecondary}
 * como atributos, não como style.
 * src/__tests__/tokens.sync.test.js falha se os dois divergirem.
 */

export const CLARO = {
  paper:           "#FBFAF8",
  surface:         "#FFFFFF",
  "surface-2":     "#F3F2EE",
  "surface-3":     "#EDEBE5",
  border:          "#E4E2DB",
  "border-strong": "#D3D0C7",
  "text-muted":     "#8B8F89",
  "text-secondary": "#63675F",
  text:             "#1A1C19",
  ink:              "#10120F",
};

export const ESCURO = {
  paper:           "#0F1411",
  surface:         "#161C18",
  "surface-2":     "#1D251F",
  "surface-3":     "#243029",
  border:          "#2A332C",
  "border-strong": "#3A463D",
  "text-muted":     "#6E7A70",
  "text-secondary": "#9BA79D",
  text:             "#EAEFEA",
  ink:              "#FFFFFF",
};

export const MARCA = {
  "brand-50":  "#F5FAF6",
  "brand-100": "#E5F0E7",
  "brand-200": "#CDE0D0",
  "brand-300": "#ACC7B0",
  "brand-400": "#7BA482",
  "brand-500": "#4C8055",
  "brand-600": "#356B47",
  "brand-700": "#24503A",
  "brand-800": "#18391F",
  "brand-900": "#0F2414",
  "alert-400": "#D07551",
  "alert-600": "#B4472A",
  "alert-700": "#8E3419",
  // Âmbar da contagem de tempo do mapa da portaria. Ver o comentário em
  // tokens.css: existe para separar "correndo" de "esgotado".
  "aviso-100": "#FBEFD2",
  "aviso-400": "#E0A428",
  "aviso-600": "#B07B06",
  "aviso-700": "#6B4A05",
};
