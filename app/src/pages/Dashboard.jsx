import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck, CalendarDays, BarChart3, PieChart, Building2,
  Wallet, Inbox, Package, Car, TrendingUp, TrendingDown,
} from "lucide-react";
import { useTheme } from "../theme/useTheme";
import { MARCA, CLARO, ESCURO } from "../theme/tokens";
import { can } from "../auth/permissions";
import { normalizarTexto, dataBR } from "../lib/format";
import { Button, Badge, PageHeader, Skeleton, EmptyState, useToast } from "../ui";
import { listar } from "../api/db";
import { chamarEdgeFunction, mensagemDaEdgeFunction } from "../api/edge";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// O que aparece no lugar do número quando o cargo não lê a origem. Zero seria
// mentira: "0 reservas ativas" afirma que não há reserva nenhuma.
const SEM_ACESSO = "—";
const ROLES_ANALISE = ["Sindico", "Auxiliar Administrativo", "Desenvolvedor"];

/**
 * Paleta dos gráficos.
 *
 * Rampa monocromática de verde, não cores avulsas: continua sendo UM acento
 * na página inteira e as séries seguem distinguíveis. Terracota fica só para
 * estado negativo real (cancelado).
 *
 * Hex literal, nunca var(): estas cores entram em ATRIBUTO de SVG (fill,
 * stroke), e atributo de apresentação não resolve variável CSS.
 */
const SERIE = {
  festas:        MARCA["brand-500"],
  churrasqueira: MARCA["brand-300"],
  mudancas:      MARCA["brand-700"],
  negativo:      MARCA["alert-600"],
  pendente:      MARCA["brand-400"],
  anterior:      MARCA["brand-700"],
};

// ===== Normalizadores (Sheets devolve datas/valores em formatos variados) =====
function normalizarDataAg(valor) {
  if (!valor) return "";
  const datePart = valor.toString().trim().split(" ")[0].split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  if (datePart.includes("/")) {
    const [d, m, y] = datePart.split("/");
    if (d && m && y) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return datePart;
}

function normalizarHoraAg(valor) {
  if (!valor) return "";
  const match = valor.toString().match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return valor.toString().trim();
}

// Extrai {y, m} de "DD/MM/YYYY ...", "YYYY-MM-DD" ou ISO. null se inválida.
function parseAnoMes(d) {
  if (!d) return null;
  const s = d.toString().trim();
  if (s.includes("/")) {
    const partes = s.split("/");
    const mm = partes[1], rest = partes[2];
    const y = parseInt((rest || "").split(" ")[0], 10);
    const m = parseInt(mm, 10);
    return y && m ? { y, m } : null;
  }
  const iso = s.split("T")[0].split(" ")[0];
  const p = iso.split("-");
  if (p.length >= 2) {
    const y = parseInt(p[0], 10);
    const m = parseInt(p[1], 10);
    if (y && m) return { y, m };
  }
  return null;
}

/** Data do Sheets para Date, tolerante aos dois formatos. null se inválida. */
function parseData(d) {
  if (!d) return null;
  const s = d.toString().trim();
  let obj;
  if (s.includes("/")) {
    const [dia, mes, resto] = s.split("/");
    obj = new Date(parseInt(resto, 10), parseInt(mes, 10) - 1, parseInt(dia, 10), 12);
  } else {
    const [ano, mes, dia] = s.split("T")[0].split(" ")[0].split("-");
    obj = new Date(parseInt(ano, 10), parseInt(mes, 10) - 1, parseInt(dia, 10), 12);
  }
  return isNaN(obj.getTime()) ? null : obj;
}

const diasDesde = (d) => {
  const data = parseData(d);
  if (!data) return null;
  return Math.floor((Date.now() - data.getTime()) / 86400000);
};

// "R$ 1.250,00" | "1250,5" | 1250 -> número.
function parseValor(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = v.toString().replace(/[^\d,.-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Lê uma célula aceitando a chave em maiúscula ou minúscula. */
const celula = (obj, chave) =>
  obj?.[chave.toUpperCase()] ?? obj?.[chave.toLowerCase()] ?? "";

const fmtBRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRLfull = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pago = (v) => String(v || "").trim().toLowerCase().startsWith("s"); // "Sim"

/** Neutros do tema ativo, para eixo e linha-guia dos SVGs. */
const neutrosDoTema = (isDark) => (isDark ? ESCURO : CLARO);

function somarPorMes(lista, ano, campoData) {
  const m = Array(12).fill(0);
  lista.forEach((r) => {
    const am = parseAnoMes(r[campoData]);
    if (am && am.y === ano && pago(r.pago)) m[am.m - 1] += parseValor(r.valor_taxa);
  });
  return m;
}

function contarPorMes(lista, ano, campoData) {
  const m = Array(12).fill(0);
  lista.forEach((r) => {
    const am = parseAnoMes(r[campoData]);
    if (am && am.y === ano) m[am.m - 1]++;
  });
  return m;
}

const soma = (arr) => arr.reduce((a, b) => a + b, 0);

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const toast = useToast();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [loading, setLoading] = useState(true);

  const [unidades, setUnidades] = useState([]);
  const [festas, setFestas] = useState([]);
  const [churras, setChurras] = useState([]);
  const [mudancas, setMudancas] = useState([]);
  const [entregas, setEntregas] = useState([]);
  const [vagas, setVagas] = useState([]);
  const [logs, setLogs] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [reservasAtivas, setReservasAtivas] = useState(0);
  const [reunioesProximas, setReunioesProximas] = useState([]);

  const isAnalise = ROLES_ANALISE.includes(user?.cargo);
  const isConselheiro = user?.cargo === "Conselheiro";
  const isPorteiro = user?.cargo === "Porteiro";

  // Espelha as políticas do 0015. Deduzir a permissão do resultado vazio seria
  // pior: o RLS não devolve erro quando nega leitura, devolve zero linhas — e
  // o card mostraria "0 reservas ativas", que parece informação. "-" diz a
  // verdade: este cargo não enxerga esse número.
  const acesso = {
    // festas, churrasqueira, mudancas, vagas, log, agendamentos
    gestao: isAnalise,
    // unidades e entregas: o que o porteiro precisa para atender na portaria
    portaria: isAnalise || isPorteiro,
    // o conselheiro chega aqui pela Edge Function `receita`, que devolve só
    // valor, data e status — sem o cpf e o rg que as tabelas de origem carregam
    receita: isAnalise || isConselheiro,
  };

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const handleVerDetalhes = (item) => {
    const tipo = String(item.tipo).toLowerCase();
    let acaoNecessaria = "";
    if (tipo.includes("festa")) acaoNecessaria = "verDetalhesFesta";
    else if (tipo.includes("churrasqueira")) acaoNecessaria = "verDetalhesChurrasqueira";
    else if (tipo.includes("mudança")) acaoNecessaria = "verDetalhesMudanca";

    if (!can(user, acaoNecessaria)) {
      toast.error("Seu cargo não tem permissão para ver os detalhes desta reserva.");
      return;
    }

    let rota = "";
    if (tipo.includes("festa")) rota = "/festas";
    else if (tipo.includes("churrasqueira")) rota = "/churrasqueira";
    else if (tipo.includes("mudança")) rota = "/mudancas";
    if (rota) navigate(rota, { state: { openId: item.id } });
  };

  // Guarda o timer que solta a tela do estado de carregamento. Sem cancelar no
  // desmonte, ele dispara depois de a tela sair e chama `setLoading` num
  // componente que não existe mais: em produção o React engole calado, nos
  // testes o jsdom já foi derrubado e o erro aparece como "window is not
  // defined" numa pilha que nem menciona o Dashboard. Mesmo defeito que
  // deixava a suíte instável em festas, churrasqueira e mudanças.
  const timerCarregando = useRef(null);
  useEffect(() => () => clearTimeout(timerCarregando.current), []);

  useEffect(() => {
    // Uma resposta que chega depois de a tela sair não tem onde ser mostrada.
    // Sem esta trava, cada abertura rápida do painel deixa uma gravação de
    // estado órfã para trás.
    let saiuDaTela = false;
    async function fetchData() {
      try {
        setLoading(true);
        // Só o que o cargo pode ler. Pedir o resto não daria erro — voltaria
        // vazio pelo RLS — mas seriam requisições inúteis a cada abertura do
        // painel, e o vazio se confundiria com "não há nada".
        const buscar = (tabela, permitido) =>
          permitido ? listar(tabela).catch(() => []) : Promise.resolve([]);

        // A receita do conselheiro não sai de tabela nenhuma: sai da Edge
        // Function `receita`, que lê festas e churrasqueira no servidor e
        // devolve só data, valor, pago e status. Antes isto era a view
        // `receitas_reservas`, que ignorava o RLS dessas duas tabelas para
        // conseguir o mesmo — ver 0025.
        //
        // Aqui a falha é AVISADA, ao contrário do `.catch(() => [])` das
        // tabelas. Motivo: uma leitura negada pelo RLS volta vazia e é assim
        // que deve ser; uma Edge Function que não responde é defeito, e um
        // gráfico zerado por defeito parece um ano sem receita nenhuma.
        const buscarReceita = async () => {
          if (!isConselheiro) return [];
          const r = await chamarEdgeFunction("receita", {});
          if (r.ok) return Array.isArray(r.corpo?.dados) ? r.corpo.dados : [];
          if (!saiuDaTela) {
            toast.error(mensagemDaEdgeFunction(r, "Não consegui carregar a receita."));
          }
          return [];
        };

        const [
          dataUnits, dataLogs, dataFestas, dataChurras,
          dataMudancas, dataEntregas, dataVagas, dataReceitas,
        ] = await Promise.all([
          buscar("UNIDADES", acesso.portaria),
          buscar("log", acesso.gestao),
          buscar("FESTAS", acesso.gestao),
          buscar("CHURRASQUEIRA", acesso.gestao),
          buscar("MUDANCAS", acesso.gestao),
          buscar("ENTREGAS", acesso.portaria),
          buscar("VAGAS", acesso.gestao),
          buscarReceita(),
        ]);

        const lista = (d) => (Array.isArray(d) ? d : []);
        setUnidades(lista(dataUnits));
        setMudancas(lista(dataMudancas));
        setEntregas(lista(dataEntregas));
        setVagas(lista(dataVagas));

        // Para o conselheiro, o gráfico é alimentado pela Edge Function. As
        // linhas têm as mesmas colunas que os outros cargos leem das tabelas
        // (`data_reserva`, `valor_taxa`, `pago`, `status`), então daqui para
        // baixo o painel funciona sem saber a diferença.
        const receitas = lista(dataReceitas);
        setFestas(isConselheiro ? receitas.filter((r) => r.origem === "festas") : lista(dataFestas));
        setChurras(isConselheiro ? receitas.filter((r) => r.origem === "churrasqueira") : lista(dataChurras));

        const todasReservas = [
          ...lista(dataFestas).map((f) => ({ ...f, tipo: "Salão de Festas", data: f.data_reserva })),
          ...lista(dataChurras).map((c) => ({ ...c, tipo: `Churrasqueira ${c.churrasqueira || ""}`, data: c.data_reserva })),
          ...lista(dataMudancas).map((m) => ({ ...m, tipo: "Mudança", data: m.data_mudanca })),
        ];

        const agendados = todasReservas
          .filter((r) => String(r.status).toLowerCase() === "agendado")
          .sort((a, b) => (parseData(a.data)?.getTime() ?? 0) - (parseData(b.data)?.getTime() ?? 0));

        setUpcoming(agendados.slice(0, 4));
        setReservasAtivas(agendados.length);

        const nomeUsuario = normalizarTexto(user?.nome);
        setLogs(
          lista(dataLogs)
            .filter((log) => {
              const modulo = String(log.modulo || "").toUpperCase();
              return normalizarTexto(log.usuario) === nomeUsuario &&
                modulo !== "LOGIN" && modulo !== "SISTEMA";
            })
            .reverse()
            .slice(0, 4)
        );
      } catch (error) {
        console.error("Erro dashboard:", error);
      } finally {
        if (!saiuDaTela) {
          clearTimeout(timerCarregando.current);
          timerCarregando.current = setTimeout(() => setLoading(false), 400);
        }
      }
    }
    if (user?.nome) fetchData();
    return () => { saiuDaTela = true; };
  }, [user]);

  // Agenda de hoje e amanhã
  useEffect(() => {
    if (!acesso.gestao) return;

    let saiuDaTela = false;
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const fmt = (d) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
    const hojeStr = fmt(hoje);
    const amanhaStr = fmt(amanha);

    listar("AGENDAMENTOS")
      .then((data) => {
        const lista = (Array.isArray(data) ? data : [])
          .map((item) => ({
            id: item.id || "",
            tipo: item.tipo || "Morador",
            nome: item.nome || item.NOME || "",
            data: normalizarDataAg(item.data || item.DATA),
            hora_inicio: normalizarHoraAg(item.hora_inicio || item.HORA_INICIO),
            assunto: item.assunto || item.ASSUNTO || "",
            status: item.status || item.STATUS || "",
          }))
          .filter((ag) =>
            (ag.data === hojeStr || ag.data === amanhaStr) &&
            ag.status !== "Cancelado" && ag.status !== "Realizado"
          )
          .sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio));
        if (!saiuDaTela) setReunioesProximas(lista);
      })
      .catch(() => {});

    return () => { saiuDaTela = true; };
  }, [user]);

  const anoAtual = new Date().getFullYear();

  const numeros = useMemo(() => {
    const receitaAno = soma(somarPorMes([...festas, ...churras], anoAtual, "data_reserva"));

    // "Aguardando retirada" é o status ARMAZENADO: a encomenda está na
    // portaria e o morador ainda não buscou. PENDENTE é antes disso.
    const aguardando = entregas.filter(
      (e) => String(celula(e, "status")).trim().toUpperCase() === "ARMAZENADO"
    );
    const paradas = aguardando.filter((e) => {
      const dias = diasDesde(celula(e, "armazenado_data") || celula(e, "data_entrada"));
      return dias !== null && dias > 3;
    }).length;

    const carros = vagas.filter((v) => v.possui_carro === "Sim").length;
    const motos = vagas.filter((v) => v.possui_moto === "Sim").length;

    return {
      receitaAno,
      encomendas: aguardando.length,
      encomendasParadas: paradas,
      carros,
      motos,
      ocupadas: unidades.filter((u) => u.ocupado === "Sim").length,
      inadimplentes: unidades.filter((u) => u.status === "Inadimplente").length,
    };
  }, [festas, churras, entregas, vagas, unidades, anoAtual]);

  const primeiroNome = user?.nome ? user.nome.split(" ")[0] : "";
  const totalUnidades = unidades.length;

  const contexto = loading
    ? "Carregando dados do condomínio"
    : ["Diduccio", totalUnidades ? `${totalUnidades} unidades` : null]
        .filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader
        title={primeiroNome ? `Painel de ${primeiroNome}` : "Painel"}
        meta={contexto}
        actions={
          acesso.gestao ? (
            <Button variant="secondary" onClick={() => navigate("/agendamento")}>
              Abrir agenda completa
            </Button>
          ) : null
        }
      />

      {/* Duas regras, e só duas:
          - card numérico SEMPRE aparece; vale "-" quando o cargo não lê a
            origem, para a ausência ficar visível em vez de virar zero;
          - painel (gráfico, agenda, lista) só aparece para quem lê a origem —
            painel vazio não informa nada e ocupa a tela inteira. */}
      <div className="dash-bento">
        {acesso.receita && (
          <section className="dash-celula dash-celula--grafico">
            <PainelRelatorios
              isDark={theme.isDark}
              isMobile={isMobile}
              loading={loading}
              festas={festas}
              churras={churras}
              mudancas={mudancas}
            />
          </section>
        )}

        {/* Sem o gráfico ao lado, uma célula de 4 colunas deixaria 8 vazias:
            para quem não vê relatório, a ocupação ocupa a linha inteira. */}
        {acesso.portaria && (
          <section className={`dash-celula ${acesso.receita ? "dash-celula--lado" : "dash-celula--cheia"}`}>
            {acesso.gestao && (
              <AgendaDoDia
                itens={reunioesProximas}
                loading={loading}
                onVerAgenda={() => navigate("/agendamento")}
              />
            )}
            <Ocupacao
              loading={loading}
              ocupadas={numeros.ocupadas}
              total={totalUnidades}
              inadimplentes={numeros.inadimplentes}
              comTitulo={acesso.gestao}
            />
          </section>
        )}

        <div className="dash-numeros">
          <Numero
            escura
            rotulo={`Recebido ${anoAtual}`}
            valor={acesso.receita ? (loading ? null : fmtBRL(numeros.receitaAno)) : SEM_ACESSO}
            dica={acesso.receita ? "festas e churrasqueira" : "fora do seu acesso"}
            Icone={Wallet}
          />
          <Numero
            rotulo="Reservas ativas"
            valor={acesso.gestao ? (loading ? null : reservasAtivas) : SEM_ACESSO}
            dica={
              !acesso.gestao ? "fora do seu acesso"
                : upcoming[0] ? `próxima em ${rotuloData(upcoming[0].data)}`
                : "nenhuma agendada"
            }
            Icone={CalendarCheck}
          />
          <Numero
            rotulo="Encomendas aguardando"
            valor={acesso.portaria ? (loading ? null : numeros.encomendas) : SEM_ACESSO}
            dica={
              !acesso.portaria ? "fora do seu acesso"
                : numeros.encomendasParadas ? `${numeros.encomendasParadas} há mais de 3 dias`
                : "na portaria"
            }
            alerta={acesso.portaria && numeros.encomendasParadas > 0}
            Icone={Package}
          />
          <Numero
            rotulo="Carros registrados"
            valor={acesso.gestao ? (loading ? null : numeros.carros) : SEM_ACESSO}
            dica={
              !acesso.gestao ? "fora do seu acesso"
                : numeros.motos ? `e ${numeros.motos} motos`
                : "nenhuma moto"
            }
            Icone={Car}
          />
        </div>

        {acesso.gestao && (
          <section className="dash-celula dash-celula--larga">
            <ProximosAgendamentos
              data={upcoming}
              loading={loading}
              onViewDetails={handleVerDetalhes}
              onVerTodos={() => navigate("/calendario")}
            />
          </section>
        )}

        {acesso.gestao && (
          <section className="dash-celula dash-celula--media">
            <AtividadesRecentes logs={logs} loading={loading} />
          </section>
        )}
      </div>
    </div>
  );
}

function rotuloData(d) {
  const data = parseData(d);
  if (!data) return "data a confirmar";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/* ================= CÉLULA DE NÚMERO ================= */

function Numero({ rotulo, valor, dica, escura, alerta, Icone }) {
  return (
    <article className={`dash-celula dash-num${escura ? " dash-num--escura" : ""}`}>
      <span className="dash-num__topo">
        <span className="dash-num__rotulo">{rotulo}</span>
        {Icone && <Icone size={15} className="dash-num__icone" aria-hidden="true" />}
      </span>
      {valor === null ? (
        <span className="dash-num__valor"><Skeleton w={72} h={30} /></span>
      ) : (
        <span className={`dash-num__valor${alerta ? " dash-num__valor--alerta" : ""}`}>{valor}</span>
      )}
      <span className="dash-num__dica">{dica}</span>
    </article>
  );
}

/* ================= AGENDA DO DIA ================= */

/**
 * No painel antigo isto vivia atrás de um botão com contador. Aqui fica
 * aberto: um compromisso de hoje não deveria exigir um clique para aparecer.
 */
function AgendaDoDia({ itens, loading, onVerAgenda }) {
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${(hoje.getMonth() + 1).toString().padStart(2, "0")}-${hoje.getDate().toString().padStart(2, "0")}`;

  return (
    <div className="dash-agenda">
      <div className="dash-celula__topo">
        <h2 className="dash-secao__titulo">Hoje e amanhã</h2>
        {!loading && itens.length > 0 && <Badge tone="brand">{itens.length}</Badge>}
      </div>

      {loading ? (
        <Skeleton w="100%" h={64} radius="var(--radius-md)" />
      ) : itens.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={18} />}
          title="Nada marcado"
          description="Nenhum compromisso para hoje ou amanhã."
          action={<Button size="sm" variant="ghost" onClick={onVerAgenda}>Abrir agenda</Button>}
        />
      ) : (
        <ul className="dash-hoje">
          {itens.map((ag) => (
            <li key={ag.id} className="dash-hoje__item">
              <span className="dash-hoje__hora">{ag.hora_inicio}</span>
              <span style={{ minWidth: 0 }}>
                <span className="dash-hoje__quem">
                  {ag.data === hojeStr ? "Hoje" : "Amanhã"} · {ag.tipo} · {ag.nome}
                </span>
                {ag.assunto && <span className="dash-hoje__assunto">{ag.assunto}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================= OCUPAÇÃO ================= */

/**
 * Inadimplência saiu da faixa de números e vive aqui, colada na ocupação:
 * as duas falam da mesma coisa, a situação das unidades.
 */
function Ocupacao({ loading, ocupadas, total, inadimplentes, comTitulo }) {
  const pct = total ? Math.round((ocupadas / total) * 100) : 0;
  const livres = Math.max(0, total - ocupadas);
  const R = 15.9155; // circunferência = 100, facilita dasharray em porcentagem

  if (loading) {
    return (
      <div className={comTitulo ? "dash-ocupacao dash-ocupacao--abaixo" : "dash-ocupacao"}>
        <Skeleton w="100%" h={104} radius="var(--radius-md)" />
      </div>
    );
  }

  return (
    <div className={comTitulo ? "dash-ocupacao dash-ocupacao--abaixo" : "dash-ocupacao"}>
      <h3 className="dash-secao__titulo dash-ocupacao__titulo">Ocupação das unidades</h3>

      <div className="dash-rosca">
        <div className="dash-rosca__grafico">
          <svg viewBox="0 0 42 42" role="img" aria-label={`Ocupação das unidades: ${pct}%.`}>
            <circle cx="21" cy="21" r={R} fill="none" stroke="var(--border)" strokeWidth="5.5" />
            <circle
              className="dash-rosca__seg"
              cx="21" cy="21" r={R} fill="none"
              stroke={SERIE.festas} strokeWidth="5.5" strokeLinecap="butt"
              strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset="25"
            />
          </svg>
          <div className="dash-rosca__centro">
            <span className="dash-rosca__valor">{pct}%</span>
            <span className="dash-rosca__label">ocupação</span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Barrinha rotulo="Ocupadas" valor={ocupadas} total={total} cor={SERIE.festas} />
          <Barrinha rotulo="Disponíveis" valor={livres} total={total} cor="var(--border-strong)" />
        </div>
      </div>

      {inadimplentes > 0 && (
        <p className="dash-ocupacao__alerta">
          <strong>{inadimplentes}</strong> {inadimplentes === 1 ? "unidade inadimplente" : "unidades inadimplentes"}
          {total ? ` · ${Math.round((inadimplentes / total) * 100)}% do total` : ""}
        </p>
      )}
    </div>
  );
}

function Barrinha({ rotulo, valor, total, cor }) {
  const pct = total ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="dash-barrinha-bloco">
      <div className="dash-barrinha__topo">
        <span className="dash-legenda__item">
          <span className="dash-legenda__cor" style={{ background: cor }} />
          {rotulo}
        </span>
        <span className="dash-barrinha__num">{valor}</span>
      </div>
      <div className="dash-barrinha">
        <div className="dash-barrinha__preenchida" style={{ width: `${pct}%`, background: cor }} />
      </div>
    </div>
  );
}

/* ================= RELATÓRIOS ================= */

const RELATORIOS = [
  { id: "receita", label: "Receita", Icon: Wallet },
  { id: "reservas", label: "Reservas", Icon: BarChart3 },
  { id: "status", label: "Status", Icon: PieChart },
];

function PainelRelatorios({ isDark, isMobile, loading, festas, churras, mudancas }) {
  const [relatorio, setRelatorio] = useState("receita");
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const n = neutrosDoTema(isDark);

  const anos = useMemo(() => {
    const set = new Set([anoAtual]);
    [...festas, ...churras].forEach((r) => { const am = parseAnoMes(r.data_reserva); if (am) set.add(am.y); });
    mudancas.forEach((m) => { const am = parseAnoMes(m.data_mudanca); if (am) set.add(am.y); });
    return [...set].sort((a, b) => b - a).slice(0, 6);
  }, [festas, churras, mudancas, anoAtual]);

  const receita = useMemo(() => {
    const fest = somarPorMes(festas, ano, "data_reserva");
    const chur = somarPorMes(churras, ano, "data_reserva");
    // Ano anterior entra como linha, não como terceira barra: canal visual
    // diferente, então a comparação lê sem sujar o gráfico.
    const antFest = somarPorMes(festas, ano - 1, "data_reserva");
    const antChur = somarPorMes(churras, ano - 1, "data_reserva");
    const anterior = antFest.map((v, i) => v + antChur[i]);
    const total = soma(fest) + soma(chur);
    const totalAnterior = soma(anterior);
    return {
      fest, chur, anterior,
      totalFest: soma(fest), totalChur: soma(chur),
      total, totalAnterior,
      variacao: totalAnterior > 0 ? Math.round(((total - totalAnterior) / totalAnterior) * 100) : null,
    };
  }, [festas, churras, ano]);

  const reservasMes = useMemo(() => {
    const fest = contarPorMes(festas, ano, "data_reserva");
    const chur = contarPorMes(churras, ano, "data_reserva");
    const mud = contarPorMes(mudancas, ano, "data_mudanca");
    return { fest, chur, mud, total: soma(fest) + soma(chur) + soma(mud) };
  }, [festas, churras, mudancas, ano]);

  const statusDist = useMemo(() => {
    const cont = {};
    [...festas, ...churras].forEach((r) => {
      const am = parseAnoMes(r.data_reserva);
      if (!am || am.y !== ano) return;
      const s = String(r.status || "Sem status").trim();
      const key = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      cont[key] = (cont[key] || 0) + 1;
    });
    const CORES = {
      Agendado: SERIE.festas,
      Realizado: SERIE.mudancas,
      Cancelado: SERIE.negativo,
      Pendente: SERIE.pendente,
    };
    const itens = Object.entries(cont)
      .sort((a, b) => b[1] - a[1])
      .map(([label, valor], i) => ({
        label, valor,
        cor: CORES[label] || [SERIE.churrasqueira, n["border-strong"], SERIE.pendente][i % 3],
      }));
    return { itens, total: soma(itens.map((i) => i.valor)) };
  }, [festas, churras, ano, n]);

  return (
    <>
      <div className="dash-celula__topo">
        <div style={{ minWidth: 0 }}>
          <h2 className="dash-secao__titulo">Relatórios</h2>
          <p className="dash-secao__nota">Escolha o gráfico que deseja visualizar.</p>
        </div>

        <div className="dash-relatorios__controles">
          <div className="dash-chips" role="tablist" aria-label="Tipo de relatório">
            {RELATORIOS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={relatorio === r.id}
                className="dash-chip"
                onClick={() => setRelatorio(r.id)}
              >
                <r.Icon size={14} aria-hidden="true" />
                <span>{r.label}</span>
              </button>
            ))}
          </div>

          <select
            className="vit-select dash-relatorios__ano"
            value={ano}
            onChange={(e) => setAno(parseInt(e.target.value, 10))}
            aria-label="Ano do relatório"
          >
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <Skeleton w="100%" h={240} radius="var(--radius-md)" />
      ) : (
        <>
          {relatorio === "receita" && (
            <GraficoReceita key={`rec-${ano}`} n={n} isMobile={isMobile} dados={receita} ano={ano} />
          )}
          {relatorio === "reservas" && (
            <GraficoReservas key={`res-${ano}`} n={n} isMobile={isMobile} dados={reservasMes} />
          )}
          {relatorio === "status" && (
            <GraficoStatus key={`st-${ano}`} ano={ano} itens={statusDist.itens} total={statusDist.total} />
          )}
        </>
      )}
    </>
  );
}

/* ---- Receita: barras empilhadas do ano + linha do ano anterior ---- */
function GraficoReceita({ n, isMobile, dados, ano }) {
  const H = 210, W = 760, PAD = 8;
  const colW = (W - PAD * 2) / 12;
  const totais = dados.fest.map((v, i) => v + dados.chur[i]);
  const max = Math.max(1, ...totais, ...dados.anterior);
  const bw = Math.min(30, colW - 16);
  const [sel, setSel] = useState(null);

  const escala = (v) => (v / max) * (H - 16);
  const pontos = dados.anterior
    .map((v, i) => `${PAD + i * colW + colW / 2},${H - escala(v)}`)
    .join(" ");

  return (
    <div>
      <div className="dash-comparativo">
        <div>
          <span className="dash-comparativo__rotulo">Recebido em {ano}</span>
          <span className="dash-comparativo__valor">{fmtBRLfull(dados.total)}</span>
        </div>
        {dados.variacao !== null && (
          <span className={`dash-delta${dados.variacao < 0 ? " dash-delta--queda" : ""}`}>
            {dados.variacao < 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
            {dados.variacao > 0 ? "+" : ""}{dados.variacao}% vs {ano - 1}
          </span>
        )}
      </div>

      <div className="dash-legenda">
        <span className="dash-legenda__item">
          <span className="dash-legenda__cor" style={{ background: SERIE.festas }} />
          Salão de Festas · {fmtBRLfull(dados.totalFest)}
        </span>
        <span className="dash-legenda__item">
          <span className="dash-legenda__cor" style={{ background: SERIE.churrasqueira }} />
          Churrasqueira · {fmtBRLfull(dados.totalChur)}
        </span>
        <span className="dash-legenda__item">
          <span className="dash-legenda__linha" style={{ background: SERIE.anterior }} />
          {ano - 1} · {fmtBRLfull(dados.totalAnterior)}
        </span>
      </div>

      <div className="dash-banner" aria-live="polite">
        {sel !== null && (
          <div className="dash-banner__caixa">
            <strong>{MESES[sel]}</strong>
            <span style={{ color: SERIE.festas }}>Festas {fmtBRLfull(dados.fest[sel])}</span>
            <span style={{ color: SERIE.churrasqueira }}>Churrasqueira {fmtBRLfull(dados.chur[sel])}</span>
            <span style={{ color: SERIE.anterior }}>{ano - 1} {fmtBRLfull(dados.anterior[sel])}</span>
          </div>
        )}
      </div>

      <div className="dash-grafico-rolagem">
        <svg viewBox={`0 0 ${W} ${H + 26}`} className="dash-grafico" role="img"
             aria-label={`Receita mensal de ${ano}. Total ${fmtBRLfull(dados.total)}, contra ${fmtBRLfull(dados.totalAnterior)} em ${ano - 1}.`}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={PAD} x2={W - PAD} y1={H - H * f} y2={H - H * f}
                  stroke={n.border} strokeDasharray="4 5" strokeWidth="1" />
          ))}

          {MESES.map((m, i) => {
            const x = PAD + i * colW + (colW - bw) / 2;
            const hF = escala(dados.fest[i]);
            const hC = escala(dados.chur[i]);
            return (
              <g key={m}>
                {hF > 0 && (
                  <rect className="dash-barra" style={{ animationDelay: `${i * 0.035}s` }}
                        x={x} y={H - hF} width={bw} height={hF} rx="2" fill={SERIE.festas}>
                    <title>{`${m}: Festas ${fmtBRLfull(dados.fest[i])}`}</title>
                  </rect>
                )}
                {hC > 0 && (
                  <rect className="dash-barra" style={{ animationDelay: `${i * 0.035 + 0.04}s` }}
                        x={x} y={H - hF - hC} width={bw} height={hC} rx="2" fill={SERIE.churrasqueira}>
                    <title>{`${m}: Churrasqueira ${fmtBRLfull(dados.chur[i])}`}</title>
                  </rect>
                )}
                <text x={PAD + i * colW + colW / 2} y={H + 18} textAnchor="middle" fontSize="11"
                      fontWeight="600" fill={n["text-muted"]}>{m}</text>
                <rect x={PAD + i * colW} y={0} width={colW} height={H} fill="transparent"
                      style={{ cursor: "pointer" }} onClick={() => setSel(sel === i ? null : i)} />
              </g>
            );
          })}

          {/* Ano anterior por cima das barras, como referência. */}
          {dados.totalAnterior > 0 && (
            <polyline
              className="dash-linha"
              points={pontos}
              fill="none"
              stroke={SERIE.anterior}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 4"
            />
          )}
        </svg>
      </div>

      <p className="dash-secao__nota" style={{ marginTop: "var(--space-5)" }}>
        Considera apenas reservas com pagamento confirmado.
        {isMobile && " Toque numa coluna para ver o mês e arraste para o lado para ver o ano inteiro."}
      </p>
    </div>
  );
}

/* ---- Reservas: barras empilhadas por mês ---- */
function GraficoReservas({ n, isMobile, dados }) {
  const H = 210, W = 760, PAD = 8;
  const colW = (W - PAD * 2) / 12;
  const totais = MESES.map((_, i) => dados.fest[i] + dados.chur[i] + dados.mud[i]);
  const max = Math.max(1, ...totais);
  const bw = Math.min(26, colW - 14);
  const [sel, setSel] = useState(null);

  const LEG = [
    { label: "Salão de Festas", cor: SERIE.festas },
    { label: "Churrasqueira", cor: SERIE.churrasqueira },
    { label: "Mudanças", cor: SERIE.mudancas },
  ];

  return (
    <div>
      <div className="dash-legenda">
        {LEG.map((l) => (
          <span key={l.label} className="dash-legenda__item">
            <span className="dash-legenda__cor" style={{ background: l.cor }} />
            {l.label}
          </span>
        ))}
        <strong className="dash-legenda__total">{dados.total} reservas no ano</strong>
      </div>

      <div className="dash-banner" aria-live="polite">
        {sel !== null && (
          <div className="dash-banner__caixa">
            <strong>{MESES[sel]}</strong>
            <span>Festas {dados.fest[sel]}</span>
            <span>Churrasqueira {dados.chur[sel]}</span>
            <span>Mudanças {dados.mud[sel]}</span>
            <span>Total {totais[sel]}</span>
          </div>
        )}
      </div>

      <div className="dash-grafico-rolagem">
        <svg viewBox={`0 0 ${W} ${H + 26}`} className="dash-grafico" role="img"
             aria-label={`Reservas por mês. Total de ${dados.total} no ano.`}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={PAD} x2={W - PAD} y1={H - H * f} y2={H - H * f}
                  stroke={n.border} strokeDasharray="4 5" strokeWidth="1" />
          ))}
          {MESES.map((m, i) => {
            const x = PAD + i * colW + (colW - bw) / 2;
            const esc = (v) => (v / max) * (H - 12);
            let yCursor = H;
            const seg = (h, fill, label, valor, delayExtra) => {
              if (h <= 0) return null;
              yCursor -= h;
              return (
                <rect className="dash-barra" style={{ animationDelay: `${i * 0.035 + delayExtra}s` }}
                      x={x} y={yCursor} width={bw} height={h} rx="2" fill={fill}>
                  <title>{`${m}: ${label} — ${valor}`}</title>
                </rect>
              );
            };
            return (
              <g key={m}>
                {seg(esc(dados.fest[i]), SERIE.festas, "Festas", dados.fest[i], 0)}
                {seg(esc(dados.chur[i]), SERIE.churrasqueira, "Churrasqueira", dados.chur[i], 0.04)}
                {seg(esc(dados.mud[i]), SERIE.mudancas, "Mudanças", dados.mud[i], 0.08)}
                {totais[i] > 0 && (
                  <text x={x + bw / 2} y={yCursor - 6} textAnchor="middle" fontSize="11"
                        fontWeight="700" fill={n.text}>{totais[i]}</text>
                )}
                <text x={PAD + i * colW + colW / 2} y={H + 18} textAnchor="middle" fontSize="11"
                      fontWeight="600" fill={n["text-muted"]}>{m}</text>
                <rect x={PAD + i * colW} y={0} width={colW} height={H} fill="transparent"
                      style={{ cursor: "pointer" }} onClick={() => setSel(sel === i ? null : i)} />
              </g>
            );
          })}
        </svg>
      </div>
      {isMobile && (
        <p className="dash-secao__nota" style={{ marginTop: "var(--space-5)" }}>
          Toque numa coluna para ver o mês e arraste para o lado para ver o ano inteiro.
        </p>
      )}
    </div>
  );
}

/* ---- Status: barras horizontais, não rosca ----
   Rosca compara mal fatias parecidas. Em barra alinhada pela base o olho
   compara comprimento, que é a leitura mais precisa que existe. */
function GraficoStatus({ ano, itens, total }) {
  if (total === 0) {
    return <p className="dash-secao__nota">Sem reservas registradas em {ano}.</p>;
  }
  return (
    <div>
      <div className="dash-comparativo">
        <div>
          <span className="dash-comparativo__rotulo">Reservas em {ano}</span>
          <span className="dash-comparativo__valor">{total}</span>
        </div>
      </div>
      <div className="dash-status">
        {itens.map((it) => (
          <Barrinha key={it.label} rotulo={it.label} valor={it.valor} total={total} cor={it.cor} />
        ))}
      </div>
    </div>
  );
}

/* ================= LISTAS ================= */

function AtividadesRecentes({ logs, loading }) {
  const quando = (dateString) => {
    if (!dateString) return "Recentemente";
    // `created_at` é timestamptz e chega "2026-08-12T18:09:31+00:00". A versão
    // anterior partia de "DD/MM/AAAA HH:mm", da planilha: com ISO ela montava
    // um Invalid Date, caía no `isNaN` e devolvia a string crua — a lista de
    // atividades passou a mostrar o carimbo do banco no lugar de "Há 3 horas".
    const ms = new Date(dateString).getTime();
    if (Number.isNaN(ms)) return "Recentemente";
    const horas = Math.floor((Date.now() - ms) / (1000 * 60 * 60));
    if (horas < 0) return "Agora mesmo";
    if (horas < 1) return "Agora mesmo";
    if (horas < 24) return `Há ${horas} ${horas === 1 ? "hora" : "horas"}`;
    return dataBR(dateString);
  };

  return (
    <>
      <h2 className="dash-secao__titulo">Suas atividades recentes</h2>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-7)", marginTop: "var(--space-6)" }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i}>
              <Skeleton w={92} h={14} />
              <div style={{ height: 8 }} />
              <Skeleton w="82%" h={12} />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<Inbox size={18} />}
          title="Nenhuma atividade ainda"
          description="Suas ações no sistema aparecem aqui assim que você começar."
        />
      ) : (
        <ul className="dash-lista">
          {logs.map((log, i) => (
            <li key={i} className="dash-lista__item">
              <div className="dash-lista__topo">
                <Badge tone="neutral">{log.modulo}</Badge>
                <span className="dash-lista__quando">{quando(log.timestamp)}</span>
              </div>
              <p className="dash-lista__texto">{log.descricao || "Ação realizada"}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ProximosAgendamentos({ data, loading, onViewDetails, onVerTodos }) {
  return (
    <>
      <div className="dash-celula__topo">
        <h2 className="dash-secao__titulo">Próximos agendamentos</h2>
        {data.length > 0 && (
          <Button size="sm" variant="ghost" onClick={onVerTodos}>Ver todos</Button>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} w="100%" h={58} radius="var(--radius-md)" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={18} />}
          title="Nenhuma reserva agendada"
          description="Quando houver reserva confirmada, ela aparece aqui."
          action={<Button variant="secondary" onClick={onVerTodos}>Abrir calendário</Button>}
        />
      ) : (
        <ul className="dash-reservas">
          {data.map((item, idx) => {
            const bruto = String(item.unidade_id || item.id_unidade || "");
            const unidade = bruto.length > 3 ? bruto.slice(-3) : bruto;
            const { dia, mes } = partirData(item.data);
            return (
              <li key={idx} className="dash-reserva">
                <span className="dash-reserva__data" aria-hidden="true">
                  <span className="dash-reserva__mes">{mes}</span>
                  <span className="dash-reserva__dia">{dia}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="dash-reserva__tipo">{item.tipo}</span>
                  <span className="dash-reserva__quem">
                    B5-{unidade} · {item.morador || "morador não informado"}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => onViewDetails(item)}>
                  Detalhes
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function partirData(d) {
  const obj = parseData(d);
  if (!obj) return { dia: "--", mes: "---" };
  return {
    dia: obj.getDate().toString().padStart(2, "0"),
    mes: obj.toLocaleString("pt-BR", { month: "short" }).toUpperCase().replace(".", ""),
  };
}
