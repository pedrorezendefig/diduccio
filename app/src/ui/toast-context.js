import { createContext } from "react";

// Em arquivo próprio pela regra react-refresh/only-export-components:
// um módulo que exporta componente não pode exportar mais nada.
export const ToastContext = createContext(null);
