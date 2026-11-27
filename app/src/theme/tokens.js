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
  "text-muted":     "#8C8C8C",
  "text-secondary": "#636363",
  text:             "#1A1A1A",
  ink:              "#101010",
};

export const ESCURO = {
  paper:           "#0A0A0A",
  surface:         "#121212",
  "surface-2":     "#1A1A1A",
  "surface-3":     "#242424",
  border:          "#2A2A2A",
  "border-strong": "#3A3A3A",
  "text-muted":     "#787878",
  "text-secondary": "#A6A6A6",
  text:             "#EDEDED",
  ink:              "#FFFFFF",
};

export const MARCA = {
  "brand-50":  "#FFF4F1",
  "brand-100": "#FEE4DC",
  "brand-200": "#FCC8B9",
  "brand-300": "#F7A48E",
  "brand-400": "#EF7A5C",
  "brand-500": "#E35A3A",
  "brand-600": "#D4432A",
  "brand-700": "#B33320",
  "brand-800": "#8C2616",
  "brand-900": "#5E180D",
  "alert-400": "#D9607A",
  "alert-600": "#B8203F",
  "alert-700": "#8F1530",
  // Âmbar da contagem de tempo do mapa da portaria. Ver o comentário em
  // tokens.css: existe para separar "correndo" de "esgotado".
  "aviso-100": "#FBEFD2",
  "aviso-400": "#E0A428",
  "aviso-600": "#B07B06",
  "aviso-700": "#6B4A05",
};
