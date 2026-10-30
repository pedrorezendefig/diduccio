import { createContext } from "react";

// Em arquivo próprio para não quebrar o Fast Refresh: um módulo que exporta
// componente não pode exportar mais nada (regra react-refresh/only-export-components).
export const ThemeContext = createContext(null);
