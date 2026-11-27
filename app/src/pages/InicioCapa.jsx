import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, Car, DoorOpen, LogIn, Package, PackageCheck, Wallet } from "lucide-react";
import { supabase } from "../api/supabase";
import { listar, listarChegadas } from "../api/db";
import { listarNoticiasNoApp } from "../api/noticias";
import { useAtualizar } from "../lib/useAtualizar";
import { avisosDoDia, chamadosParados, diaEmBrasilia, encomendas, filaDoFoco, serieDiaria, serieMensal, somarDias } from "../lib/inicio";
import {
  acumuladoPorMes, compromissos, ehGrave, compromissosDaPortaria, contagem, diaEMes, emReais, encomendasParadas, naPortaria, noMesmoPeriodo,
  pendenciasDaAdministracao, pendenciasDaPortaria, porMesDoAno, quemEstaDentro, reservasAtivas, retiradasNoDia,
  semanaDaCapa, taxasPagas,
} from "../lib/inicioCapa";
import { CONCLUIDA, classificarPrazo } from "../lib/tarefas";
import CapaDoDia from "../components/inicio/CapaDoDia";
import { AssinaturaDaEmpresa } from "../components/inicio/pecas";
import { FaixaFoco, FiquePorDentro, Link, Numero, Pendencias, ProximosDias, Relatorios } from "../components/inicio/pecasCapa";
import Inicio from "./Inicio";

const ADMINISTRACAO = ["Sindico", "Auxiliar Administrativo", "Desenvolvedor"];

const lista = (r) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
const seguro = (p) => Promise.resolve(p).then((r) => r, () => []);
const contar = (n) => Math.round(n).toLocaleString("pt-BR");
const soma = (arr) => arr.reduce((a, b) => a + b, 0);

/** "+7% em relação ao mês passado", com a seta certa; sem base, o texto de reserva. */
function dicaDaVariacao(pct, reserva) {
  if (pct == null) return { texto: reserva };
  if (pct === 0) return { texto: "igual ao mês passado" };
  return { tipo: pct > 0 ? "sobe" : "desce", texto: `${pct > 0 ? "+" : ""}${pct}% em relação ao mês passado` };
}

/**
 * Busca só o que o cargo pode ler. O porteiro não lê festas, churrasqueira nem
 * mudanças (0015): a agenda dele e as contagens do ano vêm das funções do 0083.
 */
async function buscarDados(perfil, hoje) {
  if (perfil === "adm") {
    const [cad, res, vei, sol, unidades, festas, churras, mudancas, agenda, entregas, vagas, tarefas, noticias] = await Promise.all([
      seguro(supabase.rpc("cadastros_para_aprovar")),
      seguro(supabase.rpc("reservas_para_aprovar")),
      seguro(supabase.rpc("pedidos_veiculo_para_aprovar")),
      seguro(supabase.rpc("solicitacoes_para_responder")),
      seguro(listar("UNIDADES")), seguro(listar("FESTAS")), seguro(listar("CHURRASQUEIRA")),
      seguro(listar("MUDANCAS")), seguro(listar("AGENDAMENTOS")), seguro(listar("ENTREGAS")),
      seguro(listar("VAGAS")), seguro(listar("TAREFAS")), seguro(listarNoticiasNoApp()),
    ]);
    return {
      cadastros: lista(cad), reservas: lista(res), veiculos: lista(vei), solicitacoes: lista(sol),
      unidades: lista(unidades), festas: lista(festas), churrasqueira: lista(churras), mudancas: lista(mudancas),
      agendamentos: lista(agenda), entregas: lista(entregas), vagas: lista(vagas), tarefas: lista(tarefas),
      noticias: lista(noticias),
    };
  }
  const anoPassado = `${Number(hoje.slice(0, 4)) - 1}-01-01`;
  const [entregas, unidades, abertas, porDia, agenda] = await Promise.all([
    seguro(listar("ENTREGAS")), seguro(listar("UNIDADES")), seguro(listarChegadas({ abertas: true })),
    supabase.rpc("portaria_por_dia", { p_desde: anoPassado }).then((r) => (r?.error ? null : lista(r)), () => null),
    seguro(supabase.rpc("agenda_da_portaria", { p_de: hoje, p_ate: somarDias(hoje, 5) })),
  ]);
  return { entregas: lista(entregas), unidades: lista(unidades), abertas: lista(abertas), porDia, agenda: lista(agenda) };
}

/**
 * Início com a capa ilustrada: a saudação sobre o condomínio na luz da hora
 * de Brasília, os números do cargo, o Modo foco, as pendências, os relatórios
 * e os próximos dias. A administração e a portaria têm cada uma a sua versão;
 * o conselho continua com o Início anterior.
 *
 * O Início anterior (`Inicio.jsx`) fica guardado: o App escolhe qual mostrar.
 */
export default function InicioCapa({ user }) {
  const perfil = ADMINISTRACAO.includes(user?.cargo) ? "adm" : user?.cargo === "Porteiro" ? "portaria" : "conselho";
  if (perfil === "conselho") return <Inicio user={user} />;
  return <InicioComCapa user={user} perfil={perfil} />;
}

function InicioComCapa({ user, perfil }) {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [agora, setAgora] = useState(() => Date.now());
  const hoje = diaEmBrasilia(agora);

  const carregar = () => buscarDados(perfil, diaEmBrasilia(Date.now())).then((d) => { setDados(d); setAgora(Date.now()); });
  useEffect(() => {
    let vivo = true;
    buscarDados(perfil, hoje).then((d) => { if (vivo) setDados(d); });
    return () => { vivo = false; };
  }, [perfil]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sozinha: pedido novo e encomenda que chegou aparecem sem recarregar.
  useAtualizar(carregar, 60_000);

  const nome = String(user?.nome ?? "").trim().split(/\s+/)[0] || "";
  const Versao = perfil === "adm" ? Administracao : Portaria;
  return <Versao dados={dados} hoje={hoje} agora={agora} nome={nome} navigate={navigate} />;
}

/* ------------------------------------------------------------------ */

function Administracao({ dados, hoje, agora, nome, navigate }) {
  const c = useMemo(() => {
    if (!dados) return null;
    const fila = filaDoFoco(dados, agora);
    const paradas = encomendasParadas(dados.entregas, hoje, dados.unidades);
    const taxas = taxasPagas(dados.festas, dados.churrasqueira);
    const reservas = [...dados.festas, ...dados.churrasqueira].filter((r) => !/cancel|recus/i.test(String(r.status ?? "")));
    const parReservas = contagem(reservas.map((r) => r.data_reserva));
    const parMudancas = contagem(dados.mudancas.filter((m) => !/cancel|recus/i.test(String(m.status ?? ""))).map((m) => m.data_mudanca));
    const tarefas = dados.tarefas
      .filter((t) => t.situacao !== CONCLUIDA)
      .map((t) => ({ ...t, prazo: classificarPrazo(t, agora) }))
      .filter((t) => t.prazo && (t.prazo.tom === "atrasada" || t.prazo.texto === "Hoje"));
    const parados = chamadosParados(dados.solicitacoes, agora);
    const serie = (pares, nomeDaSerie, rotulo, formatar, tom) => {
      const valores = porMesDoAno(pares, hoje);
      return { nome: nomeDaSerie, valores, total: soma(valores), variacao: noMesmoPeriodo(pares, hoje).noAno, rotulo, formatar, tom, anoPassado: Number(hoje.slice(0, 4)) - 1 };
    };
    const ano = hoje.slice(0, 4);
    return {
      fila,
      fora: fila.filter((i) => i.foraDoPrazo).length,
      paradas,
      aguardando: dados.entregas.filter(naPortaria).length,
      receitaMes: porMesDoAno(taxas, hoje),
      variacaoReceita: noMesmoPeriodo(taxas, hoje).noMes,
      ativas: reservasAtivas(dados, hoje),
      serieReservas: serieMensal(reservas.map((r) => r.data_reserva), hoje),
      serieEncomendas: serieDiaria(dados.entregas.map((e) => e.data_entrada), hoje, 14),
      carros: dados.vagas.filter((v) => v.possui_carro === "Sim").length,
      serieCarros: acumuladoPorMes(dados.vagas.filter((v) => v.possui_carro === "Sim").map((v) => v.created_at), hoje),
      motos: dados.vagas.filter((v) => v.possui_moto === "Sim").length,
      pendencias: pendenciasDaAdministracao({
        paradas, fila, chamadosParados: parados, tarefas,
        inadimplentes: dados.unidades.filter((u) => u.status === "Inadimplente").length,
      }),
      series: {
        receita: serie(taxas, "Receita", `Recebido em ${ano} · festas e churrasqueira`, emReais, "marca"),
        reservas: serie(parReservas, "Reservas", `Reservas em ${ano} · salão e churrasqueiras`, contar, "azul"),
        mudancas: serie(parMudancas, "Mudanças", `Mudanças em ${ano}`, contar, "laranja"),
      },
      dias: semanaDaCapa(compromissos(dados), hoje, 6),
      avisos: avisosDoDia({ fila, encomendasAmanha: encomendas(dados.entregas, hoje).vaoAmanha, chamadosParados: parados }),
      noticia: dados.noticias[0] ?? null,
      unidades: dados.unidades.length,
    };
  }, [dados, hoje, agora]);

  const carregando = !c;
  const n = c?.fila.length ?? null;
  const texto = carregando ? "Carregando os pedidos…"
    : n ? `${n === 1 ? "1 pedido do app esperando" : `${n} pedidos do app esperando`} aprovação${c.fora ? ` · ${c.fora} fora do prazo` : ""}. Comece pelo mais antigo.`
      : "Nenhum pedido do app esperando. Tudo em dia.";
  const ano = hoje.slice(0, 4);

  return (
    <div className="ic">
      <CapaDoDia nome={nome} avisos={c?.avisos ?? []}
        frase={`Aqui está o que importa hoje no Diduccio${c?.unidades ? ` · ${c.unidades} unidades` : ""}`} />

      <FaixaFoco numero={n} fracao={n ? (n - c.fora) / n : 1} texto={texto} grave={c ? ehGrave(n, c.fora) : false}
        botao={n ? "Revisar agora" : "Abrir Modo foco"} onClick={() => navigate("/modo-foco")} />

      <div className="ic-nums">
        <Numero ordem={1} Icone={Wallet} tom="marca" linhas={["Recebido", `em ${ano}`]} formatar={emReais}
          valor={c ? soma(c.receitaMes) : null} serie={c?.receitaMes}
          dica={c ? dicaDaVariacao(c.variacaoReceita, "festas e churrasqueira") : null} />
        <Numero ordem={2} Icone={CalendarCheck} tom="azul" linhas={["Reservas", "ativas"]}
          valor={c?.ativas.total ?? null} serie={c?.serieReservas}
          dica={c ? { texto: c.ativas.proxima ? `próxima em ${diaEMes(c.ativas.proxima)}` : "nenhuma marcada" } : null} />
        <Numero ordem={3} Icone={Package} tom="violeta" linhas={["Encomendas", "aguardando"]}
          valor={c?.aguardando ?? null} serie={c?.serieEncomendas}
          dica={c ? (c.paradas.length ? { tipo: "alerta", texto: `${c.paradas.length} há mais de 3 dias` } : { texto: "na portaria" }) : null} />
        <Numero ordem={4} Icone={Car} tom="laranja" linhas={["Carros", "registrados"]}
          valor={c?.carros ?? null} serie={c?.serieCarros}
          dica={c ? { texto: c.motos ? `e ${c.motos} ${c.motos === 1 ? "moto" : "motos"}` : "nenhuma moto" } : null} />
      </div>

      <div className="ic-grade">
        <Pendencias ordem={6} itens={c?.pendencias ?? []} carregando={carregando} onIr={navigate}
          vazio={{ titulo: "Nada pendente", texto: "Encomendas, pedidos do app e tarefas em dia." }}
          verTodas={<Link onClick={() => navigate("/confirmacao")}>Ver todas</Link>} />
        <Relatorios ordem={7} series={c?.series ?? {}} carregando={carregando} />
        <div className="ic-coluna">
          <ProximosDias ordem={8} dias={c?.dias} carregando={carregando}
            acao={<Link onClick={() => navigate("/calendario")}>Abrir agenda</Link>} />
          <FiquePorDentro ordem={9} onClick={() => navigate("/comunicado")} botao="Ver comunicados"
            texto={c?.noticia?.titulo ? `Último comunicado: “${c.noticia.titulo}”.` : "Confira os últimos comunicados do condomínio."} />
        </div>
      </div>

      {/* A segunda assinatura: abre as letras aqui embaixo depois que a da capa
          recolhe. Fica no respiro que já existe: não aumenta a página. */}
      <div className="ic-assinatura"><AssinaturaDaEmpresa /></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Portaria({ dados, hoje, nome, navigate }) {
  const c = useMemo(() => {
    if (!dados) return null;
    const paradas = encomendasParadas(dados.entregas, hoje, dados.unidades);
    // Sem o 0083 aplicado, as contagens saem das encomendas que a tela já tem.
    const porDia = dados.porDia;
    const pares = (campo) => (porDia ?? []).map((r) => ({ dia: String(r.dia).slice(0, 10), valor: Number(r[campo]) || 0 }));
    const parEntradas = porDia ? pares("entradas") : null;
    const parEncomendas = porDia ? pares("encomendas") : contagem(dados.entregas.map((e) => e.data_entrada));
    const parRetiradas = porDia ? pares("retiradas")
      : contagem(dados.entregas.filter((e) => String(e.status ?? "") === "Entregue").map((e) => e.data_saida));
    const noDia = (lista, dia) => soma(lista.filter((p) => p.dia === dia).map((p) => p.valor));
    const ultimos = (lista, n) => Array.from({ length: n }, (_, i) => noDia(lista, somarDias(hoje, i - (n - 1))));
    const retHoje = porDia ? noDia(parRetiradas, hoje) : retiradasNoDia(dados.entregas, hoje);
    const retOntem = noDia(parRetiradas, somarDias(hoje, -1));
    const serie = (lista, nomeDaSerie, rotulo, tom) => {
      if (!lista) return { nome: nomeDaSerie, valores: [], total: null, variacao: null, rotulo, formatar: contar, tom };
      const valores = porMesDoAno(lista, hoje);
      return { nome: nomeDaSerie, valores, total: soma(valores), variacao: noMesmoPeriodo(lista, hoje).noAno, rotulo, formatar: contar, tom, anoPassado: Number(hoje.slice(0, 4)) - 1 };
    };
    const ano = hoje.slice(0, 4);
    const enc = encomendas(dados.entregas, hoje);
    return {
      paradas,
      aguardando: dados.entregas.filter(naPortaria).length,
      entradasMes: parEntradas ? porMesDoAno(parEntradas, hoje) : null,
      variacaoEntradas: parEntradas ? noMesmoPeriodo(parEntradas, hoje).noMes : null,
      dentro: dados.abertas.length,
      quem: quemEstaDentro(dados.abertas),
      serieEncomendas: serieDiaria(dados.entregas.map((e) => e.data_entrada), hoje, 14),
      retHoje, diferenca: retHoje - retOntem, serieRetiradas: ultimos(parRetiradas, 8),
      pendencias: pendenciasDaPortaria(paradas),
      // Entradas e Saídas primeiro: é a aba que abre para o porteiro.
      series: {
        entradas: serie(parEntradas, "Entradas e Saídas", `Entradas em ${ano} · visitantes, prestadores e entregadores`, "azul"),
        encomendas: serie(parEncomendas, "Encomendas", `Encomendas recebidas em ${ano}`, "violeta"),
      },
      dias: semanaDaCapa(compromissosDaPortaria(dados.agenda), hoje, 6),
      avisos: avisosDoDia({ encomendasAmanha: enc.vaoAmanha }),
    };
  }, [dados, hoje]);

  const carregando = !c;
  const n = c?.paradas.length ?? null;
  const ano = hoje.slice(0, 4);
  const texto = carregando ? "Carregando as encomendas…"
    : n ? `${n === 1 ? "1 encomenda esperando" : `${n} encomendas esperando`} há mais de 3 dias. Avise os moradores pelo app.`
      : "Nenhuma encomenda parada. Tudo em dia.";
  const dif = c?.diferenca ?? 0;

  return (
    <div className="ic">
      <CapaDoDia nome={nome} avisos={c?.avisos ?? []} frase="Aqui está o que importa hoje na portaria do Diduccio" />

      {/* O anel mostra que parte das encomendas na portaria está parada. */}
      <FaixaFoco numero={n} fracao={n ? n / Math.max(n, c.aguardando) : 1} texto={texto}
        grave={c ? ehGrave(n, c.paradas.filter((e) => e.dias >= 5).length) : false}
        botao={n ? "Ver encomendas" : "Ver detalhes"} onClick={() => navigate("/encomendas")} />

      <div className="ic-nums">
        <Numero ordem={1} Icone={LogIn} tom="azul" linhas={["Entradas", `em ${ano}`]}
          valor={c?.entradasMes ? soma(c.entradasMes) : null} serie={c?.entradasMes}
          dica={c ? (c.entradasMes ? dicaDaVariacao(c.variacaoEntradas, "visitantes, prestadores e entregadores") : { texto: "aguardando a atualização do banco" }) : null} />
        <Numero ordem={2} Icone={DoorOpen} tom="marca" linhas={["Dentro", "agora"]}
          valor={c?.dentro ?? null}
          dica={c ? { texto: c.dentro ? `entradas ativas · ${c.quem}` : "ninguém dentro agora" } : null} />
        <Numero ordem={3} Icone={Package} tom="violeta" linhas={["Encomendas", "aguardando"]}
          valor={c?.aguardando ?? null} serie={c?.serieEncomendas}
          dica={c ? (c.paradas.length ? { tipo: "alerta", texto: `${c.paradas.length} há mais de 3 dias` } : { texto: "na portaria" }) : null} />
        <Numero ordem={4} Icone={PackageCheck} tom="laranja" linhas={["Retiradas", "hoje"]}
          valor={c?.retHoje ?? null} serie={c?.serieRetiradas}
          dica={c ? (dif ? { tipo: dif > 0 ? "sobe" : "desce", texto: `${dif > 0 ? "+" : ""}${dif} que ontem` } : { texto: "igual a ontem" }) : null} />
      </div>

      <div className="ic-grade">
        <Pendencias ordem={6} itens={c?.pendencias ?? []} carregando={carregando} onIr={navigate}
          vazio={{ titulo: "Nenhuma encomenda parada", texto: "Todas foram retiradas em até 3 dias." }}
          verTodas={<Link onClick={() => navigate("/encomendas")}>Ver encomendas</Link>} />
        <Relatorios ordem={7} series={c?.series ?? {}} carregando={carregando} />
        <div className="ic-coluna">
          {/* Sem "Abrir agenda": o porteiro não abre o Calendário. */}
          <ProximosDias ordem={8} dias={c?.dias} carregando={carregando} />
          <FiquePorDentro ordem={9} Icone={Package} onClick={() => navigate("/encomendas")} botao="Ver encomendas"
            texto="Confira as últimas encomendas do condomínio." />
        </div>
      </div>

      {/* A segunda assinatura: abre as letras aqui embaixo depois que a da capa
          recolhe. Fica no respiro que já existe: não aumenta a página. */}
      <div className="ic-assinatura"><AssinaturaDaEmpresa /></div>
    </div>
  );
}
