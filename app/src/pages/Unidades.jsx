import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, Plus, Edit2, Trash2, Download, FileText, Building2,
  ChevronLeft, ChevronRight, RotateCcw,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { sanitizarCelula } from "../lib/drive";
import { listar, criar, editar, remover } from "../api/db";
import {
  Button, Badge, Table, Modal, Field, Input, Select, Checkbox,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";

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
  const [form, setForm] = useState(FORM_VAZIO);
  const [erroForm, setErroForm] = useState({});

  const [busca, setBusca] = useState("");
  const [fBloco, setFBloco] = useState("Todos");
  const [fOcupado, setFOcupado] = useState("Todos");
  const [fStatus, setFStatus] = useState("Todos");
  const [sort, setSort] = useState({ key: "bloco", dir: "asc" });
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);

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

  const linhas = useMemo(() => {
    const filtradas = unidades.filter((u) => {
      const casaBusca =
        !busca ||
        u.unidade?.toString().includes(busca) ||
        u.bloco?.toString().includes(busca);
      const casaBloco = fBloco === "Todos" || u.bloco?.toString() === fBloco;
      const casaOcupado = fOcupado === "Todos" || u.ocupado === fOcupado;
      const casaStatus = fStatus === "Todos" || u.status === fStatus;
      return casaBusca && casaBloco && casaOcupado && casaStatus;
    });

    if (sort.key) {
      filtradas.sort((a, b) => {
        let x = a[sort.key];
        let y = b[sort.key];
        if (!isNaN(x) && !isNaN(y)) { x = Number(x); y = Number(y); }
        if (x < y) return sort.dir === "asc" ? -1 : 1;
        if (x > y) return sort.dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtradas;
  }, [unidades, busca, fBloco, fOcupado, fStatus, sort]);

  const totalPaginas = porPagina === "Todos" ? 1 : Math.max(1, Math.ceil(linhas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const exibidas = porPagina === "Todos"
    ? linhas
    : linhas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => { setPagina(1); }, [busca, fBloco, fOcupado, fStatus, porPagina]);

  const temFiltro = busca || fBloco !== "Todos" || fOcupado !== "Todos" || fStatus !== "Todos";
  const limparFiltros = () => {
    setBusca(""); setFBloco("Todos"); setFOcupado("Todos"); setFStatus("Todos");
  };

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

  /* ---------------- tabela ---------------- */

  const colunas = [
    { key: "bloco", label: "Bloco", sortable: true, width: 96,
      render: (u) => <span className="vit-table__id">{u.bloco}</span> },
    { key: "unidade", label: "Unidade", tipo: "id", sortable: true, width: 116 },
    { key: "ocupado", label: "Ocupação", sortable: true,
      render: (u) => (
        <Badge tone={u.ocupado === "Sim" ? "positive" : "neutral"}>
          {u.ocupado === "Sim" ? "Ocupada" : "Vazia"}
        </Badge>
      ) },
    { key: "status", label: "Situação", sortable: true,
      render: (u) => (
        <Badge tone={u.status === "Inadimplente" ? "danger" : "positive"}>
          {u.status}
        </Badge>
      ) },
    { key: "valor", label: "Dívida", tipo: "num", sortable: true,
      render: (u) => (parseFloat(u.valor) > 0 ? fmtMoeda(u.valor) : null) },
  ];

  const meta = carregando
    ? "Carregando unidades"
    : [
        `${unidades.length} unidades`,
        `${resumo.ocupadas} ocupadas`,
        resumo.inad ? `${resumo.inad} inadimplentes` : null,
        resumo.divida > 0 ? `${fmtMoeda(resumo.divida)} em aberto` : null,
      ].filter(Boolean).join(" · ");

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

      {/* ---- Filtros ---- */}
      <div className="cad-filtros">
        <div className="cad-filtros__busca">
          <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por bloco ou unidade"
            aria-label="Buscar por bloco ou unidade"
          />
        </div>
        <Select value={fBloco} onChange={(e) => setFBloco(e.target.value)} aria-label="Filtrar por bloco">
          {blocos.map((b) => (
            <option key={b} value={b}>{b === "Todos" ? "Todos os blocos" : `Bloco ${b}`}</option>
          ))}
        </Select>
        <Select value={fOcupado} onChange={(e) => setFOcupado(e.target.value)} aria-label="Filtrar por ocupação">
          <option value="Todos">Ocupada ou vazia</option>
          <option value="Sim">Só ocupadas</option>
          <option value="Não">Só vazias</option>
        </Select>
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filtrar por situação">
          <option value="Todos">Qualquer situação</option>
          <option value="Adimplente">Adimplente</option>
          <option value="Inadimplente">Inadimplente</option>
        </Select>
        {temFiltro && (
          <Button variant="ghost" onClick={limparFiltros} iconLeft={<RotateCcw size={14} />}>
            Limpar
          </Button>
        )}
      </div>

      <Table
        columns={colunas}
        rows={exibidas}
        loading={carregando}
        sort={sort}
        onSort={setSort}
        getRowKey={(u) => u.id ?? `${u.bloco}-${u.unidade}`}
        rowActions={(u) => (
          <>
            <Button size="sm" variant="ghost" aria-label={`Editar unidade ${u.bloco}-${u.unidade}`}
                    onClick={() => abrirEdicao(u)} iconLeft={<Edit2 size={14} />} />
            <Button size="sm" variant="ghost" aria-label={`Excluir unidade ${u.bloco}-${u.unidade}`}
                    onClick={() => excluir(u)} iconLeft={<Trash2 size={14} />} />
          </>
        )}
        empty={
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
        }
      />

      {/* ---- Paginação ---- */}
      {!carregando && linhas.length > 0 && (
        <div className="cad-paginacao">
          <span className="cad-paginacao__info">
            {porPagina === "Todos"
              ? `${linhas.length} unidade(s)`
              : `${(paginaSegura - 1) * porPagina + 1} a ${Math.min(paginaSegura * porPagina, linhas.length)} de ${linhas.length}`}
          </span>

          <div className="cad-paginacao__controles">
            <Select
              value={porPagina}
              onChange={(e) =>
                setPorPagina(e.target.value === "Todos" ? "Todos" : Number(e.target.value))
              }
              aria-label="Unidades por página"
              className="cad-paginacao__tamanho"
            >
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value="Todos">Mostrar todas</option>
            </Select>

            {totalPaginas > 1 && (
              <>
                <Button size="sm" aria-label="Página anterior"
                        disabled={paginaSegura <= 1}
                        onClick={() => setPagina((p) => Math.max(1, p - 1))}
                        iconLeft={<ChevronLeft size={15} />} />
                <span className="cad-paginacao__pagina">
                  {paginaSegura} de {totalPaginas}
                </span>
                <Button size="sm" aria-label="Próxima página"
                        disabled={paginaSegura >= totalPaginas}
                        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                        iconLeft={<ChevronRight size={15} />} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ---- Modal de cadastro e edição ---- */}
      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={modo === "add" ? "Nova unidade" : `Editar unidade ${form.bloco}-${form.unidade}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvar} loading={salvando}>
              {modo === "add" ? "Cadastrar" : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="cad-form">
          <Field label="Bloco" required error={erroForm.bloco}>
            <Input
              value={form.bloco}
              onChange={(e) => setForm({ ...form, bloco: e.target.value })}
              disabled={modo === "edit"}
            />
          </Field>
          <Field label="Unidade" required error={erroForm.unidade}>
            <Input
              value={form.unidade}
              onChange={(e) => setForm({ ...form, unidade: e.target.value })}
              disabled={modo === "edit"}
            />
          </Field>
          <Field label="Ocupação">
            <Select value={form.ocupado} onChange={(e) => setForm({ ...form, ocupado: e.target.value })}>
              <option value="Não">Vazia</option>
              <option value="Sim">Ocupada</option>
            </Select>
          </Field>
          <Field label="Situação">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Adimplente">Adimplente</option>
              <option value="Inadimplente">Inadimplente</option>
            </Select>
          </Field>
          {form.status === "Inadimplente" && (
            <Field
              label="Valor em aberto"
              help="Use vírgula para os centavos, por exemplo 1.240,50"
              className="cad-form__largo"
            >
              <Input
                value={form.valor}
                inputMode="decimal"
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </Field>
          )}
        </div>
        {modo === "edit" && (
          <p className="cad-form__nota">
            Bloco e unidade não podem ser alterados porque formam o identificador do registro.
          </p>
        )}
      </Modal>

      {/* ---- Modal de exportação ---- */}
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
        <p className="vit-modal__desc" style={{ marginBottom: "var(--space-6)" }}>
          {linhas.length === unidades.length
            ? `Serão exportadas as ${linhas.length} unidades.`
            : `Serão exportadas as ${linhas.length} unidades que passam nos filtros atuais, de ${unidades.length} no total.`}
        </p>
        <p className="vit-field__label" style={{ marginBottom: "var(--space-4)" }}>
          Colunas do PDF
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
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
