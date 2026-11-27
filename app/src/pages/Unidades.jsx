import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Plus, Pencil, Trash2, Download, FileText, Building2, Eye } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { sanitizarCelula } from "../lib/drive";
import { listar, criar, editar, remover } from "../api/db";
import {
  Button, Badge, Modal, Field, Input, Checkbox,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import { Ficha, Filtros, MaisFiltros, Opcoes, PainelDeFiltros } from "../components/app/pecas";

/** Quantas linhas a lista mostra de cada vez; "Mostrar mais" soma outras tantas. */
const LOTE = 30;

/** "B5-206", o rótulo curto de todo o sistema. */
const rotulo = (u) => `B${u.bloco}-${u.unidade}`;

// Verde da marca em RGB, para o jsPDF, que não aceita hex.
const VERDE_PDF = [227, 90, 58];

const FORM_VAZIO = { id: "", bloco: "", unidade: "", ocupado: "Não", status: "Adimplente", valor: "" };

const COLUNAS_EXPORT = [
  { id: "bloco", label: "Bloco" },
  { id: "unidade", label: "Unidade" },
  { id: "ocupado", label: "Ocupado" },
  { id: "status", label: "Status" },
  { id: "valor", label: "Dívida" },
];

const fmtMoeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

// Traduz o que o Supabase devolve (RLS, constraints) para algo que um humano
// entende. O código/mensagem técnica do Postgres nunca aparece na tela.
//
// Duas formas diferentes de "sem permissão" caem aqui:
// - Criar: RLS barra o INSERT e o Postgres avisa explicitamente
//   ("new row violates row-level security policy").
// - Editar: RLS filtra a linha do UPDATE, que casa zero linhas; como `editar`
//   usa `.single()`, o Postgrest reclama que não pode devolver um objeto
//   único de zero linhas ("Cannot coerce the result..." / código PGRST116) —
//   tecnicamente não é a mesma frase, mas na prática, sempre que o form já
//   carregou a linha da lista, esse erro só acontece por falta de permissão.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar unidades.";
  }
  return msg;
};

export default function Unidades() {
  const toast = useToast();
  const confirm = useConfirm();

  const [unidades, setUnidades] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [modalExport, setModalExport] = useState(false);
  const [modo, setModo] = useState("add");
  const [vendo, setVendo] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erroForm, setErroForm] = useState({});

  const [busca, setBusca] = useState("");
  const [fBloco, setFBloco] = useState("Todos");
  const [fOcupado, setFOcupado] = useState("Todos");
  const [fStatus, setFStatus] = useState("Todos");
  const [ordem, setOrdem] = useState({ chave: "unidade", direcao: "asc" });
  const [limite, setLimite] = useState(LOTE);
  const [maisFiltros, setMaisFiltros] = useState(false);

  const [colunasExport, setColunasExport] = useState(
    COLUNAS_EXPORT.map((c) => ({ ...c, selected: true }))
  );

  // Leitura via Supabase: qualquer autenticado pode ler `unidades` (RLS libera
  // geral). `listar` lança em erro de rede ou de banco; o catch abaixo cobre.
  const buscarUnidades = useCallback(async () => {
    try {
      setCarregando(true);
      const dados = await listar("UNIDADES");
      setUnidades(Array.isArray(dados) ? dados : []);
    } catch {
      toast.error("Não foi possível carregar as unidades. Verifique a conexão.");
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    buscarUnidades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca e painel, sem a situação: as pílulas contam em cima disto.
  const semFiltroDeSituacao = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    return unidades.filter((u) => {
      // "5206", "206", "5" ou "B5-206": a mesma regra das outras buscas de unidade.
      const casaBusca = !termo ||
        rotulo(u).toLowerCase().includes(termo) ||
        (digitos !== "" && `${u.bloco ?? ""}${u.unidade ?? ""}`.includes(digitos)) ||
        u.unidade?.toString().includes(termo) ||
        u.bloco?.toString().toLowerCase() === termo;
      const casaBloco = fBloco === "Todos" || u.bloco?.toString() === fBloco;
      const casaOcupado = fOcupado === "Todos" || u.ocupado === fOcupado;
      return casaBusca && casaBloco && casaOcupado;
    });
  }, [unidades, busca, fBloco, fOcupado]);

  const contagem = useMemo(() => ({
    Todos: semFiltroDeSituacao.length,
    Adimplente: semFiltroDeSituacao.filter((u) => u.status !== "Inadimplente").length,
    Inadimplente: semFiltroDeSituacao.filter((u) => u.status === "Inadimplente").length,
  }), [semFiltroDeSituacao]);

  const linhas = useMemo(() => {
    const filtradas = semFiltroDeSituacao.filter((u) =>
      fStatus === "Todos" || (fStatus === "Inadimplente" ? u.status === "Inadimplente" : u.status !== "Inadimplente"));
    const valor = (u) => {
      // Unidade na ordem do prédio: bloco, depois apartamento.
      if (ordem.chave === "unidade") return `${String(u.bloco).padStart(4, "0")}-${String(u.unidade).padStart(6, "0")}`;
      if (ordem.chave === "valor") return parseFloat(u.valor) || 0;
      return String(u[ordem.chave] ?? "");
    };
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      const x = valor(a), y = valor(b);
      return x < y ? -sinal : x > y ? sinal : 0;
    });
  }, [semFiltroDeSituacao, fStatus, ordem]);

  const ordenar = (chave) =>
    setOrdem((o) => ({ chave, direcao: o.chave === chave && o.direcao === "asc" ? "desc" : "asc" }));

  const filtrosDoPainel = [fBloco, fOcupado].filter((f) => f !== "Todos").length;
  const temFiltro = busca || fStatus !== "Todos" || filtrosDoPainel > 0;
  const limparPainel = () => { setFBloco("Todos"); setFOcupado("Todos"); setLimite(LOTE); };
  const limparFiltros = () => { setBusca(""); setFStatus("Todos"); limparPainel(); };

  const blocos = useMemo(
    () => ["Todos", ...new Set(unidades.map((u) => u.bloco?.toString()).filter(Boolean))].sort(),
    [unidades]
  );

  const resumo = useMemo(() => {
    const ocupadas = unidades.filter((u) => u.ocupado === "Sim").length;
    const inad = unidades.filter((u) => u.status === "Inadimplente").length;
    const divida = unidades.reduce((a, u) => a + (parseFloat(u.valor) || 0), 0);
    return { ocupadas, inad, divida };
  }, [unidades]);

  /* ---------------- formulário ---------------- */

  const abrirNova = () => {
    setModo("add");
    setForm(FORM_VAZIO);
    setErroForm({});
    setModalAberto(true);
  };

  const abrirEdicao = (u) => {
    setModo("edit");
    setForm({
      id: u.id,
      bloco: u.bloco ?? "",
      unidade: u.unidade ?? "",
      ocupado: u.ocupado ?? "Não",
      status: u.status ?? "Adimplente",
      valor: u.valor ?? "",
    });
    setErroForm({});
    setModalAberto(true);
  };

  const validar = () => {
    const e = {};
    if (!String(form.bloco).trim()) e.bloco = "Informe o bloco.";
    if (!String(form.unidade).trim()) e.unidade = "Informe a unidade.";

    if (modo === "add" && !e.bloco && !e.unidade) {
      const duplicada = unidades.some(
        (u) =>
          u.bloco?.toString() === form.bloco.toString() &&
          u.unidade?.toString() === form.unidade.toString()
      );
      if (duplicada) {
        e.unidade = `A unidade ${form.unidade} do bloco ${form.bloco} já está cadastrada.`;
      }
    }
    setErroForm(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!validar()) return;

    const valorLimpo = String(form.valor).replace(/\./g, "").replace(",", ".");
    // Sem `id` aqui: no cadastro o banco gera o bigint sozinho, e mandar
    // `id: ""` (o que o FORM_VAZIO usa) quebraria o insert. Na edição o id
    // vai à parte, como segundo argumento de `editar`, não dentro dos campos.
    const dados = {
      bloco: form.bloco,
      unidade: form.unidade,
      ocupado: form.ocupado,
      status: form.status,
      valor: form.status === "Inadimplente" ? (parseFloat(valorLimpo) || 0) : 0,
    };

    setSalvando(true);
    try {
      // `criar`/`editar` NÃO lançam em erro de negócio (RLS negado, constraint
      // violada) — devolvem { success: false, message }. Checar `success`
      // aqui é obrigatório: sem isso, um Porteiro sem permissão veria "salvo"
      // mesmo com o banco recusando a gravação.
      const r = modo === "add"
        ? await criar("UNIDADES", dados)
        : await editar("UNIDADES", form.id, dados);

      if (!r.success) {
        toast.error(mensagemErro(r.message));
        return;
      }

      await buscarUnidades();
      setModalAberto(false);
      toast.success(
        modo === "add"
          ? `Unidade ${form.bloco}-${form.unidade} cadastrada`
          : `Unidade ${form.bloco}-${form.unidade} atualizada`
      );
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (u) => {
    const ok = await confirm({
      title: `Excluir a unidade ${u.bloco}-${u.unidade}?`,
      description:
        u.ocupado === "Sim"
          ? "Ela está marcada como ocupada. Não dá para desfazer."
          : "Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;

    setSalvando(true);
    try {
      const r = await remover("UNIDADES", u.id);
      if (!r.success) {
        toast.error(mensagemErro(r.message));
        return;
      }
      await buscarUnidades();
      setVendo(null);
      setModalAberto(false);
      toast.success(`Unidade ${u.bloco}-${u.unidade} excluída`);
    } finally {
      setSalvando(false);
    }
  };

  /* ---------------- exportação ---------------- */

  const alternarColuna = (id) =>
    setColunasExport((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );

  const exportarPDF = () => {
    const ativas = colunasExport.filter((c) => c.selected);
    if (ativas.length === 0) {
      toast.error("Selecione ao menos uma coluna para exportar.");
      return;
    }

    const doc = new jsPDF();
    const img = new Image();
    img.src = "/logo.png";

    const gerar = (comLogo) => {
      const head = [ativas.map((c) => c.label)];
      const body = linhas.map((u) =>
        ativas.map((c) => (c.id === "valor" ? fmtMoeda(u.valor) : sanitizarCelula(u[c.id])))
      );

      doc.setDrawColor(...VERDE_PDF);
      doc.setLineWidth(2);
      doc.rect(5, 5, 200, 287);
      if (comLogo) doc.addImage(img, "PNG", 70, 12, 70, 35);
      doc.setFontSize(20);
      doc.text("Relatório de Unidades", 105, comLogo ? 58 : 30, { align: "center" });

      autoTable(doc, {
        startY: comLogo ? 68 : 40,
        head,
        body,
        headStyles: { fillColor: VERDE_PDF, halign: "center" },
        theme: "grid",
      });

      doc.save("Relatorio_Unidades.pdf");
      setModalExport(false);
      toast.success(`PDF gerado com ${linhas.length} unidade(s)`);
    };

    img.onload = () => gerar(true);
    img.onerror = () => gerar(false);
  };

  const exportarExcel = () => {
    const dados = [
      ["Bloco", "Unidade", "Ocupado", "Status", "Dívida"],
      ...linhas.map((u) => [
        sanitizarCelula(u.bloco), sanitizarCelula(u.unidade),
        sanitizarCelula(u.ocupado), sanitizarCelula(u.status), u.valor,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Unidades");
    XLSX.writeFile(wb, "Relatorio_Unidades.xlsx");
    toast.success(`Planilha gerada com ${linhas.length} unidade(s)`);
  };

  /* ---------------- lista ---------------- */

  const meta = carregando
    ? "Carregando unidades"
    : [
        `${unidades.length} unidades`,
        `${resumo.ocupadas} ocupadas`,
        resumo.inad ? `${resumo.inad} inadimplentes` : null,
        resumo.divida > 0 ? `${fmtMoeda(resumo.divida)} em aberto` : null,
      ].filter(Boolean).join(" · ");

  const u = vendo;
  const deve = (x) => parseFloat(x?.valor) > 0;

  return (
    <div>
      <PageHeader
        title="Unidades"
        meta={meta}
        actions={
          <>
            <Button onClick={() => setModalExport(true)} iconLeft={<FileText size={15} />}>
              Exportar
            </Button>
            <Button variant="primary" onClick={abrirNova} iconLeft={<Plus size={16} />}>
              Nova unidade
            </Button>
          </>
        }
      />

      <Filtros
        busca={busca}
        onBusca={(x) => { setBusca(x); setLimite(LOTE); }}
        placeholder="Bloco ou unidade (ex.: 5206)"
        filtro={fStatus}
        onFiltro={(x) => { setFStatus(x); setLimite(LOTE); }}
        filtros={[
          ["Todos", "Todas", contagem.Todos],
          ["Adimplente", "Adimplentes", contagem.Adimplente],
          ["Inadimplente", "Inadimplentes", contagem.Inadimplente],
        ]}
        painel={
          <PainelDeFiltros aberto={maisFiltros}>
            <Field label="Bloco">
              <Opcoes rotulo="Bloco" valor={fBloco} onMudar={(x) => { setFBloco(x); setLimite(LOTE); }}
                opcoes={blocos.map((b) => [b, b === "Todos" ? "Todos" : `Bloco ${b}`])} />
            </Field>
            <Field label="Ocupação">
              <Opcoes rotulo="Ocupação" valor={fOcupado} onMudar={(x) => { setFOcupado(x); setLimite(LOTE); }}
                opcoes={[["Todos", "Todas"], ["Sim", "Ocupadas"], ["Não", "Vazias"]]} />
            </Field>
          </PainelDeFiltros>
        }
      >
        <MaisFiltros aberto={maisFiltros} onAlternar={() => setMaisFiltros((a) => !a)}
          ativos={filtrosDoPainel} onLimpar={limparPainel} />
      </Filtros>

      {!carregando && linhas.length === 0 ? (
        temFiltro ? (
          <EmptyState
            icon={<Search size={20} />}
            title="Nenhuma unidade com esses filtros"
            description="Ajuste a busca ou limpe os filtros para ver todas as unidades."
            action={<Button onClick={limparFiltros}>Limpar filtros</Button>}
          />
        ) : (
          <EmptyState
            icon={<Building2 size={20} />}
            title="Nenhuma unidade cadastrada"
            description="Cadastre a primeira unidade do condomínio para começar."
            action={
              <Button variant="primary" onClick={abrirNova} iconLeft={<Plus size={16} />}>
                Nova unidade
              </Button>
            }
          />
        )
      ) : (
        <ListaQueAbre
          colunas={[
            { rotulo: "Unidade", largura: "minmax(0, 1fr)", ordem: "unidade" },
            { rotulo: "Ocupação", largura: "minmax(0, 1fr)", ordem: "ocupado" },
            { rotulo: "Situação", largura: "minmax(0, 1fr)", ordem: "status" },
            { rotulo: "Em aberto", largura: "minmax(0, 1fr)", ordem: "valor" },
          ]}
          ordenacao={ordem}
          onOrdenar={ordenar}
          larguraAcoes="96px"
          itens={linhas.slice(0, limite)}
          carregando={carregando}
          chave={(x) => x.id ?? `${x.bloco}-${x.unidade}`}
          onAbrir={setVendo}
          rotuloDaLinha={(x) => `Abrir a unidade ${rotulo(x)}`}
          celulas={(x) => [
            <span key="u" className="mud-quem">
              <b className="conf-dado__mono">{rotulo(x)}</b>
              <small>Bloco {x.bloco} · apto {x.unidade}</small>
            </span>,
            <Badge key="o" tone={x.ocupado === "Sim" ? "positive" : "muted"}>
              {x.ocupado === "Sim" ? "Ocupada" : "Vazia"}
            </Badge>,
            <Badge key="s" tone={x.status === "Inadimplente" ? "danger" : "positive"}>{x.status}</Badge>,
            <span key="v" className={deve(x) ? "conf-dado__mono uni-divida" : "uni-nada"}>
              {deve(x) ? fmtMoeda(x.valor) : "—"}
            </span>,
          ]}
          acoes={(x) => (
            <>
              <Button size="sm" variant="ghost" aria-label={`Ver a unidade ${rotulo(x)}`}
                      onClick={() => setVendo(x)}><Eye size={16} /></Button>
              <Button size="sm" variant="ghost" aria-label={`Editar a unidade ${rotulo(x)}`}
                      onClick={() => abrirEdicao(x)}><Pencil size={16} /></Button>
            </>
          )}
        />
      )}
      {linhas.length > limite && (
        <div className="mud-mais">
          <Button variant="ghost" onClick={() => setLimite((n) => n + LOTE)}>
            Mostrar mais ({linhas.length - limite} restantes)
          </Button>
        </div>
      )}

      {/* ---- Ver: o desenho do detalhe de Encomendas ---- */}
      <Modal
        open={Boolean(u)}
        onClose={() => setVendo(null)}
        title="Detalhes da unidade"
        size="lg"
        footer={u && (
          <div className="app-modal__acoes">
            <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluir(u)}>Excluir</Button>
            <Button variant="primary" iconLeft={<Pencil size={15} />}
                    onClick={() => { setVendo(null); abrirEdicao(u); }}>
              Editar
            </Button>
          </div>
        )}
      >
        {u && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <span className="app-veiculo__ic" aria-hidden="true"><Building2 size={22} /></span>
              <div className="app-modal__quem">
                <strong>Unidade {rotulo(u)}</strong>
                <small>Bloco {u.bloco} · apartamento {u.unidade}</small>
                <span className="app-modal__selos">
                  <Badge tone={u.ocupado === "Sim" ? "positive" : "muted"}>{u.ocupado === "Sim" ? "Ocupada" : "Vazia"}</Badge>
                  <Badge tone={u.status === "Inadimplente" ? "danger" : "positive"}>{u.status}</Badge>
                </span>
              </div>
            </div>

            <div className="app-detalhe">
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Unidade</p>
                <div className="app-cartao">
                  <p className="app-cartao__rotulo">Bloco {u.bloco} · apto {u.unidade}</p>
                  <p className="app-cartao__grande">{rotulo(u)}</p>
                  <div className="app-cartao__selos">
                    <Badge tone={u.ocupado === "Sim" ? "positive" : "muted"}>{u.ocupado === "Sim" ? "Ocupada" : "Vazia"}</Badge>
                    <Badge tone={u.status === "Inadimplente" ? "danger" : "positive"}>{u.status}</Badge>
                  </div>
                </div>
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Situação" itens={[
                  ["Ocupação", u.ocupado === "Sim" ? "Ocupada" : "Vazia"],
                  ["Condomínio", u.status],
                  ["Valor em aberto", deve(u) ? fmtMoeda(u.valor) : "Nada em aberto", true],
                ]} />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Cadastro e edição ---- */}
      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={modo === "add" ? "Nova unidade" : "Editar unidade"}
        size="md"
        footer={
          <div className="app-modal__acoes">
            {modo === "edit"
              ? <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluir(form)}>Excluir</Button>
              : <span />}
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-unidade" loading={salvando}>
              {modo === "add" ? "Cadastrar" : "Salvar"}
            </Button>
          </div>
        }
      >
        <form id="form-unidade" className="mud-form" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div className="mud-form__par">
            <Field label="Bloco" required error={erroForm.bloco}
                   help={modo === "edit" ? "Não muda: é o que identifica a unidade" : undefined}>
              <Input
                value={form.bloco}
                onChange={(e) => setForm({ ...form, bloco: e.target.value })}
                disabled={modo === "edit"}
              />
            </Field>
            <Field label="Unidade" required error={erroForm.unidade}>
              <Input
                value={form.unidade}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                disabled={modo === "edit"}
              />
            </Field>
          </div>
          <Field label="Ocupação">
            <Opcoes rotulo="Ocupação" valor={form.ocupado}
                    onMudar={(x) => setForm({ ...form, ocupado: x })}
                    opcoes={[["Não", "Vazia"], ["Sim", "Ocupada"]]} />
          </Field>
          <Field label="Situação">
            <Opcoes rotulo="Situação" valor={form.status}
                    onMudar={(x) => setForm({ ...form, status: x })}
                    opcoes={["Adimplente", "Inadimplente"]} />
          </Field>
          {form.status === "Inadimplente" && (
            <Field label="Valor em aberto" help="Use vírgula para os centavos, por exemplo 1.240,50">
              <Input
                value={form.valor}
                inputMode="decimal"
                placeholder="0,00"
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </Field>
          )}
        </form>
      </Modal>

      {/* ---- Exportação ---- */}
      <Modal
        open={modalExport}
        onClose={() => setModalExport(false)}
        title="Exportar unidades"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalExport(false)}>Cancelar</Button>
            <Button onClick={exportarExcel} iconLeft={<Download size={15} />}>Excel</Button>
            <Button variant="primary" onClick={exportarPDF} iconLeft={<FileText size={15} />}>PDF</Button>
          </>
        }
      >
        <p className="vit-modal__desc app-export__texto">
          {linhas.length === unidades.length
            ? `Serão exportadas as ${linhas.length} unidades.`
            : `Serão exportadas as ${linhas.length} unidades que passam nos filtros atuais, de ${unidades.length} no total.`}
        </p>
        <p className="vit-field__label app-export__titulo">Colunas do PDF</p>
        <div className="app-export__colunas">
          {colunasExport.map((c) => (
            <Checkbox
              key={c.id}
              label={c.label}
              checked={c.selected}
              onChange={() => alternarColuna(c.id)}
            />
          ))}
        </div>
      </Modal>
    </div>
  );
}
