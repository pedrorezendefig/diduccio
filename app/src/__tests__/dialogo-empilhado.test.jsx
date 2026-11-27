import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";
import GavetaDeTarefa from "../components/GavetaDeTarefa";

const TAREFA = {
  id: 5, titulo: "Cotar conserto do portão", descricao: "", situacao: "A_FAZER",
  responsavel_id: 10, prazo: null, id_unidade: null,
  created_by: "Carla Souza", created_at: "2026-09-26T13:00:00Z",
};
const PESSOAS = [{ id: 10, nome: "Carla Souza", cargo: "Sindico" }];

function Envoltorio({ onFechar = () => {}, tarefa = TAREFA }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <GavetaDeTarefa
            tarefa={tarefa} pessoas={PESSOAS} unidades={[]} user={PESSOAS[0]} podeExcluir
            onFechar={onFechar} onSalvar={async () => ({ success: true })} onExcluir={async () => ({ success: true })}
          />
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("diálogos empilhados", () => {
  it("Esc com o confirm por cima fecha só o confirm, e o body volta a rolar no fim", async () => {
    const onFechar = vi.fn();
    const { unmount } = render(<Envoltorio onFechar={onFechar} />);
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await screen.findByRole("dialog", { name: 'Excluir "Cotar conserto do portão"?' });

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: 'Excluir "Cotar conserto do portão"?' })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Editar tarefa" })).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("ao desmontar, o foco volta a quem abriu", async () => {
    function Pagina() {
      const [aberta, setAberta] = useState(false);
      return (
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <button onClick={() => setAberta(true)}>Abrir</button>
              {aberta && (
                <GavetaDeTarefa
                  pessoas={PESSOAS} unidades={[]} user={PESSOAS[0]} podeExcluir={false}
                  onFechar={() => setAberta(false)} onSalvar={async () => ({ success: true })} onExcluir={async () => ({ success: true })}
                />
              )}
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      );
    }
    render(<Pagina />);
    const abrir = screen.getByRole("button", { name: "Abrir" });
    await userEvent.click(abrir);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(abrir);
  });
});
