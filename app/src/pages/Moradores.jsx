import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, Plus, Edit2, Trash2, Eye, FileText, Download, Users, RotateCcw,
  ChevronLeft, ChevronRight, Car, Phone, MessageCircle,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { sanitizarCelula } from "../lib/drive";
import { dataBR } from "../lib/format";
import { listar, criar, editar, remover } from "../api/db";
import {
  Button, Badge, Table, Modal, Gaveta, Field, Input, Select, Checkbox,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";

// Verde da marca em RGB, para o jsPDF, que não aceita hex.
const VERDE_PDF = [227, 90, 58];
const TINTA_PDF = [26, 28, 25];

// "Inquilino" e só "Titular"/"Dependente" eram os valores previstos aqui,
// mas conferindo o banco real (317 linhas) e os dados de demonstração, o
// vínculo usado de fato é "Locatário", e existe um terceiro tipo de morador,
// "Não Morador" (ex.: funcionário cadastrado só para controle de acesso).
// Sem isso, editar um desses moradores mostraria o campo em branco na tela,
// mesmo com o dado correto guardado no `form`.
const VINCULOS = ["Proprietário", "Locatário"];
const TIPOS_MORADOR = ["Titular", "Dependente", "Não Morador"];

const FORM_VAZIO = {
  id: "", id_unidade: "", nome: "", cpf: "", rg: "",
  tipo_vinculo: "Proprietário", tipo_morador: "Titular",
  telefone: "", email: "", data_entrada: "", data_saida: "", status: "Ativo",
};

const COLUNAS_EXPORT = [
  { id: "id_unidade", label: "Unidade" },
  { id: "nome", label: "Nome" },
  { id: "cpf", label: "CPF" },
  { id: "tipo_vinculo", label: "Vínculo" },
  { id: "tipo_morador", label: "Morador" },
  { id: "telefone", label: "Telefone" },
  { id: "email", label: "E-mail" },
  { id: "status", label: "Status" },
];

/* ---------------- máscaras e utilitários ---------------- */

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

const mascaraCPF = (v) =>
  soDigitos(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const mascaraTelefone = (v) => {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

// `data_entrada` e `data_saida` são `date` no banco, e a API devolve
// "AAAA-MM-DD" — exatamente o formato que um <input type="date"> espera. Não há
// mais nada a converter: o serial do Excel foi resolvido na carga, e a exibição
// em dd/mm/aaaa vive em lib/format.

/** Iniciais para o avatar: primeiro e último nome. */
function iniciaisDe(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Link do WhatsApp. Número brasileiro sem o 55 não abre a conversa, e a
 * planilha guarda só DDD + número.
 */
function linkWhatsApp(telefone) {
  const d = soDigitos(telefone);
  const comPais = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${comPais}`;
}

// Traduz o que o Supabase devolve (RLS, constraints) para algo que um humano
// entende. O código/mensagem técnica do Postgres nunca aparece na tela.
//
// Três formas diferentes de erro caem aqui:
// - Criar: RLS barra o INSERT e o Postgres avisa explicitamente
//   ("new row violates row-level security policy").
// - Editar: RLS filtra a linha do UPDATE, que casa zero linhas; como `editar`
//   usa `.single()`, o Postgrest reclama que não pode devolver um objeto
//   único de zero linhas ("Cannot coerce the result..." / código PGRST116) —
//   tecnicamente não é a mesma frase, mas na prática, sempre que o form já
//   carregou a linha da lista, esse erro só acontece por falta de permissão.
// - `id_unidade` é chave estrangeira para `unidades.id`: um valor que não
//   exista lá quebra o INSERT/UPDATE com "violates foreign key constraint".
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/foreign key constraint|is not present in table/i.test(msg)) {
    return "Unidade não encontrada. Escolha uma unidade da lista.";
  }
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar moradores.";
  }
  return msg;
};

export default function Moradores({ user }) {
  // O App já passava `user` nesta rota; a tela é que ignorava. Serve para
  // gravar `created_by`, que a planilha trazia vazio nas 317 linhas.
  const nomeUsuario = user?.nome || "Sistema";

  const toast = useToast();
  const confirm = useConfirm();

  const [moradores, setMoradores] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [vagas, setVagas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [modalExport, setModalExport] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [modo, setModo] = useState("add");
  const [form, setForm] = useState(FORM_VAZIO);
  const [erroForm, setErroForm] = useState({});

  const [busca, setBusca] = useState("");
  const [fVinculo, setFVinculo] = useState("Todos");
  const [fStatus, setFStatus] = useState("Todos");
  const [fBloco, setFBloco] = useState("Todos");
  const [fTipo, setFTipo] = useState("Todos");
  const [sort, setSort] = useState({ key: "nome", dir: "asc" });
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);

  const [colunasExport, setColunasExport] = useState(
    COLUNAS_EXPORT.map((c) => ({ ...c, selected: true }))
  );

  // Três leituras via Supabase: qualquer autenticado pode ler `moradores`,
  // `unidades` e `vagas` (RLS libera geral, só a escrita é restrita). `listar`
  // lança em erro de rede ou de banco; o catch abaixo cobre as três de uma vez
  // — se qualquer uma falhar, a tela mostra erro em vez de dado pela metade.
  const buscarDados = useCallback(async () => {
    try {
      setCarregando(true);
      const [dM, dU, dV] = await Promise.all([
        listar("MORADORES"),
        listar("UNIDADES"),
        listar("VAGAS"),
      ]);
      setMoradores(Array.isArray(dM) ? dM : []);
      setUnidades(Array.isArray(dU) ? dU : []);
      setVagas(Array.isArray(dV) ? dV : []);
    } catch {
      toast.error("Não foi possível carregar os moradores. Verifique a conexão.");
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    buscarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- derivados ---------------- */

  const unidadePorId = useMemo(() => {
    const mapa = new Map();
    unidades.forEach((u) => mapa.set(String(u.id), u));
    return mapa;
  }, [unidades]);

  const rotuloUnidade = useCallback(
    (id) => {
      const u = unidadePorId.get(String(id));
      return u ? `B${u.bloco}-${u.unidade}` : String(id || "");
    },
    [unidadePorId]
  );

  const contarVeiculos = useCallback(
    (idUnidade) => {
      if (!idUnidade || vagas.length === 0) return 0;
      const alvo = String(idUnidade).trim();
      return vagas.filter((v) => String(v.id_unidade).trim() === alvo).length;
    },
    [vagas]
  );

  /**
   * Modelo e placa dos veículos da unidade.
   *
   * A página já busca VAGAS por causa do contador; aqui só aproveita o que
   * está em memória. Antes o detalhe mostrava "2" e para saber QUAIS era
   * preciso sair da tela e abrir Vagas.
   */
  const veiculosDaUnidade = useCallback(
    (idUnidade) => {
      if (!idUnidade) return [];
      const alvo = String(idUnidade).trim();
      const lista = [];
      vagas
        .filter((v) => String(v.id_unidade).trim() === alvo)
        .forEach((v) => {
          if (v.possui_carro === "Sim") {
            lista.push(`${v.modelo_carro || "Carro"} (${v.placa_carro || "sem placa"})`);
          }
          if (v.possui_moto === "Sim") {
            lista.push(`${v.modelo_moto || "Moto"} (${v.placa_moto || "sem placa"})`);
          }
        });
      return lista;
    },
    [vagas]
  );

  /** Outros moradores da mesma unidade, exceto o que está aberto. */
  const vizinhosDaUnidade = useCallback(
    (idUnidade, cpfAtual) => {
      if (!idUnidade) return [];
      const alvo = String(idUnidade).trim();
      return moradores.filter(
        (m) => String(m.id_unidade).trim() === alvo && m.cpf !== cpfAtual
      );
    },
    [moradores]
  );

  const unidadesOrdenadas = useMemo(
    () =>
      [...unidades].sort((a, b) => {
        const bloco = String(a.bloco).localeCompare(String(b.bloco), "pt-BR", { numeric: true });
        if (bloco !== 0) return bloco;
        return String(a.unidade).localeCompare(String(b.unidade), "pt-BR", { numeric: true });
      }),
    [unidades]
  );

  const blocos = useMemo(
    () => ["Todos", ...new Set(unidades.map((u) => String(u.bloco)).filter(Boolean))].sort(),
    [unidades]
  );

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNum = soDigitos(termo);

    const filtrados = moradores.filter((m) => {
      const casaNome = String(m.nome || "").toLowerCase().includes(termo);
      const casaCPF = termoNum !== "" && soDigitos(m.cpf).includes(termoNum);
      const casaBusca = termo === "" || casaNome || casaCPF;

      const casaVinculo = fVinculo === "Todos" || m.tipo_vinculo === fVinculo;
      const casaStatus = fStatus === "Todos" || m.status === fStatus;
      const casaTipo = fTipo === "Todos" || (m.tipo_morador || "Titular") === fTipo;

      const u = unidadePorId.get(String(m.id_unidade));
      const casaBloco = fBloco === "Todos" || String(u?.bloco) === fBloco;

      return casaBusca && casaVinculo && casaStatus && casaTipo && casaBloco;
    });

    return filtrados.sort((a, b) => {
      const x = String(a[sort.key] ?? "");
      const y = String(b[sort.key] ?? "");
      const cmp = x.localeCompare(y, "pt-BR", { numeric: true, sensitivity: "base" });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [moradores, busca, fVinculo, fStatus, fTipo, fBloco, sort, unidadePorId]);

  const totalPaginas = porPagina === "Todos" ? 1 : Math.max(1, Math.ceil(linhas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const exibidos = porPagina === "Todos"
    ? linhas
    : linhas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => { setPagina(1); }, [busca, fVinculo, fStatus, fBloco, fTipo, porPagina]);

  const temFiltro =
    busca || fVinculo !== "Todos" || fStatus !== "Todos" || fBloco !== "Todos" || fTipo !== "Todos";

  const limparFiltros = () => {
    setBusca(""); setFVinculo("Todos"); setFStatus("Todos");
    setFBloco("Todos"); setFTipo("Todos");
  };

  /* ---------------- formulário ---------------- */

  const abrirNovo = () => {
    setModo("add");
    setForm(FORM_VAZIO);
    setErroForm({});
    setModalAberto(true);
  };

  const abrirEdicao = (m) => {
    setModo("edit");
    setForm({
      ...FORM_VAZIO,
      ...m,
      cpf: mascaraCPF(m.cpf),
      telefone: mascaraTelefone(m.telefone),
      // `rg` e `email` são `text` opcionais no banco e vêm `null` quando
      // vazios (confirmado nas 317 linhas reais) — não "". Um <Input
      // controlado com value={null} gera aviso do React e se comporta como
      // não controlado; "" é o valor neutro que o campo espera.
      rg: m.rg ?? "",
      email: m.email ?? "",
      tipo_morador: m.tipo_morador || "Titular",
    });
    setErroForm({});
    setModalAberto(true);
  };

  const validar = () => {
    const e = {};
    if (!form.nome.trim()) e.nome = "Informe o nome.";
    if (!form.id_unidade) e.id_unidade = "Escolha a unidade.";

    const cpf = soDigitos(form.cpf);
    if (cpf.length > 0 && cpf.length !== 11) {
      e.cpf = "O CPF precisa ter 11 dígitos.";
    } else if (cpf.length === 11) {
      const duplicado = moradores.some(
        (m) => soDigitos(m.cpf) === cpf && String(m.id) !== String(form.id)
      );
      if (duplicado) e.cpf = "Já existe um morador com este CPF.";
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = "Email inválido.";
    }

    setErroForm(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!validar()) return;

    // Monta o payload explicitamente em vez de espalhar `form` inteiro:
    // - `id_unidade` sai do <select> como string; a coluna é bigint com FK
    //   para unidades.id, então precisa virar número antes de gravar.
    // - `data_entrada`/`data_saida` chegam do <input type="date"> como
    //   "AAAA-MM-DD", que a coluna `date` aceita direto. Só o "" de campo em
    //   branco precisa virar null: `date` recusa string vazia.
    // - Sem `id` aqui: no cadastro o banco gera o bigint sozinho, e mandar
    //   `id: ""` (o que o FORM_VAZIO usa) quebraria o insert. Na edição o id
    //   vai à parte, como segundo argumento de `editar`, não dentro dos campos.
    const dados = {
      nome: form.nome.trim(),
      id_unidade: Number(form.id_unidade),
      cpf: form.cpf || null,
      rg: form.rg || null,
      tipo_vinculo: form.tipo_vinculo,
      tipo_morador: form.tipo_morador,
      telefone: form.telefone || null,
      email: form.email.trim() || null,
      data_entrada: form.data_entrada === "" ? null : form.data_entrada,
      data_saida: form.data_saida === "" ? null : form.data_saida,
      status: form.status,
    };

    setSalvando(true);
    try {
      // `criar`/`editar` NÃO lançam em erro de negócio (RLS negado, FK
      // inválida) — devolvem { success: false, message }. Checar `success`
      // aqui é obrigatório: sem isso, um Porteiro sem permissão veria "salvo"
      // mesmo com o banco recusando a gravação.
      // `created_by` só no cadastro. Numa edição ele guarda quem criou a linha,
      // e sobrescrever com quem está editando apagaria justamente essa
      // informação — `updated_at` já registra que houve alteração.
      const r = modo === "add"
        ? await criar("MORADORES", { ...dados, created_by: nomeUsuario })
        : await editar("MORADORES", form.id, dados);

      if (!r.success) {
        toast.error(mensagemErro(r.message));
        return;
      }

      await buscarDados();
      setModalAberto(false);
      toast.success(modo === "add" ? `${form.nome} cadastrado` : `${form.nome} atualizado`);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (m) => {
    const veiculos = contarVeiculos(m.id_unidade);
    const ok = await confirm({
      title: `Excluir o morador ${m.nome}?`,
      description: [
        `Unidade ${rotuloUnidade(m.id_unidade)}.`,
        veiculos > 0 ? `A unidade tem ${veiculos} vaga(s) vinculada(s).` : null,
        "Não dá para desfazer.",
      ].filter(Boolean).join(" "),
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;

    setSalvando(true);
    try {
      const r = await remover("MORADORES", m.id);
      if (!r.success) {
        toast.error(mensagemErro(r.message));
        return;
      }
      await buscarDados();
      setDetalhe(null);
      toast.success(`${m.nome} foi removido`);
    } finally {
      setSalvando(false);
    }
  };

  /* ---------------- exportação ---------------- */

  const alternarColuna = (id) =>
    setColunasExport((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );

  const valorExport = (m, colId) => {
    if (colId === "id_unidade") return sanitizarCelula(rotuloUnidade(m.id_unidade));
    if (colId === "tipo_morador") return sanitizarCelula(m.tipo_morador || "Titular");
    if (colId === "cpf") return sanitizarCelula(mascaraCPF(m.cpf));
    if (colId === "telefone") return sanitizarCelula(mascaraTelefone(m.telefone));
    return sanitizarCelula(m[colId] ?? "");
  };

  const exportarExcel = () => {
    const dados = linhas.map((m) => ({
      Unidade: valorExport(m, "id_unidade"),
      Nome: sanitizarCelula(m.nome),
      CPF: valorExport(m, "cpf"),
      RG: sanitizarCelula(m.rg || ""),
      Vínculo: sanitizarCelula(m.tipo_vinculo),
      Morador: valorExport(m, "tipo_morador"),
      Telefone: valorExport(m, "telefone"),
      "E-mail": sanitizarCelula(m.email),
      Status: m.status,
      "Data de entrada": dataBR(m.data_entrada) || "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Moradores");
    XLSX.writeFile(wb, "Moradores.xlsx");
    toast.success(`Planilha gerada com ${linhas.length} morador(es)`);
  };

  const exportarPDF = () => {
    const ativas = colunasExport.filter((c) => c.selected);
    if (ativas.length === 0) {
      toast.error("Selecione ao menos uma coluna para exportar.");
      return;
    }

    // Paisagem: são até 8 colunas, não cabem em retrato.
    const doc = new jsPDF("l", "mm", "a4");
    const img = new Image();
    img.src = "/logo.png";

    const head = [ativas.map((c) => c.label)];
    const body = linhas.map((m) => ativas.map((c) => valorExport(m, c.id)));

    const gerar = (comLogo) => {
      doc.setDrawColor(...VERDE_PDF);
      doc.setLineWidth(1.5);
      doc.rect(5, 5, 287, 200);
      if (comLogo) doc.addImage(img, "PNG", 113, 12, 70, 25);
      doc.setFontSize(18);
      doc.setTextColor(...TINTA_PDF);
      doc.text("Relatório de Moradores", 148, comLogo ? 45 : 25, { align: "center" });

      autoTable(doc, {
        startY: comLogo ? 55 : 35,
        head,
        body,
        headStyles: { fillColor: VERDE_PDF, halign: "center", textColor: [255, 255, 255] },
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { left: 10, right: 10 },
      });

      doc.save("Relatorio_Moradores.pdf");
      setModalExport(false);
      toast.success(`PDF gerado com ${linhas.length} morador(es)`);
    };

    img.onload = () => gerar(true);
    img.onerror = () => gerar(false);
  };

  /* ---------------- tabela ---------------- */

  const colunas = [
    { key: "id_unidade", label: "Unidade", tipo: "id", sortable: true, width: 108,
      render: (m) => rotuloUnidade(m.id_unidade) },
    { key: "nome", label: "Nome", sortable: true,
      render: (m) => <span style={{ fontWeight: 600 }}>{m.nome}</span> },
    { key: "cpf", label: "CPF", render: (m) => mascaraCPF(m.cpf) },
    { key: "tipo_vinculo", label: "Vínculo", sortable: true },
    { key: "tipo_morador", label: "Morador",
      render: (m) => (
        <Badge tone={(m.tipo_morador || "Titular") === "Titular" ? "brand" : "neutral"}>
          {m.tipo_morador || "Titular"}
        </Badge>
      ) },
    { key: "telefone", label: "Telefone", render: (m) => mascaraTelefone(m.telefone) },
    { key: "status", label: "Status", sortable: true,
      render: (m) => (
        <Badge tone={m.status === "Ativo" ? "positive" : "danger"}>{m.status}</Badge>
      ) },
  ];

  const resumo = useMemo(() => {
    const ativos = moradores.filter((m) => m.status === "Ativo").length;
    const proprietarios = moradores.filter((m) => m.tipo_vinculo === "Proprietário").length;
    return { ativos, proprietarios };
  }, [moradores]);

  const meta = carregando
    ? "Carregando moradores"
    : [
        `${moradores.length} moradores`,
        `${resumo.ativos} ativos`,
        `${resumo.proprietarios} proprietários`,
      ].join(" · ");

  // `created_at`, e não `data_entrada`: a segunda é quando o morador entrou na
  // unidade, e rotulá-la de "cadastrado em" dizia uma coisa mostrando outra.
  // Fica vazio nas 317 linhas vindas da planilha, que não trazem o carimbo —
  // não mostrar nada é melhor que mostrar a data errada.
  const metaCadastro = detalhe?.created_at
    ? `Cadastrado em ${dataBR(detalhe.created_at)}`
    : undefined;

  return (
    <div>
      <PageHeader
        title="Moradores"
        meta={meta}
        actions={
          <>
            <Button onClick={() => setModalExport(true)} iconLeft={<FileText size={15} />}>
              Exportar
            </Button>
            <Button variant="primary" onClick={abrirNovo} iconLeft={<Plus size={16} />}>
              Novo morador
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
            placeholder="Buscar por nome ou CPF"
            aria-label="Buscar por nome ou CPF"
          />
        </div>
        <Select value={fBloco} onChange={(e) => setFBloco(e.target.value)} aria-label="Filtrar por bloco">
          {blocos.map((b) => (
            <option key={b} value={b}>{b === "Todos" ? "Todos os blocos" : `Bloco ${b}`}</option>
          ))}
        </Select>
        <Select value={fVinculo} onChange={(e) => setFVinculo(e.target.value)} aria-label="Filtrar por vínculo">
          <option value="Todos">Qualquer vínculo</option>
          {VINCULOS.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
        <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)} aria-label="Filtrar por tipo de morador">
          <option value="Todos">Titular e dependente</option>
          {TIPOS_MORADOR.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filtrar por status">
          <option value="Todos">Ativo e inativo</option>
          <option value="Ativo">Só ativos</option>
          <option value="Inativo">Só inativos</option>
        </Select>
        {temFiltro && (
          <Button variant="ghost" onClick={limparFiltros} iconLeft={<RotateCcw size={14} />}>
            Limpar
          </Button>
        )}
      </div>

      <Table
        columns={colunas}
        rows={exibidos}
        loading={carregando}
        sort={sort}
        onSort={setSort}
        getRowKey={(m) => m.id}
        rowActions={(m) => (
          <>
            <Button size="sm" variant="ghost" aria-label={`Ver ${m.nome}`}
                    onClick={() => setDetalhe(m)} iconLeft={<Eye size={14} />} />
            <Button size="sm" variant="ghost" aria-label={`Editar ${m.nome}`}
                    onClick={() => abrirEdicao(m)} iconLeft={<Edit2 size={14} />} />
            <Button size="sm" variant="ghost" aria-label={`Excluir ${m.nome}`}
                    onClick={() => excluir(m)} iconLeft={<Trash2 size={14} />} />
          </>
        )}
        empty={
          temFiltro ? (
            <EmptyState
              icon={<Search size={20} />}
              title="Nenhum morador com esses filtros"
              description="Ajuste a busca ou limpe os filtros para ver todos os moradores."
              action={<Button onClick={limparFiltros}>Limpar filtros</Button>}
            />
          ) : (
            <EmptyState
              icon={<Users size={20} />}
              title="Nenhum morador cadastrado"
              description="Cadastre o primeiro morador para vinculá-lo a uma unidade."
              action={
                <Button variant="primary" onClick={abrirNovo} iconLeft={<Plus size={16} />}>
                  Novo morador
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
              ? `${linhas.length} morador(es)`
              : `${(paginaSegura - 1) * porPagina + 1} a ${Math.min(paginaSegura * porPagina, linhas.length)} de ${linhas.length}`}
          </span>
          <div className="cad-paginacao__controles">
            <Select
              value={porPagina}
              onChange={(e) => setPorPagina(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}
              aria-label="Moradores por página"
              className="cad-paginacao__tamanho"
            >
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value="Todos">Mostrar todos</option>
            </Select>
            {totalPaginas > 1 && (
              <>
                <Button size="sm" aria-label="Página anterior" disabled={paginaSegura <= 1}
                        onClick={() => setPagina((p) => Math.max(1, p - 1))}
                        iconLeft={<ChevronLeft size={15} />} />
                <span className="cad-paginacao__pagina">{paginaSegura} de {totalPaginas}</span>
                <Button size="sm" aria-label="Próxima página" disabled={paginaSegura >= totalPaginas}
                        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                        iconLeft={<ChevronRight size={15} />} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ---- Cadastro e edição ---- */}
      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={modo === "add" ? "Novo morador" : `Editar ${form.nome}`}
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
          <Field label="Nome completo" required error={erroForm.nome} className="cad-form__largo">
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>

          <Field label="Unidade" required error={erroForm.id_unidade} className="cad-form__largo">
            {/* Select nativo em vez do dropdown caseiro: no celular abre o
                seletor do sistema, que é maior e mais fácil de acertar. */}
            <Select
              value={form.id_unidade}
              onChange={(e) => setForm({ ...form, id_unidade: e.target.value })}
            >
              <option value="">Selecione a unidade</option>
              {unidadesOrdenadas.map((u) => (
                <option key={u.id} value={u.id}>
                  Bloco {u.bloco} · Unidade {u.unidade}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="CPF" error={erroForm.cpf} help="Opcional, mas não pode repetir">
            <Input
              value={form.cpf}
              inputMode="numeric"
              placeholder="000.000.000-00"
              onChange={(e) => setForm({ ...form, cpf: mascaraCPF(e.target.value) })}
            />
          </Field>

          <Field label="RG">
            <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
          </Field>

          <Field label="Vínculo">
            <Select value={form.tipo_vinculo} onChange={(e) => setForm({ ...form, tipo_vinculo: e.target.value })}>
              {VINCULOS.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          </Field>

          <Field label="Tipo de morador">
            <Select value={form.tipo_morador} onChange={(e) => setForm({ ...form, tipo_morador: e.target.value })}>
              {TIPOS_MORADOR.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>

          <Field label="Telefone">
            <Input
              value={form.telefone}
              inputMode="tel"
              placeholder="(00) 00000-0000"
              onChange={(e) => setForm({ ...form, telefone: mascaraTelefone(e.target.value) })}
            />
          </Field>

          <Field label="E-mail" error={erroForm.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label="Data de entrada">
            {/* <input type="date"> fala "AAAA-MM-DD", que é exatamente o que a
                coluna `date` devolve e aceita. Nada a converter dos dois lados. */}
            <Input type="date" value={form.data_entrada ?? ""}
                   onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} />
          </Field>

          <Field label="Data de saída" help="Preencha só quando o morador deixar a unidade">
            <Input type="date" value={form.data_saida ?? ""}
                   onChange={(e) => setForm({ ...form, data_saida: e.target.value })} />
          </Field>

          <Field label="Status" className="cad-form__largo">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* ---- Detalhe: painel lateral, para a lista continuar visivel atras ---- */}
      <Gaveta
        open={Boolean(detalhe)}
        onClose={() => setDetalhe(null)}
        sigla={iniciaisDe(detalhe?.nome)}
        titulo={detalhe?.nome}
        meta={metaCadastro}
        fitas={detalhe && (
          <>
            <Badge tone="brand">{rotuloUnidade(detalhe.id_unidade)}</Badge>
            <Badge tone={(detalhe.tipo_morador || "Titular") === "Titular" ? "positive" : "neutral"}>
              {detalhe.tipo_morador || "Titular"}
            </Badge>
            {detalhe.tipo_vinculo && <Badge tone="neutral">{detalhe.tipo_vinculo}</Badge>}
            <Badge tone={detalhe.status === "Ativo" ? "positive" : "danger"}>{detalhe.status}</Badge>
          </>
        )}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDetalhe(null)}>Fechar</Button>
            <Button variant="primary" iconLeft={<Edit2 size={15} />}
                    onClick={() => { const m = detalhe; setDetalhe(null); abrirEdicao(m); }}>
              Editar
            </Button>
          </>
        }
      >
        {detalhe && (
          <>
            <section className="vit-grupo">
              <p className="vit-grupo__titulo">Contato</p>
              <Dado rotulo="Telefone" valor={mascaraTelefone(detalhe.telefone)} mono />
              <Dado rotulo="E-mail" valor={detalhe.email} />
              {/* Ligar e chamar no WhatsApp em vez de número para copiar à mão:
                  a portaria faz isso o dia inteiro. */}
              {detalhe.telefone && (
                <div className="vit-grupo__acoes">
                  <Button size="sm" iconLeft={<Phone size={14} />}
                          onClick={() => { window.location.href = `tel:${soDigitos(detalhe.telefone)}`; }}>
                    Ligar
                  </Button>
                  <Button size="sm" iconLeft={<MessageCircle size={14} />}
                          onClick={() => window.open(linkWhatsApp(detalhe.telefone), "_blank", "noopener")}>
                    WhatsApp
                  </Button>
                </div>
              )}
            </section>

            <section className="vit-grupo">
              <p className="vit-grupo__titulo">Documentos</p>
              <Dado rotulo="CPF" valor={mascaraCPF(detalhe.cpf)} mono />
              <Dado rotulo="RG" valor={detalhe.rg} mono />
            </section>

            <section className="vit-grupo">
              <p className="vit-grupo__titulo">Permanência</p>
              <Dado rotulo="Entrada" valor={dataBR(detalhe.data_entrada)} />
              <Dado rotulo="Saída" valor={detalhe.data_saida ? dataBR(detalhe.data_saida) : "em aberto"} />
            </section>

            <section className="vit-grupo">
              <p className="vit-grupo__titulo">Na unidade {rotuloUnidade(detalhe.id_unidade)}</p>
              <Dado
                rotulo="Veículos"
                valor={(() => {
                  const lista = veiculosDaUnidade(detalhe.id_unidade);
                  if (lista.length === 0) return "nenhum";
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <Car size={14} aria-hidden="true" />
                      {lista.join(", ")}
                    </span>
                  );
                })()}
              />
              <Dado
                rotulo="Outros moradores"
                valor={(() => {
                  const vizinhos = vizinhosDaUnidade(detalhe.id_unidade, detalhe.cpf);
                  if (vizinhos.length === 0) return "nenhum";
                  return vizinhos.map((v) => v.nome).join(", ");
                })()}
              />
            </section>
          </>
        )}
      </Gaveta>

      {/* ---- Exportação ---- */}
      <Modal
        open={modalExport}
        onClose={() => setModalExport(false)}
        title="Exportar moradores"
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
          {linhas.length === moradores.length
            ? `Serão exportados os ${linhas.length} moradores.`
            : `Serão exportados os ${linhas.length} moradores que passam nos filtros atuais, de ${moradores.length} no total.`}
        </p>
        <p className="vit-field__label" style={{ marginBottom: "var(--space-4)" }}>Colunas do PDF</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {colunasExport.map((c) => (
            <Checkbox key={c.id} label={c.label} checked={c.selected}
                      onChange={() => alternarColuna(c.id)} />
          ))}
        </div>
      </Modal>
    </div>
  );
}

/** Linha rotulo/valor da gaveta de detalhe. */
function Dado({ rotulo, valor, mono }) {
  const vazio = valor === null || valor === undefined || valor === "";
  return (
    <div className="vit-dado">
      <span className="vit-dado__rotulo">{rotulo}</span>
      <p className={
        "vit-dado__valor" +
        (mono ? " vit-dado__valor--mono" : "") +
        (vazio || valor === "em aberto" || valor === "nenhum" ? " vit-dado__valor--vazio" : "")
      }>
        {vazio ? "-" : valor}
      </p>
    </div>
  );
}
