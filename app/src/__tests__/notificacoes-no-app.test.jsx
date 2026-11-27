import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

/**
 * Notificações e multas no app do morador (0099). O SQL, lido como texto, e
 * o bloco "No app do morador" do detalhe. A prova com o banco de verdade é o
 * scripts/verificar-notificacoes-app.mjs.
 */
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../api/supabase", () => ({ supabase: { rpc } }));
import VistaNoApp from "../components/VistaNoApp";

describe("o bloco 'No app do morador'", () => {
  beforeEach(() => rpc.mockReset());

  it("ainda não emitida: explica quando aparece", async () => {
    rpc.mockResolvedValue({ data: { emitida_em: null, corrigida_em: null, vistas: [] }, error: null });
    render(<VistaNoApp id={4} />);
    expect(await screen.findByText(/Ainda não está no app/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("vistas_da_notificacao", { p_id: 4 });
  });

  it("emitida: desde quando, a correção e quem abriu, com o vínculo", async () => {
    rpc.mockResolvedValue({
      data: {
        emitida_em: "2026-11-02T17:00:00Z", corrigida_em: "2026-11-04T12:00:00Z",
        vistas: [{ nome: "ana", vinculo: "Locatário", vista_em: "2026-11-02T17:32:00Z" }],
      },
      error: null,
    });
    render(<VistaNoApp id={4} />);
    expect(await screen.findByText(/No app desde 02\/11\/2026, 14:00/)).toBeInTheDocument();
    expect(screen.getByText(/Corrigida em 04\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Vista por Ana (inquilino) em 02/11/2026, 14:32")).toBeInTheDocument();
  });

  it("emitida e ninguém abriu", async () => {
    rpc.mockResolvedValue({ data: { emitida_em: "2026-11-02T17:00:00Z", corrigida_em: null, vistas: [] }, error: null });
    render(<VistaNoApp id={4} />);
    expect(await screen.findByText("Nenhum titular abriu ainda.")).toBeInTheDocument();
  });

  it("o comprovante anexado recarrega o bloco (teste e2e de 12/11)", async () => {
    rpc.mockResolvedValueOnce({ data: { emitida_em: null, corrigida_em: null, vistas: [] }, error: null });
    const { rerender } = render(<VistaNoApp id={4} versao="0-0" />);
    expect(await screen.findByText(/Ainda não está no app/)).toBeInTheDocument();
    rpc.mockResolvedValueOnce({ data: { emitida_em: "2026-11-12T17:00:00Z", corrigida_em: null, vistas: [] }, error: null });
    rerender(<VistaNoApp id={4} versao="0-1" />);
    expect(await screen.findByText(/No app desde 12\/11\/2026, 14:00/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
    // A tela passa os envios E os anexos na versão.
    const tela = readFileSync("src/pages/Notificacoes.jsx", "utf8");
    expect(tela).toMatch(/<VistaNoApp id=\{celula\(aberto, "id"\)\} versao=\{`\$\{enviosDe\(aberto\)\.length\}-\$\{anexosDe\(aberto\)\.length\}`\} \/>/);
  });
});

