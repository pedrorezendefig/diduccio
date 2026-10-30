import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, RotateCcw, MessageCircle, CheckCircle2, XCircle, RefreshCw,
  Phone, BadgeCheck, ChevronLeft, ChevronRight,
} from "lucide-react";
import { listar, criar, editar } from "../api/db";
import {
  Button, Badge, Table, Tabs, Modal, Field, Input, Select,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";

// `criar` e `editar` NÃO lançam quando o banco recusa: devolvem
// `{ success: false }`. Um try/catch sozinho deixaria a tela dizer "registrado"
// depois de uma gravação bloqueada pelo RLS — foi assim que o `remover` mentiu
// antes de ganhar contagem exata. Por isso as duas gravações abaixo checam o
// resultado e lançam com a mensagem já traduzida.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para esta alteração.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

// Status do fluxo de confirmação de número.
const STATUS = {
  PENDENTE: "Pendente",
  AGUARDANDO: "Aguardando",
  CONFIRMADO: "Confirmado",
  SEM_RESPOSTA: "Sem Resposta",
  ALTERAR: "Alterar",
};

const TOM_STATUS = {
  [STATUS.CONFIRMADO]: "positive",
  [STATUS.AGUARDANDO]: "brand",
  [STATUS.SEM_RESPOSTA]: "danger",
  [STATUS.ALTERAR]: "danger",
  [STATUS.PENDENTE]: "muted",
};

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

const mascaraTelefone = (v) => {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

/** Acrescenta o 55 quando o número vem só com DDD. */
const paraWhatsapp = (raw) => {
  const n = soDigitos(raw);
  if (!n) return "";
  return !n.startsWith("55") && (n.length === 10 || n.length === 11) ? `55${n}` : n;
};

export default function Confirmacao({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();

  const [moradores, setMoradores] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [confirmacoes, setConfirmacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState("Todos");
  const [fBloco, setFBloco] = useState("Todos");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);

  const [alvoAlterar, setAlvoAlterar] = useState(null);
  const [novoNumero, setNovoNumero] = useState("");
  const [erroNumero, setErroNumero] = useState("");

  const nomeUsuario = user?.nome || "Sistema";

  const buscarDados = useCallback(async () => {
    try {
      setCarregando(true);
      const [rm, ru, rc] = await Promise.all([
        listar("MORADORES"),
        listar("UNIDADES"),
        listar("CONFIRMACAO"),
      ]);
      setMoradores(Array.isArray(rm) ? rm : []);
      setUnidades(Array.isArray(ru) ? ru : []);
      setConfirmacoes(Array.isArray(rc) ? rc : []);
    } catch {
      toast.error("Não foi possível carregar as confirmações. Verifique a conexão.");
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
    const m = new Map();
    unidades.forEach((u) => m.set(String(u.id), u));
    return m;
  }, [unidades]);

  const rotuloCurto = useCallback(
    (id) => {
      const u = unidadePorId.get(String(id));
      return u ? `B${u.bloco}-${u.unidade}` : String(id || "");
    },
    [unidadePorId]
  );

  const rotuloLongo = useCallback(
    (id) => {
      const u = unidadePorId.get(String(id));
      return u ? `BLOCO ${u.bloco} - APARTAMENTO ${u.unidade}` : String(id || "");
    },
    [unidadePorId]
  );

  const confPorMorador = useMemo(() => {
    const m = new Map();
    confirmacoes.forEach((c) => m.set(String(c.id_morador), c));
    return m;
  }, [confirmacoes]);

  // Só titulares com telefone entram na fila: são eles que recebem a notificação.
  const todas = useMemo(
    () =>
      moradores
        .filter((m) => (m.tipo_morador || "Titular") === "Titular" && String(m.telefone || "").trim() !== "")
        .map((m) => {
          const conf = confPorMorador.get(String(m.id));
          return {
            morador: m,
            id_morador: m.id,
            id_unidade: m.id_unidade,
            nome: m.nome,
            telefone: m.telefone,
            conf,
            status: conf?.status || STATUS.PENDENTE,
          };
        }),
    [moradores, confPorMorador]
  );

  const contagem = useMemo(() => {
    const c = {
      [STATUS.PENDENTE]: 0, [STATUS.AGUARDANDO]: 0, [STATUS.CONFIRMADO]: 0,
      [STATUS.SEM_RESPOSTA]: 0, [STATUS.ALTERAR]: 0,
    };
    todas.forEach((l) => { c[l.status] = (c[l.status] || 0) + 1; });
    return c;
  }, [todas]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNum = soDigitos(termo);
    return todas
      .filter((l) => {
        const casaBusca =
          termo === "" ||
          String(l.nome || "").toLowerCase().includes(termo) ||
          rotuloCurto(l.id_unidade).toLowerCase().includes(termo) ||
          (termoNum !== "" && soDigitos(l.telefone).includes(termoNum));
        const casaStatus = fStatus === "Todos" || l.status === fStatus;
        const u = unidadePorId.get(String(l.id_unidade));
        const casaBloco = fBloco === "Todos" || String(u?.bloco) === fBloco;
        return casaBusca && casaStatus && casaBloco;
      })
      .sort((a, b) =>
        rotuloCurto(a.id_unidade).localeCompare(rotuloCurto(b.id_unidade), "pt-BR", { numeric: true })
      );
  }, [todas, busca, fStatus, fBloco, unidadePorId, rotuloCurto]);

  const totalPaginas = porPagina === "Todos" ? 1 : Math.max(1, Math.ceil(linhas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const exibidas = porPagina === "Todos"
    ? linhas
    : linhas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => { setPagina(1); }, [busca, fStatus, fBloco, porPagina]);

  const blocos = useMemo(
    () => ["Todos", ...new Set(unidades.map((u) => String(u.bloco)).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true })),
    [unidades]
  );

  const temFiltro = busca || fStatus !== "Todos" || fBloco !== "Todos";
  const limpar = () => { setBusca(""); setFStatus("Todos"); setFBloco("Todos"); };

  /* ---------------- WhatsApp ---------------- */

  const mensagem = useCallback(
    (idUnidade) =>
      `Olá! Aqui é do Condomínio Diduccio.\n` +
      `Estamos confirmando este número para o envio de *notificações de encomendas* da unidade *${rotuloLongo(idUnidade)}*.\n\n` +
      `Responda *SIM* para confirmar este número.\n` +
      `Se preferir receber em outro número, responda com o número desejado.\n\n` +
      `Só consideraremos confirmado caso haja resposta.\n` +
      `Caso esta mensagem tenha chegado a você por engano, pedimos desculpas e gentilmente peça que a desconsidere.\n\n` +
      `Obrigado!`,
    [rotuloLongo]
  );

  const abrirWhatsapp = useCallback(
    (telefone, idUnidade) => {
      const num = paraWhatsapp(telefone);
      if (!num) {
        toast.error("O telefone cadastrado não é um número válido.");
        return false;
      }
      window.open(
        `https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(mensagem(idUnidade))}`,
        "_blank",
        "noopener"
      );
      return true;
    },
    [mensagem, toast]
  );

  /* ---------------- gravação ---------------- */

  const gravarConfirmacao = async (linha, campos) => {
    const conf = linha.conf;
    const editando = Boolean(conf?.id);

    const dados = {
      id_morador: Number(linha.id_morador),
      id_unidade: Number(linha.id_unidade),
      nome: linha.nome,
      telefone: campos.telefone != null ? campos.telefone : linha.telefone,
      status: campos.status,
      // A coluna é text, e "" grava string vazia onde o certo é "não houve
      // pedido de troca de número".
      numero_solicitado: campos.numero_solicitado || null,
      // `data_envio` é timestamptz: aceita o ISO com fuso que o toISOString()
      // produz, e null quando ainda não houve envio. O "" de antes era o que a
      // planilha aceitava; aqui o Postgres recusaria.
      data_envio: campos.data_envio ?? conf?.data_envio ?? null,
      updated_by: nomeUsuario,
    };

    const r = editando
      ? await editar("CONFIRMACAO", conf.id, dados)
      : await criar("CONFIRMACAO", dados);
    if (!r.success) throw new Error(mensagemErro(r.message));
  };

  const gravarTelefoneMorador = async (morador, telefone) => {
    // Só o telefone. Reenviar o morador inteiro (o `...morador` de antes)
    // devolveria ao banco os campos como a tela os tem — inclusive `created_at`
    // e `updated_at` — e sobrescreveria dado que ninguém pediu para mudar.
    const r = await editar("MORADORES", morador.id, { telefone });
    if (!r.success) throw new Error(mensagemErro(r.message));
  };

  const enviar = async (linha) => {
    if (!abrirWhatsapp(linha.telefone, linha.id_unidade)) return;
    setSalvando(true);
    try {
      await gravarConfirmacao(linha, {
        status: STATUS.AGUARDANDO,
        data_envio: new Date().toISOString(),
      });
      await buscarDados();
      toast.success(`Envio registrado para ${linha.nome}`);
    } catch (e) {
      // O WhatsApp já abriu neste ponto, então o aviso precisa deixar claro que
      // a mensagem foi enviada e só o registro falhou.
      toast.error(`A mensagem abriu, mas não foi possível registrar o envio. ${e?.message ?? ""}`.trim());
    } finally {
      setSalvando(false);
    }
  };

  const marcarStatus = async (linha, status) => {
    setSalvando(true);
    try {
      await gravarConfirmacao(linha, { status });
      await buscarDados();
      toast.success(`${linha.nome}: ${status}`);
    } catch (e) {
      toast.error(e?.message || "Não foi possível atualizar o status.");
    } finally {
      setSalvando(false);
    }
  };

  const reenviar = async (linha) => {
    const ok = await confirmar({
      title: `Reenviar a mensagem para ${linha.nome}?`,
      description: 'O status volta para "Aguardando" e a data de envio é atualizada.',
      confirmLabel: "Reenviar",
    });
    if (!ok) return;
    await enviar(linha);
  };

  const abrirAlterar = (linha) => {
    setAlvoAlterar(linha);
    setNovoNumero("");
    setErroNumero("");
  };

  const salvarNovoNumero = async () => {
    const num = soDigitos(novoNumero);
    if (num.length < 10) {
      setErroNumero("Informe um número válido com DDD.");
      return;
    }
    setErroNumero("");
    const linha = alvoAlterar;
    setAlvoAlterar(null);
    setSalvando(true);
    try {
      // Altera na aba MORADORES e registra na CONFIRMACAO, nessa ordem.
      await gravarTelefoneMorador(linha.morador, num);
      await gravarConfirmacao(
        { ...linha, telefone: num },
        {
          status: STATUS.AGUARDANDO,
          telefone: num,
          numero_solicitado: num,
          data_envio: new Date().toISOString(),
        }
      );
      abrirWhatsapp(num, linha.id_unidade);
      await buscarDados();
      toast.success(`Número de ${linha.nome} atualizado`);
    } catch (e) {
      // `moradores` é cadastro: pelas políticas, só o síndico escreve. Um
      // porteiro que chegue aqui precisa saber que foi permissão, não conexão.
      toast.error(e?.message || "Não foi possível alterar o número.");
    } finally {
      setSalvando(false);
    }
  };

  /* ---------------- tabela ---------------- */

  const colunas = [
    { key: "id_unidade", label: "Unidade", tipo: "id", width: 104,
      render: (l) => rotuloCurto(l.id_unidade) },
    { key: "nome", label: "Titular",
      render: (l) => <span style={{ fontWeight: 600 }}>{l.nome}</span> },
    { key: "telefone", label: "Telefone",
      render: (l) => (
        <span style={{ fontFamily: "var(--font-mono)" }}>{mascaraTelefone(l.telefone)}</span>
      ) },
    { key: "status", label: "Status",
      render: (l) => <Badge tone={TOM_STATUS[l.status] ?? "neutral"}>{l.status}</Badge> },
  ];

  const meta = carregando
    ? "Carregando confirmações"
    : [
        `${todas.length} titulares com telefone`,
        `${contagem[STATUS.CONFIRMADO]} confirmados`,
        contagem[STATUS.PENDENTE] ? `${contagem[STATUS.PENDENTE]} sem envio` : null,
        contagem[STATUS.AGUARDANDO] ? `${contagem[STATUS.AGUARDANDO]} aguardando resposta` : null,
      ].filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader title="Confirmação de números" meta={meta} />

      {/* Abas de status: no fluxo de portaria a pergunta mais frequente é
          "o que ainda falta fazer", e o filtro por status responde isso. */}
      <Tabs
        items={[
          { value: "Todos", label: "Todos", count: todas.length },
          { value: STATUS.PENDENTE, label: "Sem envio", count: contagem[STATUS.PENDENTE] },
          { value: STATUS.AGUARDANDO, label: "Aguardando", count: contagem[STATUS.AGUARDANDO] },
          { value: STATUS.CONFIRMADO, label: "Confirmados", count: contagem[STATUS.CONFIRMADO] },
          { value: STATUS.SEM_RESPOSTA, label: "Sem resposta", count: contagem[STATUS.SEM_RESPOSTA] },
        ]}
        value={fStatus}
        onChange={setFStatus}
      />

      <div className="cad-filtros">
        <div className="cad-filtros__busca">
          <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, unidade ou telefone"
            aria-label="Buscar por nome, unidade ou telefone"
          />
        </div>
        <Select value={fBloco} onChange={(e) => setFBloco(e.target.value)} aria-label="Filtrar por bloco">
          {blocos.map((b) => (
            <option key={b} value={b}>{b === "Todos" ? "Todos os blocos" : `Bloco ${b}`}</option>
          ))}
        </Select>
        {temFiltro && (
          <Button variant="ghost" onClick={limpar} iconLeft={<RotateCcw size={14} />}>
            Limpar
          </Button>
        )}
      </div>

      <Table
        columns={colunas}
        rows={exibidas}
        loading={carregando}
        getRowKey={(l) => l.id_morador}
        rowActions={(l) => (
          <>
            {l.status === STATUS.PENDENTE ? (
              <Button size="sm" variant="ghost" aria-label={`Enviar mensagem para ${l.nome}`}
                      disabled={salvando} onClick={() => enviar(l)}
                      iconLeft={<MessageCircle size={14} />} />
            ) : (
              <Button size="sm" variant="ghost" aria-label={`Reenviar mensagem para ${l.nome}`}
                      disabled={salvando} onClick={() => reenviar(l)}
                      iconLeft={<RefreshCw size={14} />} />
            )}
            <Button size="sm" variant="ghost" aria-label={`Marcar ${l.nome} como confirmado`}
                    disabled={salvando} onClick={() => marcarStatus(l, STATUS.CONFIRMADO)}
                    iconLeft={<CheckCircle2 size={14} />} />
            <Button size="sm" variant="ghost" aria-label={`Marcar ${l.nome} como sem resposta`}
                    disabled={salvando} onClick={() => marcarStatus(l, STATUS.SEM_RESPOSTA)}
                    iconLeft={<XCircle size={14} />} />
            <Button size="sm" variant="ghost" aria-label={`Alterar número de ${l.nome}`}
                    disabled={salvando} onClick={() => abrirAlterar(l)}
                    iconLeft={<Phone size={14} />} />
          </>
        )}
        empty={
          temFiltro ? (
            <EmptyState
              icon={<Search size={20} />}
              title="Nenhum titular com esses filtros"
              description="Ajuste a busca ou limpe os filtros."
              action={<Button onClick={limpar}>Limpar filtros</Button>}
            />
          ) : (
            <EmptyState
              icon={<BadgeCheck size={20} />}
              title="Nenhum titular com telefone cadastrado"
              description="A fila é montada com os moradores titulares que têm telefone. Cadastre o telefone em Moradores para eles aparecerem aqui."
            />
          )
        }
      />

      {!carregando && linhas.length > 0 && (
        <div className="cad-paginacao">
          <span className="cad-paginacao__info">
            {porPagina === "Todos"
              ? `${linhas.length} titular(es)`
              : `${(paginaSegura - 1) * porPagina + 1} a ${Math.min(paginaSegura * porPagina, linhas.length)} de ${linhas.length}`}
          </span>
          <div className="cad-paginacao__controles">
            <Select
              value={porPagina}
              onChange={(e) => setPorPagina(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}
              aria-label="Titulares por página"
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

      {/* ---- Alterar número ---- */}
      <Modal
        open={Boolean(alvoAlterar)}
        onClose={() => setAlvoAlterar(null)}
        title="Alterar número"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAlvoAlterar(null)}>Cancelar</Button>
            <Button variant="primary" onClick={salvarNovoNumero} loading={salvando}>
              Salvar e enviar
            </Button>
          </>
        }
      >
        <p className="vit-modal__desc" style={{ marginBottom: "var(--space-6)" }}>
          O número de <strong>{alvoAlterar?.nome}</strong> ({rotuloCurto(alvoAlterar?.id_unidade)}) será
          alterado também no cadastro de moradores, e a mensagem de confirmação
          será aberta no WhatsApp.
        </p>
        <Field
          label="Novo número com DDD"
          required
          error={erroNumero}
          help={`Atual: ${mascaraTelefone(alvoAlterar?.telefone) || "não informado"}`}
        >
          <Input
            value={novoNumero}
            inputMode="tel"
            autoFocus
            placeholder="(00) 00000-0000"
            onChange={(e) => setNovoNumero(mascaraTelefone(e.target.value))}
          />
        </Field>
      </Modal>
    </div>
  );
}
