import React from "react";
import { MarcaReduzida, MarcaCompleta } from "./marks";
import { MARCA, CLARO } from "../theme/tokens";

const APOIO = "Sistema de Administração de Condomínio";

/**
 * Logo ViT, produto da VITTA.
 *
 * variant:
 *   full        ilustração completa com swoosh, logotipo e linha de apoio.
 *               Login, cabeçalho de PDF, papel timbrado.
 *   horizontal  símbolo reduzido, logotipo e nome do cliente. Sidebar.
 *   inverse     igual ao horizontal, em papel sobre fundo escuro.
 *   mark        só o símbolo reduzido. Favicon, avatar, rodapé de PDF.
 *
 * O swoosh aparece apenas em `full`. Nunca em interface.
 */
export default function Logo({ variant = "horizontal", cliente, size, ...props }) {
  if (variant === "mark") {
    return (
      <span
        role="img"
        aria-label="ViT"
        style={{ color: MARCA["brand-500"], display: "inline-flex" }}
        {...props}
      >
        <MarcaReduzida size={size ?? 24} />
      </span>
    );
  }

  if (variant === "full") {
    return (
      <div
        role="img"
        aria-label={`ViT, ${APOIO}`}
        style={{ display: "flex", alignItems: "center", gap: 14, color: MARCA["brand-500"] }}
        {...props}
      >
        <MarcaCompleta size={size ?? 96} corVazado={CLARO.paper} />
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: size ? size * 0.58 : 56,
              lineHeight: 1,
              letterSpacing: "var(--track-tighter)",
              color: MARCA["brand-500"],
            }}
          >
            ViT
          </div>
          <div
            style={{
              borderTop: `1.5px solid ${MARCA["brand-500"]}`,
              marginTop: 7,
              paddingTop: 5,
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "var(--text-sm)",
              color: MARCA["brand-500"],
            }}
          >
            {APOIO}
          </div>
        </div>
      </div>
    );
  }

  const inverso = variant === "inverse";
  const corLogo = inverso ? CLARO.paper : MARCA["brand-500"];
  const corCliente = inverso ? MARCA["brand-300"] : "var(--fg-muted)";

  return (
    <div
      role="img"
      aria-label={cliente ? `ViT, ${cliente}` : "ViT"}
      style={{ display: "flex", alignItems: "center", gap: 9 }}
      {...props}
    >
      <span style={{ color: corLogo, display: "inline-flex", flexShrink: 0 }}>
        <MarcaReduzida size={size ?? 28} />
      </span>
      <span>
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "var(--text-xl)",
            lineHeight: 1,
            letterSpacing: "var(--track-tighter)",
            color: corLogo,
          }}
        >
          ViT
        </span>
        {cliente && (
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--text-sm)",
              color: corCliente,
              marginTop: 2,
            }}
          >
            {cliente}
          </span>
        )}
      </span>
    </div>
  );
}
