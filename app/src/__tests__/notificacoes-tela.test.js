// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { can, ROLES } from "../auth/permissions";
import { casaComUnidade } from "../lib/unidades";

/**
 * O que a TELA de notificações promete, e que a lib pura não alcança.
 *
 * Três coisas aqui não são estética: a multa não vira papel, a justificativa só
 * é gravada quando de fato contornou a regra, e quem apaga um registro é
 * avisado de que está mexendo na contagem que leva à multa. Nenhuma delas
 * quebra a tela quando some — só mudam o que o condomínio consegue provar.
 */

const TELA = "src/pages/Notificacoes.jsx";
const fonte = () => readFileSync(TELA, "utf8");

describe("multa não vira documento", () => {
  it("o botão de imprimir só existe para notificação", () => {
    // A multa é pedido à administradora, não papel que se entrega ao morador.
    // Foi pedido explicitamente, e um botão a mais aqui produz um documento que
    // não deveria existir.
    const src = fonte();
    const trecho = src.slice(src.indexOf("Imprimir / PDF") - 700, src.indexOf("Imprimir / PDF"));
    expect(trecho, "o botão de imprimir não está atrás do tipo").toMatch(
      /celula\(aberto, "tipo"\) === NOTIFICACAO/
    );
  });

  it("existe exatamente um botão de impressão na tela", () => {
    expect([...fonte().matchAll(/window\.print\(\)/g)]).toHaveLength(1);
  });

  it("a folha A4 também só é montada para notificação", () => {
    expect(fonte()).toMatch(/celula\(aberto, "tipo"\) === NOTIFICACAO \? \(/);
  });
});

describe("a justificativa da 3ª infração", () => {
  it("é exigida quando a unidade já travou", () => {
    const src = fonte();
    expect(src).toContain("const precisaJustificar = travado && form.tipo === NOTIFICACAO;");
    expect(src).toMatch(/if \(precisaJustificar && !form\.justificativa\.trim\(\)\)/);
  });

  it("só é gravada quando de fato contornou a regra", () => {
    // Gravar o texto num registro que não contornou nada faria o histórico
    // dizer que houve exceção onde não houve.
    expect(fonte()).toMatch(
      /justificativa: precisaJustificar \? form\.justificativa\.trim\(\) : null/
    );
  });

  it("escolher multa faz o painel sair do caminho", () => {
    // A trava existe para empurrar para a multa. Continuar pedindo justificativa
    // depois de escolher multa seria cobrar explicação por obedecer.
    expect(fonte()).toContain('onClick={() => campo("tipo", MULTA)}');
  });
});

describe("trocar de unidade não carrega o nome da anterior", () => {
  it("limpa o destinatário junto", () => {
    // Notificação com o nome do apartamento errado é erro grave e silencioso:
    // o documento sai bonito e nomeia a pessoa errada.
    expect(fonte()).toMatch(
      /if \(chave === "id_unidade"\) \{\s+novo\.destinatario = "";\s+novo\.id_morador = "";/
    );
  });

  it("limpa a reincidência junto: o motivo era da unidade anterior", () => {
    expect(fonte()).toMatch(
      /if \(chave === "id_unidade"\) \{[\s\S]{0,300}novo\.reincidencia = false;\s+novo\.id_reincidencia_de = "";/
    );
  });
});

describe("a reincidência é por motivo (0075)", () => {
  it("a contagem da tela é do motivo escolhido, não da unidade inteira", () => {
    const src = fonte();
    expect(src).toContain('const cadeiaEscolhida = form.reincidencia ? form.id_reincidencia_de : "";');
    expect(src).toContain("exigeMulta(registros, form.id_unidade, cadeiaEscolhida)");
    expect(src).not.toMatch(/exigeMulta\(registros, form\.id_unidade\)/);
  });

  it("o vínculo vai gravado no registro", () => {
    expect(fonte()).toMatch(/id_reincidencia_de: cadeiaEscolhida \? Number\(cadeiaEscolhida\) : null/);
  });

  it("marcar reincidência sem escolher a origem não salva", () => {
    expect(fonte()).toMatch(/if \(form\.reincidencia && !form\.id_reincidencia_de\)/);
  });

  it("o cadastro começa escolhendo notificação ou multa", () => {
    const src = fonte();
    expect(src).toContain('label="O que vai registrar?"');
    expect(src).toMatch(/\[NOTIFICACAO, "Notificação"\],\s+\[MULTA, "Multa"\],/);
  });

  it("multa direta é permitida: multa não exige motivo anterior", () => {
    // Há infração que a Convenção ou a lei punem com multa já na primeira vez.
    const src = fonte();
    expect(src).not.toMatch(/if \(form\.tipo === MULTA && !cadeiaEscolhida\)/);
    expect(src).toContain("<strong>Multa direta</strong>");
  });

  it("mexer na reincidência não troca o tipo escolhido", () => {
    expect(fonte()).not.toMatch(
      /if \(chave === "reincidencia" \|\| chave === "id_reincidencia_de"\) \{\s+novo\.tipo = NOTIFICACAO;/
    );
  });

  it("enviar por e-mail abre a prévia e envia pelo sistema, não pelo Gmail (0077)", () => {
    const src = fonte();
    expect(src).not.toMatch(/linkDoGmail\(/);
    expect(src).toContain('chamarEdgeFunction("enviar-notificacao"');
    expect(src).toContain("<EnvioPorEmail");
  });

  it("carta com texto não salvo não sai por e-mail", () => {
    expect(fonte()).toMatch(/if \(celula\(r, "tipo"\) === NOTIFICACAO && textoSujo\)/);
  });

  it("na demonstração nenhum e-mail sai", () => {
    const src = fonte();
    const inicio = src.indexOf("const confirmarEnvio");
    const trecho = src.slice(inicio, src.indexOf("chamarEdgeFunction(", inicio));
    expect(trecho).toMatch(/if \(MODO_DEMO\)/);
  });

});

describe("apagar avisa o que apagar significa", () => {
  it("a confirmação fala da contagem, não só do registro", () => {
    const src = fonte();
    const i = src.indexOf("Excluir este registro?");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 500)).toMatch(/contagem/i);
  });
});

describe("escolher a unidade é busca, não lista rolante", () => {
  it("usa a busca de unidade do sistema", () => {
    // A mesma da Mudança e da Piscina (BuscaUnidade), com a regra do cadastro
    // de encomenda. Um seletor feito à mão aqui era a nona cópia da mesma coisa.
    const src = fonte();
    expect(src).toContain('import BuscaUnidade from "../components/BuscaUnidade";');
    expect(src).toMatch(/<BuscaUnidade[\s\S]*?onEscolher=\{\(u\) => campo\("id_unidade"/);
  });

  it("acha por id inteiro, por apartamento e por bloco", () => {
    // "5206", "206" e "5" todos acham. Sem o ramo do apartamento, procurar o
    // 101 do bloco 2 obriga a saber que o id é 2101.
    const u = { id: 5206, bloco: "5", unidade: "206" };
    for (const termo of ["5206", "206", "5", "bloco 5 apto 206"]) expect(casaComUnidade(termo, u)).toBe(true);
    expect(casaComUnidade("307", u)).toBe(false);
  });

  it("não sobrou <select> nenhum: o tipo virou pílula", () => {
    expect([...fonte().matchAll(/<Select[\s>]/g)]).toHaveLength(0);
    expect(fonte()).toContain("filtro={filtroTipo}");
  });
});

describe("a carta é editável, e o que se edita é o que fica", () => {
  it("a folha é um editor, não texto fixo", () => {
    const src = fonte();
    expect(src).toContain("const editor = useEditor({");
    expect(src).toMatch(/<EditorContent editor=\{editor\} className="notif-folha__corpo" \/>/);
  });

  it("abrir um registro não marca alteração pendente", () => {
    // `setContent(html, false)` não emite update. Sem o `false`, todo registro
    // nasceria com "alterações não salvas" só por ter sido aberto, e o aviso
    // perderia o sentido no primeiro uso.
    // Não-guloso: o argumento é uma chamada aninhada, e `[^)]*` pararia no
    // primeiro parêntese interno.
    expect(fonte()).toMatch(/editor\.commands\.setContent\([\s\S]*?, false\)/);
    expect(fonte()).toContain("setTextoSujo(false);");
  });

  it("o que foi editado é gravado em `texto`", () => {
    // Sem gravar, o papel entregue ao morador e o registro que sustenta a multa
    // divergem já na primeira correção de redação.
    expect(fonte()).toMatch(/editar\("NOTIFICACOES", celula\(aberto, "id"\), \{ texto: html \}\)/);
  });

  it("fechar com edição pendente avisa antes de perder", () => {
    const src = fonte();
    expect(src).toContain("const fecharDetalhe = async () => {");
    expect(src).toMatch(/if \(textoSujo\) \{/);
    expect(src).toContain("onClose={fecharDetalhe}");
  });

  it("o e-mail leva a carta editada, e não uma regenerada", () => {
    // Regenerar aqui mandaria para a administradora uma carta diferente da que
    // o morador recebeu no papel.
    expect(fonte()).toMatch(/htmlParaTexto\(editor\?\.getHTML\(\)/);
  });

  it("a barra do editor fica fora da folha", () => {
    // Dentro dela sairia impressa junto com a notificação: a regra de impressão
    // mira `.notif-folha` inteira.
    const src = fonte();
    const barra = src.indexOf('className="notif-barra"');
    const folha = src.indexOf('<div className="notif-folha"');
    expect(barra).toBeGreaterThan(-1);
    expect(folha).toBeGreaterThan(barra);
  });

  it("só o síndico mexe em campo que não seja o texto", () => {
    // O UPDATE abriu para administrativo (0033) para o auxiliar poder ajustar a
    // redação. Sem o gatilho, ele viraria uma MULTA em NOTIFICACAO e desfaria o
    // fechamento do ciclo — o que a restrição de apagar existe para proteger.
    const sql = readFileSync("supabase/migrations/0033_texto_editavel_da_notificacao.sql", "utf8");
    expect(sql).toContain("notificacao_auxiliar_so_edita_texto");
    expect(sql).toMatch(/to_jsonb\(new\) - 'texto' - 'updated_at'/);
    expect(sql).toMatch(/if public\.eh_sindico\(\) then/);
  });
});

describe("o comprovante assinado", () => {
  it("aceita imagem e PDF", () => {
    expect(fonte()).toContain('accept="image/*,application/pdf"');
  });

  it("valida antes de subir", () => {
    // `validarAnexo` recusa o que não é imagem nem PDF e o que passa de 10 MB —
    // que é o teto do bucket. Sem ela, o erro só apareceria no Storage.
    expect(fonte()).toContain("const checagem = validarAnexo(arquivo);");
    expect(fonte()).toMatch(/if \(!checagem\.ok\) return toast\.error\(checagem\.motivo\)/);
  });

  it("sobe o arquivo ANTES da linha, e devolve o arquivo se a linha falhar", () => {
    // Na outra ordem, um upload que falha deixa uma linha apontando para
    // arquivo que não existe, e a tela mostra um anexo que não abre.
    const src = fonte();
    const i = src.indexOf("const envio = await enviarAnexo(");
    const j = src.indexOf('criar("NOTIFICACOES_ANEXOS"');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(src.slice(j, j + 500)).toContain("await removerAnexo(envio.caminho)");
  });

  it("apaga o arquivo antes da linha", () => {
    // Apagada a linha, o caminho no bucket é irrecuperável e o arquivo vira
    // armazenamento pago que ninguém enxerga.
    const src = fonte();
    const arquivo = src.indexOf('const arquivo = await removerAnexo(celula(anexo, "caminho_storage"))');
    const linha = src.indexOf('remover("NOTIFICACOES_ANEXOS"');
    expect(arquivo).toBeGreaterThan(-1);
    expect(linha).toBeGreaterThan(arquivo);
  });

  it("não conclui quando o arquivo não saiu do bucket", () => {
    // O Storage responde sem erro quando a política barra: quem só olha
    // `error` conclui "apagado" e deixa o arquivo alcançável por URL assinada.
    expect(fonte()).toMatch(/if \(!arquivo\.success\) return toast\.error/);
  });

  it("o campo de arquivo não fica em display:none", () => {
    // Clique encaminhado por <label> para campo escondido assim é ignorado por
    // parte dos navegadores de celular — o mesmo defeito da etiqueta.
    const css = readFileSync("src/styles/notificacoes.css", "utf8");
    const campo = css.match(/\.notif-anexos__campo\.vit-input \{[^}]*\}/)?.[0] ?? "";
    expect(campo).not.toBe("");
    expect(campo).not.toMatch(/display:\s*none/);
    expect(campo).toMatch(/opacity:\s*0/);
  });

  it("escolher o mesmo arquivo de novo volta a funcionar", () => {
    // Sem trocar a `key`, o <input> guarda o valor anterior e selecionar o
    // MESMO arquivo não dispara `onChange`: o botão parece morto.
    expect(fonte()).toMatch(/key=\{`\$\{celula\(aberto, "id"\)\}-\$\{anexosDe\(aberto\)\.length\}`\}/);
  });

  it("só quem apaga notificação apaga comprovante", () => {
    expect(fonte()).toMatch(/can\(user, "excluirNotificacao"\) && \(\s*<button[\s\S]{0,200}notif-anexos__tirar/);
  });
});

describe("quem alcança a tela", () => {
  const dev = { cargo: ROLES.DEV };
  const sindico = { cargo: ROLES.SINDICO };
  const auxiliar = { cargo: ROLES.AUX };
  const porteiro = { cargo: ROLES.PORTEIRO };
  const conselheiro = { cargo: ROLES.CONSELHEIRO };

  it("síndico, auxiliar e dev cadastram", () => {
    for (const u of [sindico, auxiliar, dev]) {
      expect(can(u, "criarNotificacao")).toBe(true);
    }
  });

  it("porteiro e conselheiro não entram", () => {
    // Aqui há descrição de conduta de morador identificado.
    for (const u of [porteiro, conselheiro]) {
      expect(can(u, "criarNotificacao")).toBe(false);
      expect(can(u, "excluirNotificacao")).toBe(false);
    }
  });

  it("o auxiliar cadastra mas não apaga", () => {
    // Apagar muda a contagem que leva à multa: é decisão de quem responde pelo
    // condomínio, não de quem digita.
    expect(can(auxiliar, "criarNotificacao")).toBe(true);
    expect(can(auxiliar, "excluirNotificacao")).toBe(false);
  });
});

describe("a tela está ligada ao sistema", () => {
  it("tem rota, e dentro do bloco que exclui o conselheiro", () => {
    const app = readFileSync("src/App.jsx", "utf8");
    expect(app).toContain('<Route path="/notificacoes"');
    // A rota tem que estar depois do guard `cargo !== "Conselheiro"` e antes do
    // fechamento dele; a checagem grosseira é a ordem no arquivo.
    const guard = app.indexOf('usuarioLogado.cargo !== "Conselheiro"');
    const rota = app.indexOf('<Route path="/notificacoes"');
    expect(guard).toBeGreaterThan(-1);
    expect(rota).toBeGreaterThan(guard);
  });

  it("aparece no menu, com o mesmo recorte de cargo", () => {
    const menu = (readFileSync("src/components/Sidebar.jsx", "utf8") + readFileSync("src/auth/menu.js", "utf8"));
    expect(menu).toMatch(/"Notificações": \[ROLES\.SINDICO, ROLES\.AUX, ROLES\.DEV\]/);
    expect(menu).toContain('["Notificações", ShieldAlert]');
  });

  it("o rótulo do menu vira a rota que existe", () => {
    // A Sidebar deriva o caminho do rótulo tirando acento. Se as duas pontas
    // divergirem, o item leva para uma página em branco.
    const semAcento = "Notificações".toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    expect(semAcento).toBe("notificacoes");
    expect(readFileSync("src/App.jsx", "utf8")).toContain(`path="/${semAcento}"`);
  });

  it("o estilo da folha foi carregado", () => {
    expect(readFileSync("src/main.jsx", "utf8")).toContain("styles/notificacoes.css");
  });
});

describe("a impressão", () => {
  const css = () => readFileSync("src/styles/notificacoes.css", "utf8");

  it("imprime sem abrir janela nova", () => {
    // `window.open` para imprimir morre em bloqueador de pop-up no celular, e
    // aí o botão não faz nada — defeito que já custou caro nesta base.
    expect(fonte()).not.toMatch(/window\.open\([^)]*print/);
    expect(css()).toMatch(/@media print/);
  });

  it("esconde a tela por visibilidade, não por display", () => {
    // A folha vive num modal em portal. Com `display: none` num ancestral, o
    // filho visível não tem onde ser desenhado e a página sai em branco.
    const impressao = css().match(/@media print \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(impressao).toContain("visibility: hidden");
    expect(impressao).toContain(".notif-folha, .notif-folha * { visibility: visible !important; }");
    expect(impressao).not.toMatch(/body \* \{[^}]*display:\s*none/);
  });

  it("a folha não segue o tema escuro", () => {
    // Ela vira papel. Com as cores do tema, a notificação sairia branca no
    // branco quando o sistema estivesse no escuro.
    const folha = css().match(/\.notif-folha \{[^}]*\}/)?.[0] ?? "";
    expect(folha).toContain("background: #fff");
    expect(folha).not.toMatch(/var\(--(bg|surface|fg)/);
  });

  it("o papel é A4", () => {
    expect(css()).toMatch(/@page \{[\s\S]*size: A4/);
  });
});
