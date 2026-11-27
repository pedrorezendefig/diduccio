import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, Plus, Pencil, Trash2, Eye, FileText, Download, Users, Phone, MessageCircle,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { sanitizarCelula } from "../lib/drive";
import { dataBR, maskCPFPrivacy, maskPhone, maskRGPrivacy, nomeProprio } from "../lib/format";
import { listar, criar, editar, remover } from "../api/db";
import {
  Button, Badge, Modal, Field, Input, Checkbox,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import BuscaUnidade from "../components/BuscaUnidade";
import { Ficha, Filtros, Iniciais, MaisFiltros, Opcoes, PainelDeFiltros } from "../components/app/pecas";

/** Quantas linhas a lista mostra de cada vez; "Mostrar mais" soma outras tantas. */
const LOTE = 30;

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
  const [ordem, setOrdem] = useState({ chave: "nome", direcao: "asc" });
  const [limite, setLimite] = useState(LOTE);
  const [maisFiltros, setMaisFiltros] = useState(false);

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

  // Busca e painel, sem a situação: as pílulas contam em cima disto, e cada
  // número diz quantos aparecem ao clicar nela.
  const semFiltroDeSituacao = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNum = soDigitos(termo);

    return moradores.filter((m) => {
      const casaNome = String(m.nome || "").toLowerCase().includes(termo);
      const casaCPF = termoNum !== "" && soDigitos(m.cpf).includes(termoNum);
      const casaUnidade = rotuloUnidade(m.id_unidade).toLowerCase().includes(termo) ||
        (termoNum !== "" && String(m.id_unidade ?? "").includes(termoNum));
      const casaBusca = termo === "" || casaNome || casaCPF || casaUnidade;

      const casaVinculo = fVinculo === "Todos" || m.tipo_vinculo === fVinculo;
      const casaTipo = fTipo === "Todos" || (m.tipo_morador || "Titular") === fTipo;

      const u = unidadePorId.get(String(m.id_unidade));
      const casaBloco = fBloco === "Todos" || String(u?.bloco) === fBloco;

      return casaBusca && casaVinculo && casaTipo && casaBloco;
    });
  }, [moradores, busca, fVinculo, fTipo, fBloco, unidadePorId, rotuloUnidade]);

  const contagemStatus = useMemo(() => ({
    Todos: semFiltroDeSituacao.length,
    Ativo: semFiltroDeSituacao.filter((m) => m.status === "Ativo").length,
    Inativo: semFiltroDeSituacao.filter((m) => m.status !== "Ativo").length,
  }), [semFiltroDeSituacao]);

  /** Posição da unidade na ordem do prédio: bloco, depois apartamento. */
  const ordemDaUnidade = useCallback((id) => {
    const u = unidadePorId.get(String(id));
    if (!u) return String(id ?? "");
    return `${String(u.bloco).padStart(4, "0")}-${String(u.unidade).padStart(6, "0")}`;
  }, [unidadePorId]);

  const linhas = useMemo(() => {
    const filtrados = semFiltroDeSituacao.filter((m) =>
      fStatus === "Todos" || (fStatus === "Ativo" ? m.status === "Ativo" : m.status !== "Ativo"));
    const valor = (m) => ordem.chave === "id_unidade" ? ordemDaUnidade(m.id_unidade) : String(m[ordem.chave] ?? "");
    return filtrados.sort((a, b) => {
      const cmp = valor(a).localeCompare(valor(b), "pt-BR", { numeric: true, sensitivity: "base" });
      return ordem.direcao === "asc" ? cmp : -cmp;
    });
  }, [semFiltroDeSituacao, fStatus, ordem, ordemDaUnidade]);

  const ordenar = (chave) =>
    setOrdem((o) => ({ chave, direcao: o.chave === chave && o.direcao === "asc" ? "desc" : "asc" }));

  const filtrosDoPainel = [fBloco, fVinculo, fTipo].filter((f) => f !== "Todos").length;
  const temFiltro = busca || fStatus !== "Todos" || filtrosDoPainel > 0;

  const limparPainel = () => {
    setFVinculo("Todos"); setFBloco("Todos"); setFTipo("Todos"); setLimite(LOTE);
  };
  const limparFiltros = () => { setBusca(""); setFStatus("Todos"); limparPainel(); };

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
      nome: nomeProprio(form.nome.trim()),
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
      setModalAberto(false);
      toast.success(`${nomeProprio(m.nome)} foi removido`);
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

  /* ---------------- lista ---------------- */

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
  const m = detalhe;
  const veiculosDoDetalhe = m ? veiculosDaUnidade(m.id_unidade) : [];
  const vizinhosDoDetalhe = m ? vizinhosDaUnidade(m.id_unidade, m.cpf) : [];

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

      <Filtros
        busca={busca}
        onBusca={(x) => { setBusca(x); setLimite(LOTE); }}
        placeholder="Nome, CPF ou unidade"
        filtro={fStatus}
        onFiltro={(x) => { setFStatus(x); setLimite(LOTE); }}
        filtros={[
          ["Todos", "Todos", contagemStatus.Todos],
          ["Ativo", "Ativos", contagemStatus.Ativo],
          ["Inativo", "Inativos", contagemStatus.Inativo],
        ]}
        painel={
          <PainelDeFiltros aberto={maisFiltros}>
            <Field label="Bloco">
              <Opcoes rotulo="Bloco" valor={fBloco} onMudar={(x) => { setFBloco(x); setLimite(LOTE); }}
                opcoes={blocos.map((b) => [b, b === "Todos" ? "Todos" : `Bloco ${b}`])} />
            </Field>
            <Field label="Vínculo">
              <Opcoes rotulo="Vínculo" valor={fVinculo} onMudar={(x) => { setFVinculo(x); setLimite(LOTE); }}
                opcoes={["Todos", ...VINCULOS]} />
            </Field>
            <Field label="Tipo de morador">
              <Opcoes rotulo="Tipo de morador" valor={fTipo} onMudar={(x) => { setFTipo(x); setLimite(LOTE); }}
                opcoes={["Todos", ...TIPOS_MORADOR]} />
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
      ) : (
        <ListaQueAbre
          colunas={[
            { rotulo: "Unidade", largura: "100px", ordem: "id_unidade" },
            { rotulo: "Nome", largura: "minmax(0, 1.8fr)", ordem: "nome" },
            { rotulo: "Vínculo", largura: "minmax(0, 1fr)", ordem: "tipo_vinculo" },
            { rotulo: "Telefone", largura: "150px" },
            { rotulo: "Situação", largura: "100px", ordem: "status" },
          ]}
          ordenacao={ordem}
          onOrdenar={ordenar}
          larguraAcoes="96px"
          itens={linhas.slice(0, limite)}
          carregando={carregando}
          chave={(x) => x.id}
          onAbrir={setDetalhe}
          rotuloDaLinha={(x) => `Abrir o cadastro de ${nomeProprio(x.nome)} (${rotuloUnidade(x.id_unidade)})`}
          celulas={(x) => [
            <b key="u" className="conf-dado__mono">{rotuloUnidade(x.id_unidade)}</b>,
            <span key="n" className="pis-quem">
              <Iniciais nome={x.nome} apagado={x.status !== "Ativo"} />
              <span className="mud-quem">
                <b>{nomeProprio(x.nome)}</b>
                {x.cpf ? <small>{maskCPFPrivacy(x.cpf)}</small> : null}
              </span>
            </span>,
            <span key="v" className="mud-quem">
              <b>{x.tipo_vinculo || "—"}</b>
              <small>{x.tipo_morador || "Titular"}</small>
            </span>,
            <span key="t">{x.telefone ? maskPhone(String(x.telefone)) : "—"}</span>,
            <Badge key="s" tone={x.status === "Ativo" ? "positive" : "muted"}>{x.status}</Badge>,
          ]}
          acoes={(x) => (
            <>
              <Button size="sm" variant="ghost" aria-label={`Ver o cadastro de ${nomeProprio(x.nome)}`}
                      onClick={() => setDetalhe(x)}><Eye size={16} /></Button>
              <Button size="sm" variant="ghost" aria-label={`Editar o cadastro de ${nomeProprio(x.nome)}`}
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
        open={Boolean(m)}
        onClose={() => setDetalhe(null)}
        title="Cadastro do morador"
        size="lg"
        footer={m && (
          <div className="app-modal__acoes">
            <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluir(m)}>Excluir</Button>
            <Button variant="primary" iconLeft={<Pencil size={15} />}
                    onClick={() => { setDetalhe(null); abrirEdicao(m); }}>
              Editar
            </Button>
          </div>
        )}
      >
        {m && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <Iniciais nome={m.nome} grande apagado={m.status !== "Ativo"} />
              <div className="app-modal__quem">
                <strong>{nomeProprio(m.nome)}</strong>
                <small>
                  {rotuloUnidade(m.id_unidade)} · {m.tipo_vinculo || "Sem vínculo"} · {m.tipo_morador || "Titular"}
                  {m.created_at ? ` · cadastrado em ${dataBR(m.created_at)}` : ""}
                </small>
                <span className="app-modal__selos">
                  <Badge tone={m.status === "Ativo" ? "positive" : "muted"}>{m.status}</Badge>
                </span>
              </div>
            </div>

            <div className="app-detalhe">
              {/* O contato à esquerda, grande: ligar e chamar no WhatsApp é o
                  que a portaria faz com este cadastro o dia inteiro. */}
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Contato</p>
                <div className="app-cartao">
                  <p className="app-cartao__rotulo">Telefone</p>
                  <p className="app-cartao__grande">{m.telefone ? maskPhone(String(m.telefone)) : "—"}</p>
                  <p className="app-cartao__sub">{m.email || "Sem e-mail"}</p>
                  {m.telefone && (
                    <div className="app-cartao__acoes">
                      <Button iconLeft={<Phone size={15} />}
                              onClick={() => { window.location.href = `tel:${soDigitos(m.telefone)}`; }}>
                        Ligar
                      </Button>
                      <Button iconLeft={<MessageCircle size={15} />}
                              onClick={() => window.open(linkWhatsApp(m.telefone), "_blank", "noopener")}>
                        WhatsApp
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Documentos" itens={[
                  ["CPF", m.cpf ? maskCPFPrivacy(m.cpf) : "Não informado", true],
                  ["RG", m.rg ? maskRGPrivacy(m.rg) : "Não informado", true],
                ]} />
                <Ficha titulo="Permanência" itens={[
                  ["Entrada", dataBR(m.data_entrada) || "Não informada"],
                  ["Saída", m.data_saida ? dataBR(m.data_saida) : "Em aberto"],
                ]} />
                <Ficha titulo={`Na unidade ${rotuloUnidade(m.id_unidade)}`} itens={[
                  ["Veículos", veiculosDoDetalhe.length ? veiculosDoDetalhe.join(", ") : "Nenhum"],
                  ["Outros moradores", vizinhosDoDetalhe.length
                    ? vizinhosDoDetalhe.map((x) => nomeProprio(x.nome)).join(", ")
                    : "Nenhum"],
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
        title={modo === "add" ? "Novo morador" : "Editar morador"}
        size="md"
        footer={
          <div className="app-modal__acoes">
            {modo === "edit"
              ? <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluir(form)}>Excluir</Button>
              : <span />}
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-morador" loading={salvando}>
              {modo === "add" ? "Cadastrar" : "Salvar"}
            </Button>
          </div>
        }
      >
        <form id="form-morador" className="mud-form" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <Field label="Nome completo" required error={erroForm.nome}>
            <Input value={form.nome}
                   onChange={(e) => setForm({ ...form, nome: e.target.value })}
                   onBlur={(e) => setForm({ ...form, nome: nomeProprio(e.target.value) })} />
          </Field>

          <Field label="Unidade" required error={erroForm.id_unidade}>
            <BuscaUnidade
              unidades={unidadesOrdenadas}
              valor={unidadePorId.get(String(form.id_unidade)) ?? null}
              onEscolher={(u) => setForm({ ...form, id_unidade: u?.id ?? "" })}
            />
          </Field>

          <div className="mud-form__par">
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
          </div>

          <Field label="Vínculo">
            <Opcoes rotulo="Vínculo" valor={form.tipo_vinculo}
                    onMudar={(x) => setForm({ ...form, tipo_vinculo: x })} opcoes={VINCULOS} />
          </Field>

          <Field label="Tipo de morador">
            <Opcoes rotulo="Tipo de morador" valor={form.tipo_morador}
                    onMudar={(x) => setForm({ ...form, tipo_morador: x })} opcoes={TIPOS_MORADOR} />
          </Field>

          <div className="mud-form__par">
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
          </div>

          <div className="mud-form__par">
            <Field label="Data de entrada">
              {/* <input type="date"> fala "AAAA-MM-DD", que é exatamente o que a
                  coluna `date` devolve e aceita. Nada a converter dos dois lados. */}
              <Input type="date" value={form.data_entrada ?? ""}
                     onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} />
            </Field>
            <Field label="Data de saída" help="Só quando o morador deixar a unidade">
              <Input type="date" value={form.data_saida ?? ""}
                     onChange={(e) => setForm({ ...form, data_saida: e.target.value })} />
            </Field>
          </div>

          <Field label="Situação">
            <Opcoes rotulo="Situação" valor={form.status}
                    onMudar={(x) => setForm({ ...form, status: x })} opcoes={["Ativo", "Inativo"]} />
          </Field>
        </form>
      </Modal>

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
        <p className="vit-modal__desc app-export__texto">
          {linhas.length === moradores.length
            ? `Serão exportados os ${linhas.length} moradores.`
            : `Serão exportados os ${linhas.length} moradores que passam nos filtros atuais, de ${moradores.length} no total.`}
        </p>
        <p className="vit-field__label app-export__titulo">Colunas do PDF</p>
        <div className="app-export__colunas">
          {colunasExport.map((c) => (
            <Checkbox key={c.id} label={c.label} checked={c.selected}
                      onChange={() => alternarColuna(c.id)} />
          ))}
        </div>
      </Modal>
    </div>
  );
}
