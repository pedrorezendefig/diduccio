import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRightLeft, CalendarCheck, CalendarClock, Clock, LayoutGrid, MessageSquare,
  PackageOpen, PartyPopper, Truck, UserRound, Users, Vote,
} from "lucide-react";
import { supabase } from "../api/supabase";
import { listar, listarChegadas } from "../api/db";
import { chamarEdgeFunction } from "../api/edge";
import { useAtualizar } from "../lib/useAtualizar";
import {
  adesaoAoApp, avisosDoDia, chamadosParados, dataPorExtenso, diaDoRegistro, diaEmBrasilia, encomendas,
  eventosDoCondominio, filaDoFoco, proximosDias, saudacao, serieDiaria, serieMensal, somarDias,
} from "../lib/inicio";
import { BotaoPrincipal, AssinaturaDaEmpresa, DiasEmPilulas, Metrica } from "../components/inicio/pecas";

const ADMINISTRACAO = ["Sindico", "Auxiliar Administrativo", "Desenvolvedor"];

const lista = (r) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
const seguro = (p) => Promise.resolve(p).then((r) => r, () => []);

/**
 * O que cada cargo vê. Busca só o que o cargo pode ler: pedir o resto não
 * daria erro (o RLS devolve vazio), mas o vazio se confundiria com "não há
 * nada".
 */
async function buscarDados(perfil, hoje) {
  if (perfil === "adm") {
    const [cad, res, vei, sol, mor, unidades, festas, churras, mudancas, agenda, entregas] = await Promise.all([
      seguro(supabase.rpc("cadastros_para_aprovar")),
      seguro(supabase.rpc("reservas_para_aprovar")),
      seguro(supabase.rpc("pedidos_veiculo_para_aprovar")),
      seguro(supabase.rpc("solicitacoes_para_responder")),
      seguro(supabase.rpc("moradores_no_app")),
      seguro(listar("UNIDADES")), seguro(listar("FESTAS")), seguro(listar("CHURRASQUEIRA")),
      seguro(listar("MUDANCAS")), seguro(listar("AGENDAMENTOS")), seguro(listar("ENTREGAS")),
    ]);
    return {
      cadastros: lista(cad), reservas: lista(res), veiculos: lista(vei), solicitacoes: lista(sol), moradores: lista(mor),
      unidades: lista(unidades), festas: lista(festas), churrasqueira: lista(churras), mudancas: lista(mudancas),
      agendamentos: lista(agenda), entregas: lista(entregas),
    };
  }
  if (perfil === "portaria") {
    const desde = new Date(`${somarDias(hoje, -6)}T00:00:00-03:00`).toISOString();
    const [entregas, abertas, semana] = await Promise.all([
      seguro(listar("ENTREGAS")), seguro(listarChegadas({ abertas: true })), seguro(listarChegadas({ desde })),
    ]);
    return { entregas: lista(entregas), abertas: lista(abertas), semana: lista(semana) };
  }
  const r = await seguro(chamarEdgeFunction("receita", {}));
  return { receita: Array.isArray(r?.corpo?.dados) ? r.corpo.dados : [] };
}

/**
 * Início: a entrada do sistema. O dia, algumas métricas e um botão grande que
 * leva ao que o cargo mais faz: o Modo foco para quem aprova os pedidos do
 * app, Entradas e saídas para a portaria, Assembleia para o conselho.
 */
export default function Inicio({ user }) {
  const navigate = useNavigate();
  const perfil = ADMINISTRACAO.includes(user?.cargo) ? "adm" : user?.cargo === "Porteiro" ? "portaria" : "conselho";
  const [dados, setDados] = useState(null);
  const [agora, setAgora] = useState(() => Date.now());
  const hoje = diaEmBrasilia(agora);

  const carregar = () => buscarDados(perfil, diaEmBrasilia(Date.now())).then((d) => { setDados(d); setAgora(Date.now()); });
  useEffect(() => { let vivo = true; buscarDados(perfil, hoje).then((d) => { if (vivo) setDados(d); }); return () => { vivo = false; }; }, [perfil]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sozinha: pedido novo e encomenda que chegou aparecem sem recarregar.
  useAtualizar(carregar, 60_000);

  const primeiroNome = String(user?.nome ?? "").trim().split(/\s+/)[0] || "";
  const carregando = dados == null;

  return (
    <div className="ini">
      <header className="ini-ola ini-anim" style={{ "--i": 0 }}>
        <small>{dataPorExtenso(agora)}</small>
        <h1>{saudacao(agora)}{primeiroNome ? `, ${primeiroNome}` : ""}.</h1>
        <p>Aqui está o que importa hoje no Diduccio.</p>
      </header>

      {perfil === "adm" && <InicioAdm dados={dados} hoje={hoje} agora={agora} carregando={carregando} navigate={navigate} />}
      {perfil === "portaria" && <InicioPortaria dados={dados} hoje={hoje} carregando={carregando} navigate={navigate} />}
      {perfil === "conselho" && <InicioConselho dados={dados} hoje={hoje} carregando={carregando} navigate={navigate} />}

      <AssinaturaDaEmpresa />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function InicioAdm({ dados, hoje, agora, carregando, navigate }) {
  const c = useMemo(() => {
    if (!dados) return null;
    const fila = filaDoFoco(dados, agora);
    const eventos = eventosDoCondominio(dados);
    const enc = encomendas(dados.entregas, hoje);
    const ades = adesaoAoApp(dados.moradores, dados.unidades.length, hoje);
    const mesAtual = hoje.slice(0, 7);
    const reservas = [...dados.festas, ...dados.churrasqueira].filter((r) => !/cancel/i.test(String(r.status ?? "")));
    return {
      fila,
      dias: proximosDias(eventos, hoje, 6),
      enc,
      ades,
      reservasNoMes: reservas.filter((r) => diaDoRegistro(r.data_reserva).slice(0, 7) === mesAtual).length,
      serieReservas: serieMensal(reservas.map((r) => r.data_reserva), hoje),
      serieEncomendas: serieDiaria(dados.entregas.map((e) => e.data_entrada), hoje),
      serieChamados: serieDiaria(dados.solicitacoes.map((s) => s.enviada_em), hoje),
      avisos: avisosDoDia({ fila, encomendasAmanha: enc.vaoAmanha, chamadosParados: chamadosParados(dados.solicitacoes, agora) }),
    };
  }, [dados, hoje, agora]);

  // O dia escolhido nas pílulas de Próximos dias: o cartão da esquerda mostra ele.
  const [diaSel, setDiaSel] = useState(0);
  const escolhido = c?.dias[diaSel];
  const n = c?.fila.length ?? null;
  const fora = c?.fila.filter((i) => i.foraDoPrazo).length ?? 0;
  const texto = carregando ? "Carregando os pedidos…"
    : n ? `${n === 1 ? "1 pedido do app esperando" : `${n} pedidos do app esperando`} você${fora ? ` · ${fora} fora do prazo` : ""} · comece pelo mais antigo`
      : "Nenhum pedido do app esperando. Tudo em dia.";

  return (
    <>
      <BotaoPrincipal numero={n} fracao={1} titulo="Modo foco" texto={texto} onClick={() => navigate("/modo-foco")} rotulo={`Modo foco: ${texto}`} />

      <div className="ini-metricas">
        <Metrica ordem={4} Icone={Users} rotulo="Adesão ao app" valor={c?.ades.pct ?? null} sufixo="%" serie={c?.ades.serie} tom="marca"
          contexto={c ? `${c.ades.aptos} de ${c.ades.total} apartamentos` : ""} />
        <Metrica ordem={5} Icone={MessageSquare} rotulo="Chamados abertos" valor={c ? dados.solicitacoes.length : null} serie={c?.serieChamados} tom="laranja"
          contexto={c ? `${dados.solicitacoes.filter((s) => s.nao_lida).length} esperando resposta` : ""} />
        <Metrica ordem={6} Icone={CalendarCheck} rotulo="Reservas no mês" valor={c?.reservasNoMes ?? null} serie={c?.serieReservas} tom="azul"
          contexto="salão e churrasqueiras" />
        <Metrica ordem={7} Icone={PackageOpen} rotulo="Encomendas na portaria" valor={c?.enc.naPortaria ?? null} serie={c?.serieEncomendas} tom="violeta"
          contexto={c ? (c.enc.vaoAmanha ? `${c.enc.vaoAmanha} vão ao depósito amanhã` : "nenhuma vai ao depósito amanhã") : ""} />
      </div>

      <div className="ini-dois">
        <section className="ini-cartao ini-anim" style={{ "--i": 8 }}>
          <header className="ini-cartao__topo">
            <h2 aria-live="polite">{escolhido?.titulo ?? "Hoje"}</h2>
            <button type="button" className="ini-link" onClick={() => navigate("/dashboard")}><LayoutGrid size={14} aria-hidden="true" />Dashboard</button>
          </header>
          {c && <ListaDeHoje key={escolhido.dia} itens={escolhido.itens} hoje={diaSel === 0} />}
        </section>
        <section className="ini-cartao ini-anim" style={{ "--i": 9 }}>
          <header className="ini-cartao__topo"><h2>Próximos dias</h2></header>
          {c && <DiasEmPilulas dias={c.dias} selecionado={diaSel} onEscolher={setDiaSel} />}
          {c && c.avisos.length > 0 && <Avisos avisos={c.avisos.slice(0, 2)} />}
        </section>
      </div>
    </>
  );
}

const ICONE_DO_EVENTO = { espaco: PartyPopper, portaria: Truck, adm: CalendarClock };

function ListaDeHoje({ itens, hoje }) {
  if (!itens.length) return <p className="ini-vazio ini-anim">{hoje ? "Nada marcado para hoje." : "Nada marcado para este dia. Livre para reserva."}</p>;
  return (
    <ul className="ini-lista">
      {itens.map((e, k) => {
        const Icone = ICONE_DO_EVENTO[e.tipo] ?? CalendarClock;
        return (
          <li key={k} className="ini-anim" style={{ "--i": 10 + k }}>
            <span className={`ini-ico ini-ico--${e.tipo}`}><Icone size={16} aria-hidden="true" /></span>
            <span className="ini-lista__texto"><b>{e.titulo}</b>{e.detalhe && <small>{e.detalhe}</small>}</span>
            {e.unidade && <span className="ini-un">{e.unidade}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Avisos({ avisos }) {
  return (
    <ul className="ini-lista ini-lista--avisos">
      {avisos.map((a, k) => (
        <li key={k} className="ini-anim" style={{ "--i": 14 + k }}>
          <span className={`ini-ico ${a.grave ? "ini-ico--grave" : "ini-ico--aviso"}`}>
            {a.grave ? <AlertTriangle size={16} aria-hidden="true" /> : <Clock size={16} aria-hidden="true" />}
          </span>
          <span className="ini-lista__texto"><b>{a.titulo}</b><small>{a.texto}</small></span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

const TIPO_DA_CHEGADA = { entregador: "Entregador", motorista: "Motorista", visitante: "Visitante", temporada: "Temporada", servico: "Serviço" };

function InicioPortaria({ dados, hoje, carregando, navigate }) {
  const c = useMemo(() => {
    if (!dados) return null;
    const enc = encomendas(dados.entregas, hoje);
    const entradas = dados.semana.map((x) => x.horario_entrada);
    return {
      enc,
      dentro: dados.abertas.length,
      entradasHoje: entradas.filter((d) => diaEmBrasilia(d) === hoje).length,
      serieEntradas: serieDiaria(entradas, hoje),
      serieEncomendas: serieDiaria(dados.entregas.map((e) => e.data_entrada), hoje),
      amanha: dados.entregas.filter((e) => enc.codigosAmanha.includes(e.cod)),
    };
  }, [dados, hoje]);

  const texto = carregando ? "Carregando…"
    : `${c.dentro === 1 ? "1 pessoa dentro do condomínio" : `${c.dentro} pessoas dentro do condomínio`} agora · registre entradas e saídas`;

  return (
    <>
      <BotaoPrincipal numero={c?.dentro ?? null} titulo="Entradas e saídas" texto={texto} onClick={() => navigate("/entregas")} />
      <div className="ini-metricas">
        <Metrica ordem={4} Icone={UserRound} rotulo="Dentro agora" valor={c?.dentro ?? null} contexto="sem saída registrada" />
        <Metrica ordem={5} Icone={ArrowRightLeft} rotulo="Entradas hoje" valor={c?.entradasHoje ?? null} serie={c?.serieEntradas} tom="azul" contexto="últimos 7 dias no gráfico" />
        <Metrica ordem={6} Icone={PackageOpen} rotulo="Encomendas na portaria" valor={c?.enc.naPortaria ?? null} serie={c?.serieEncomendas} tom="violeta" contexto="esperando retirada" />
        <Metrica ordem={7} Icone={Clock} rotulo="Vão ao depósito amanhã" valor={c?.enc.vaoAmanha ?? null} contexto="5 dias na portaria" />
      </div>
      <div className="ini-dois">
        <section className="ini-cartao ini-anim" style={{ "--i": 8 }}>
          <header className="ini-cartao__topo"><h2>Dentro do condomínio</h2>
            <button type="button" className="ini-link" onClick={() => navigate("/entregas")}><ArrowRightLeft size={14} aria-hidden="true" />Entradas e saídas</button></header>
          {c && (c.dentro ? (
            <ul className="ini-lista">
              {dados.abertas.slice(0, 5).map((x, k) => (
                <li key={x.id ?? k}>
                  <span className="ini-ico ini-ico--portaria"><UserRound size={16} aria-hidden="true" /></span>
                  <span className="ini-lista__texto"><b>{x.nome || "Sem nome"}</b><small>{TIPO_DA_CHEGADA[x.tipo] ?? x.tipo ?? ""}{x.empresa ? ` · ${x.empresa}` : ""}</small></span>
                  {x.bloco && <span className="ini-un">{x.bloco}·{x.apartamento}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="ini-vazio">Ninguém dentro agora.</p>)}
        </section>
        <section className="ini-cartao ini-anim" style={{ "--i": 9 }}>
          <header className="ini-cartao__topo"><h2>Para o depósito amanhã</h2>
            <button type="button" className="ini-link" onClick={() => navigate("/encomendas")}><PackageOpen size={14} aria-hidden="true" />Encomendas</button></header>
          {c && (c.amanha.length ? (
            <ul className="ini-lista">
              {c.amanha.slice(0, 5).map((e, k) => (
                <li key={e.id ?? k}>
                  <span className="ini-ico ini-ico--aviso"><PackageOpen size={16} aria-hidden="true" /></span>
                  <span className="ini-lista__texto"><b>{e.nome || "Encomenda"}</b><small>{e.numero_encomenda ? `Nº ${e.numero_encomenda}` : "Na portaria"}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="ini-vazio">Nenhuma encomenda vai ao depósito amanhã.</p>)}
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function InicioConselho({ dados, hoje, carregando, navigate }) {
  const c = useMemo(() => {
    if (!dados) return null;
    const vivas = dados.receita.filter((r) => !/cancel/i.test(String(r.status ?? "")));
    const mes = hoje.slice(0, 7);
    const doMes = vivas.filter((r) => diaDoRegistro(r.data_reserva).slice(0, 7) === mes);
    const eventos = vivas.map((r) => ({ dia: diaDoRegistro(r.data_reserva), tipo: "espaco", titulo: r.origem === "festas" ? "Salão de festas" : "Churrasqueira", unidade: "" }));
    return {
      noMes: doMes.length,
      receitaMes: Math.round(doMes.filter((r) => r.pago).reduce((s, r) => s + Number(r.valor_taxa || 0), 0)),
      serie: serieMensal(vivas.map((r) => r.data_reserva), hoje),
      dias: proximosDias(eventos, hoje, 6),
    };
  }, [dados, hoje]);

  return (
    <>
      <BotaoPrincipal numero={c?.noMes ?? null} titulo="Assembleia" texto="Atas, pautas e votações do condomínio" onClick={() => navigate("/assembleia")} />
      <div className="ini-metricas ini-metricas--duas">
        <Metrica ordem={4} Icone={CalendarCheck} rotulo="Reservas no mês" valor={c?.noMes ?? null} serie={c?.serie} tom="azul" contexto="salão e churrasqueiras" />
        <Metrica ordem={5} Icone={Vote} rotulo="Recebido no mês (R$)" valor={c?.receitaMes ?? null} serie={c?.serie} tom="marca" contexto="taxas de reserva pagas" />
      </div>
      <div className="ini-dois">
        <section className="ini-cartao ini-anim" style={{ "--i": 8 }}>
          <header className="ini-cartao__topo"><h2>Próximos dias</h2></header>
          {c && <DiasEmPilulas dias={c.dias} />}
        </section>
        <section className="ini-cartao ini-anim" style={{ "--i": 9 }}>
          <header className="ini-cartao__topo"><h2>Atalhos</h2></header>
          <div className="ini-atalhos">
            <button type="button" onClick={() => navigate("/dashboard")}><LayoutGrid size={16} aria-hidden="true" />Dashboard e relatórios</button>
            <button type="button" onClick={() => navigate("/assembleia")}><Vote size={16} aria-hidden="true" />Assembleias</button>
          </div>
        </section>
      </div>
      {carregando && <span className="sr-only">Carregando</span>}
    </>
  );
}
