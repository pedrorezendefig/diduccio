import React, { useEffect, useMemo, useState } from "react";
import { ThemeContext } from "./context";
import { CLARO, ESCURO, MARCA } from "./tokens";

// As chaves são exatamente as que as 21 páginas já consomem, então os 1.697
// usos de theme.* continuam funcionando sem edição. Os valores são hex literal
// e nunca var(): Dashboard.jsx usa estas cores em atributos de SVG, e atributo
// de apresentação não resolve variável CSS.
function construirTema(isDark) {
  const n = isDark ? ESCURO : CLARO;
  return {
    bg:            n.paper,
    bgBody:        n.paper,
    bgCard:        n.surface,
    mainBg:        n.surface,
    text:          n.text,
    textSecondary: n["text-secondary"],
    border:        n.border,
    // Espelha --fg-brand: brand-700 no claro, brand-300 no escuro. Existe para
    // os ícones lucide, que recebem a cor via prop e a emitem como atributo
    // stroke. brand-500 fixo reprovava 4.5:1 no papel e sumia no escuro.
    brand:         isDark ? MARCA["brand-300"] : MARCA["brand-700"],
    isDark,
  };
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem("darkMode") === "true"
  );

  useEffect(() => {
    localStorage.setItem("darkMode", String(isDark));
    // data-theme vai no <html> e não num wrapper React, para que modal,
    // portal e o próprio <body> herdem os tokens.
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [isDark]);

  const value = useMemo(
    () => ({
      theme: construirTema(isDark),
      toggleTheme: () => setIsDark((v) => !v),
      isDark,
    }),
    [isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
