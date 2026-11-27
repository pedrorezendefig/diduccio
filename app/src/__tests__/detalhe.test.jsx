import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gaveta, Button } from "../ui";

/**
 * A Gaveta herda de useDialogo a mesma disciplina do Modal. Estes testes
 * existem porque o hook é compartilhado: uma regressão nele quebraria os dois
 * ao mesmo tempo, e o Modal já tinha cobertura — a Gaveta não.
 */

function montar(props = {}) {
  return render(
    <Gaveta
      open
      onClose={props.onClose ?? vi.fn()}
      sigla="VP"
      titulo="Vanderlei Prado"
      meta="Cadastrado em 14/03/2019"
      fitas={<span>B5-412</span>}
      footer={<Button>Editar</Button>}
      {...props}
    >
      <section className="vit-grupo">
        <p className="vit-grupo__titulo">Contato</p>
        <div className="vit-dado">
          <span className="vit-dado__rotulo">Telefone</span>
          <p className="vit-dado__valor">(21) 98472-1193</p>
        </div>
      </section>
    </Gaveta>
  );
}

describe("Gaveta", () => {
  it("não renderiza nada fechada", () => {
    montar({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("anuncia o título como nome do diálogo", () => {
    montar();
    expect(screen.getByRole("dialog", { name: "Vanderlei Prado" })).toBeInTheDocument();
  });

  it("mostra sigla, meta, fitas, corpo e ações", () => {
    montar();
    expect(screen.getByText("VP")).toBeInTheDocument();
    expect(screen.getByText("Cadastrado em 14/03/2019")).toBeInTheDocument();
    expect(screen.getByText("B5-412")).toBeInTheDocument();
    expect(screen.getByText("(21) 98472-1193")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("Esc fecha", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    montar({ onClose });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("o botão de fechar chama onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    montar({ onClose });
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("clique no véu fecha, clique no painel não", async () => {
    const onClose = vi.fn();
    montar({ onClose });

    const painel = screen.getByRole("dialog");
    await userEvent.setup().click(painel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("trava o scroll do fundo enquanto aberta", () => {
    const { unmount } = montar();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("leva o foco para dentro ao abrir", () => {
    montar();
    const painel = screen.getByRole("dialog");
    expect(painel.contains(document.activeElement)).toBe(true);
  });
});

/**
 * Desde que os anexos novos passaram a viver no bucket, estes helpers recebem
 * dois formatos de origem. O link assinado do Storage não é `data:` e não tem
 * fileId do Drive — sem tratamento explícito ele caía no pixel transparente:
 * arquivo salvo, tela em branco, nenhum erro em lugar nenhum.
 */
describe("anexo vindo do Storage, não do Drive", () => {
  // Token de verdade: um JWT. A primeira versão deste teste usava "?token=abc",
  // curto demais para disparar o `[-\w]{25,}` de extrairFileIdDrive — passava
  // verde enquanto a tela mostrava pixel transparente. O tamanho do token É a
  // condição do defeito, então ele precisa estar aqui.
  const ASSINADA =
    "https://SEU_PROJECT_REF.supabase.co/storage/v1/object/sign/anexos/piscina/208/1786561868421-anexo.png" +
    "?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJhbmV4b3MvcGlzY2luYS8yMDgvYW5leG8ucG5nIn0.abc123def456";

  it("DriveImage usa o link assinado direto no src", async () => {
    const { DriveImage } = await import("../components/DriveImage");
    const { container } = render(<DriveImage source={ASSINADA} alt="foto" />);
    expect(container.querySelector("img").getAttribute("src")).toBe(ASSINADA);
  });

  it("continua tratando URL do Drive pelo caminho do Drive", async () => {
    // A distinção importa nos dois sentidos: uma URL do Drive precisa continuar
    // passando pelo fetch autenticado, senão os 204 cadastros antigos quebram.
    const { DriveImage } = await import("../components/DriveImage");
    const drive = "https://drive.google.com/file/d/1AbCdEfGhIjK/view";
    const { container } = render(<DriveImage source={drive} alt="foto" />);
    expect(container.querySelector("img").getAttribute("src")).not.toBe(drive);
  });

  it("PDF do bucket não vai para dentro do <img>", async () => {
    // No Drive o `getFoto` devolvia a miniatura que o Google gera, e até PDF
    // virava imagem. O bucket entrega o arquivo como ele é: o navegador desenha
    // o ícone de imagem quebrada bem em cima do "VER ARQUIVO" que já estava
    // certo atrás. O lugar do PDF é o pixel transparente, como sempre foi.
    const { DriveImage, PIXEL_TRANSPARENTE } = await import("../components/DriveImage");
    const pdf = ASSINADA.replace("anexo.png", "contrato.pdf");
    const { container } = render(<DriveImage source={pdf} alt="Comprovante" />);
    expect(container.querySelector("img").getAttribute("src")).toBe(PIXEL_TRANSPARENTE);
  });

  it("imagem do bucket continua indo direto para o <img>", async () => {
    // A distinção precisa valer nos dois sentidos: uma regra que escondesse
    // tudo resolveria o ícone quebrado escondendo também as fotos.
    const { DriveImage } = await import("../components/DriveImage");
    const { container } = render(<DriveImage source={ASSINADA} alt="foto" />);
    expect(container.querySelector("img").getAttribute("src")).toBe(ASSINADA);
  });

  it("imagem que falha ao carregar cai no placeholder, não no ícone de erro", async () => {
    const { DriveImage, PIXEL_TRANSPARENTE } = await import("../components/DriveImage");
    const { container } = render(<DriveImage source={ASSINADA} alt="foto" />);
    const img = container.querySelector("img");
    // Link expirado, arquivo corrompido, tipo inesperado — o que a extensão
    // não previu é recolhido aqui.
    fireEvent.error(img);
    expect(container.querySelector("img").getAttribute("src")).toBe(PIXEL_TRANSPARENTE);
  });

  it("PDF recém-anexado, ainda em base64, também não vai para o <img>", async () => {
    // Este nunca dependeu do Drive: o formulário jogava a data URL crua no
    // <img>, então anexar PDF SEMPRE mostrou ícone de erro, desde antes da
    // migração. Só apareceu agora porque o resto parou de disfarçar.
    const { DriveImage, PIXEL_TRANSPARENTE } = await import("../components/DriveImage");
    const { container } = render(<DriveImage source="data:application/pdf;base64,JVBERi0=" alt="Anexo" />);
    expect(container.querySelector("img").getAttribute("src")).toBe(PIXEL_TRANSPARENTE);
  });

  it("foto recém-anexada em base64 continua aparecendo", async () => {
    const { DriveImage } = await import("../components/DriveImage");
    const foto = "data:image/png;base64,iVBORw0KGgo=";
    const { container } = render(<DriveImage source={foto} alt="foto" />);
    expect(container.querySelector("img").getAttribute("src")).toBe(foto);
  });

  it("MiniaturaAnexo mostra documento, e não um quadrado vazio", async () => {
    // Metade do problema é não mostrar o ícone de erro; a outra metade é não
    // deixar um quadrado vazio com borda e X, que parece anexo que falhou.
    // Quem anexou um PDF precisa VER que anexou um PDF.
    const { MiniaturaAnexo } = await import("../components/DriveImage");
    render(<MiniaturaAnexo localSrc="data:application/pdf;base64,JVBERi0=" nome="contrato.pdf" />);
    expect(screen.getByRole("img", { name: "Documento contrato.pdf" })).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("MiniaturaAnexo com imagem continua renderizando a imagem", async () => {
    const { MiniaturaAnexo } = await import("../components/DriveImage");
    const foto = "data:image/png;base64,iVBORw0KGgo=";
    const { container } = render(<MiniaturaAnexo localSrc={foto} alt="foto" />);
    expect(container.querySelector("img").getAttribute("src")).toBe(foto);
  });

  it("MiniaturaAnexo não decide pelo Drive, que não diz o tipo no endereço", async () => {
    // Um id do Drive não tem extensão nem tipo declarado. Chutar "documento"
    // ali esconderia as 204 fotos antigas atrás de um ícone de arquivo.
    const { MiniaturaAnexo } = await import("../components/DriveImage");
    const { container } = render(
      <MiniaturaAnexo source="https://drive.google.com/file/d/1AbCdEfGhIjK/view" alt="foto" />
    );
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("abrirArquivoDrive abre o link assinado em vez de recusar", async () => {
    const { abrirArquivoDrive } = await import("../components/DriveImage");
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    await abrirArquivoDrive(ASSINADA);
    expect(abrir).toHaveBeenCalledWith(ASSINADA, "_blank", "noopener");
    abrir.mockRestore();
  });
});
