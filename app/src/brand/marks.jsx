import React from "react";

/**
 * Símbolo reduzido: skyline de três volumes.
 * Derivado da ilustração completa, sem janelas, casa e swoosh, que não
 * sobrevivem abaixo de 34px. Traço mínimo de 4 unidades no grid de 64
 * para continuar legível a 16px.
 */
export function MarcaReduzida({ size = 24, ...props }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 64 64"
      fill="none" aria-hidden="true" focusable="false" {...props}
    >
      <path d="M14 54 V30 l11 -5 v29 z" fill="currentColor" />
      <path d="M27 54 V16 l13 6 v32 z" fill="currentColor" />
      <path d="M42 54 V34 l10 -4 v24 z" fill="currentColor" />
      <rect x="12" y="54" width="42" height="4" rx="2" fill="currentColor" />
    </svg>
  );
}

/**
 * Símbolo completo: duas torres com janelas, casa e swoosh.
 * Só para a variante `full` do Logo. Nunca em interface.
 */
export function MarcaCompleta({ size = 96, corVazado = "#FBFAF8", ...props }) {
  return (
    <svg
      width={size} height={size * 0.9} viewBox="0 0 100 90"
      fill="none" aria-hidden="true" focusable="false" {...props}
    >
      <path d="M28 62 a34 15 0 1 0 34 -13" fill="none" stroke="currentColor"
            strokeWidth="4.5" strokeLinecap="round" />
      <path d="M30 70 a34 15 0 0 0 46 6" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" opacity=".75" />
      <path d="M46 66 V30 l14 -7 v43 z" fill="currentColor" />
      <path d="M62 66 V16 l14 6 v44 z" fill="currentColor" />
      <path d="M31 66 V40 l11 -5 v31 z" fill="currentColor" />
      <path d="M36 66 V52 l10 -8 l10 8 v14 z" fill="currentColor" />
      <rect x="49.5" y="33" width="3.5" height="4.5" fill={corVazado} />
      <rect x="55" y="30.5" width="3.5" height="4.5" fill={corVazado} />
      <rect x="49.5" y="42" width="3.5" height="4.5" fill={corVazado} />
      <rect x="55" y="39.5" width="3.5" height="4.5" fill={corVazado} />
      <rect x="65.5" y="27" width="3.5" height="5" fill={corVazado} />
      <rect x="71" y="29" width="3.5" height="5" fill={corVazado} />
      <rect x="65.5" y="37" width="3.5" height="5" fill={corVazado} />
      <rect x="71" y="39" width="3.5" height="5" fill={corVazado} />
      <rect x="34.5" y="44" width="3" height="4" fill={corVazado} />
      <rect x="34.5" y="52" width="3" height="4" fill={corVazado} />
      <rect x="44" y="55" width="4" height="4.5" fill={corVazado} />
    </svg>
  );
}
