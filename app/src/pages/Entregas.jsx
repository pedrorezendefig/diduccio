import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, LogOut, Trash2, UserPlus, Users, Pencil, Check, X, Eye,
  DoorOpen, PackageCheck, Minus, Plus, Timer, CarFront, AlertTriangle,
  Tag, IdCard, Building2, Wrench, CalendarCheck,
} from "lucide-react";
import { listar, listarTudo, listarChegadas, buscarUm, criar, editar, remover } from "../api/db";
import { can } from "../auth/permissions";
import {
  TIPOS, MINUTOS_PADRAO, PASSO_MINUTOS, ajustarMinutos, daJanelaDeHoje,
  ehServicoInterno, emMaiusculo, estaDentro, filtrarHistorico, fimDoDia, formatarDuracao,
  padronizarNome,
  hojeEmBrasilia, inicioDoDia, minutosIniciais, minutosRestantes, pedeEmpresa,
  pedePlaca, podeSerIlimitado, problemasDaEntrada, rotuloDoTipo, semRelogio,
  semVeiculo, temPrazo, veiculoPadrao,
  temVeiculoGuardado, unirChegadas, veiculosDoTipo,
} from "../lib/portaria";
import MapaDaPortaria from "../components/MapaDaPortaria";
import JanelaDaTemporada from "../components/temporada/JanelaDaTemporada";
import AvisoDaTemporada from "../components/temporada/AvisoDaTemporada";
import { descreverCarro, esperadasHoje, veiculosDa } from "../lib/temporada";
import {
  Chave, Ficha, Filtros, Iniciais, MaisFiltros, Opcoes, PainelDeFiltros, Placa,
} from "../components/app/pecas";
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import {
  Button, Badge, Tabs, Modal, Field, Input, Select, Checkbox, Stat,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";

/** Quantas linhas a lista mostra de cada vez; "Mostrar mais" soma outras tantas. */
const LOTE = 30;

/**
 * Teto de linhas do histórico numa busca.
 *
 * O PostgREST devolve no máximo mil por requisição por padrão; duas mil pede
 * uma configuração de projeto que não vale a pena para esta tela. Um período
 * que estoure isto é sinal de que o recorte está largo demais, e a tela diz
 * exatamente isso em vez de cortar calada.
 */
const LIMITE_HISTORICO = 1000;

/** Quantas pessoas a janela de cadastro desenha de uma vez. A busca vê todas. */
const MAX_NA_JANELA = 200;

const soDigitos = (s) => String(s ?? "").replace(/\D/g, "");
// Timestamptz do Postgres ("2026-02-18T20:23:13+00:00") -> "17:23" em Brasília.
// Antes chegava já formatado do Apps Script como "18/02/2026 17:23", e a função
// só cortava a data — daí a aparência de que só mudou o miolo.
// O módulo de encomendas é o trabalho do porteiro: pelas políticas do 0015 ele
// lê e escreve. Quem cai aqui sem permissão é o conselheiro, e a mensagem do
// Postgres fala de row-level security, que não diz nada a quem está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível registrar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para registrar chegadas.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

const soHora = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).trim();
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
  });
};

/** "18/02", para a coluna de dia do histórico. */
const soDia = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
  });
};

/** Um dia relativo a hoje, em "AAAA-MM-DD" de Brasília. Alimenta os <input type=date>. */
const diaDeHoje = (deslocamento) =>
  hojeEmBrasilia(Date.now() + deslocamento * 86400000);

const norm = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function formatarCpf(dig) {
  const d = soDigitos(dig).slice(0, 11);
  let out = d.slice(0, 3);
  if (d.length > 3) out += "." + d.slice(3, 6);
  if (d.length > 6) out += "." + d.slice(6, 9);
  if (d.length > 9) out += "-" + d.slice(9, 11);
  return out;
}

/** "***.456.789-**": o meio fica, para conferir com o documento na mao. */
function mascararCpf(dig) {
  const d = soDigitos(dig);
  if (d.length !== 11) return d ? "***" : "";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Como cada pendência do `problemasDaEntrada` aparece no crachá. */
const FALTA = {
  tipo: "tipo", cpf: "CPF", nome: "nome", unidade: "unidade", liberadoPor: "quem liberou",
  veiculo: "veículo", placa: "placa", empresa: "empresa", minutos: "tempo",
};

/** Uma linha da ficha: o nome do grupo à esquerda, os campos à direita. */
function SecaoDaFicha({ Icone, titulo, nota, children }) {
  return (
    <div className="ent-ficha__secao">
      <header className="ent-ficha__rotulo">
        <b><Icone size={16} aria-hidden="true" />{titulo}</b>
        {nota ? <small>{nota}</small> : null}
      </header>
      <div className="ent-ficha__corpo">{children}</div>
    </div>
  );
}

/**
 * O crachá da entrada, montado enquanto o porteiro preenche.
 *
 * É a conferência antes de gravar: nome, apartamento em letra grande, placa e
 * tempo num olhar. O botão mora aqui, e embaixo dele a lista do que falta.
 */
function Cracha({
  hora, nome, tipo, empresa, destino, liberadoPor, veiculo, placa, modelo, tempo,
  faltam, erro, salvando, onRegistrar, onLimpar, soLeitura = false,
}) {
  const comoChegou = [veiculo, modelo].filter(Boolean).join(" · ");
  return (
    <aside className="ent-cracha" aria-label="Crachá da entrada">
      <div className="ent-cracha__faixa"><span>ENTRADA</span><span>{hora}</span></div>
      <div className="ent-cracha__corpo">
        <div>
          <p className={`ent-cracha__nome${nome ? "" : " ent-cracha__nome--vazio"}`}>
            {nome || "Nome de quem entra"}
          </p>
          <p className="ent-cracha__tipo">{[tipo, empresa].filter(Boolean).join(" · ")}</p>
        </div>

        <div className="ent-cracha__destino">
          <span>
            <small>Vai para</small>
            <b>{destino || "—"}</b>
          </span>
          <Building2 size={20} aria-hidden="true" />
        </div>
        {liberadoPor ? <p className="ent-cracha__linha">Liberado por <b>{liberadoPor}</b></p> : null}

        {placa ? (
          <span className="ent-cracha__placa" aria-label={`Placa ${placa}`}>
            <i>BRASIL</i><b>{placa}</b>
          </span>
        ) : null}
        {comoChegou ? <p className="ent-cracha__linha"><CarFront size={14} aria-hidden="true" />{comoChegou}</p> : null}

        <p className="ent-cracha__tempo"><Timer size={15} aria-hidden="true" />{tempo}</p>

        {!soLeitura && (
          <>
            {erro ? <p className="vit-field__error">{erro}</p> : null}
            <Button variant="primary" onClick={onRegistrar} loading={salvando} iconLeft={<UserPlus size={16} />}>
              Registrar chegada
            </Button>
            <p className={`ent-cracha__falta${faltam.length ? "" : " ent-cracha__falta--ok"}`}>
              {faltam.length ? `Falta: ${faltam.join(", ")}` : "Tudo pronto para registrar"}
            </p>
            <Button variant="ghost" size="sm" onClick={onLimpar}>Limpar</Button>
          </>
        )}
      </div>
    </aside>
  );
}

export default function Entregas({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();

  const [entregadores, setEntregadores] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [chegadas, setChegadas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [tipo, setTipo] = useState(TIPOS[0].id);
  const [empresa, setEmpresa] = useState("");
  // Prestador do proprio condominio: sem apartamento de destino, e quem libera
  // e o porteiro de plantao.
  const [doCondominio, setDoCondominio] = useState(false);
  const [minutos, setMinutos] = useState(MINUTOS_PADRAO);
  // Visita que fica o tempo que precisar. Nasce desmarcada a cada entrada:
  // herdar isto da pessoa anterior seria liberar sem prazo por engano.
  const [ilimitado, setIlimitado] = useState(false);
  // Quem o CPF reconheceu, esperando a confirmacao do veiculo. Enquanto houver
  // alguem aqui, o aviso esta na tela.
  const [conferirVeiculo, setConferirVeiculo] = useState(null);
  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState("");
  const [jaCadastrado, setJaCadastrado] = useState(false);
  const [veiculo, setVeiculo] = useState(() => veiculoPadrao(TIPOS[0].id));
  const [placa, setPlaca] = useState("");
  // Como o veiculo e, em texto livre ("Honda CG vermelha, bau do iFood"). Nao
  // e obrigatorio: e o que ajuda a reconhecer o carro parado la dentro.
  const [modelo, setModelo] = useState("");
  const [buscaUnidade, setBuscaUnidade] = useState("");
  const [unidadeSel, setUnidadeSel] = useState(null);
  const [focoUnidade, setFocoUnidade] = useState(false);
  const [liberadoPor, setLiberadoPor] = useState("");
  const [erro, setErro] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [saindoId, setSaindoId] = useState(null);

  // "hoje" mostra tudo o que chegou; "dentro" mostra so quem ainda nao saiu, e
  // e a unica das duas que desenha o mapa. O padrao e "hoje" porque ela contem
  // a outra: quem esta dentro aparece la com o selo "dentro". O contrario
  // esconderia metade do dia.
  const [aba, setAba] = useState("hoje");
  // Quem o porteiro apontou no mapa. O mapa responde "tem alguem no bloco 3", e
  // a linha marcada responde a pergunta seguinte, que e sempre "quem, e ha
  // quanto tempo".
  const [destacada, setDestacada] = useState(null);

  // O historico e outra consulta, e so acontece quando alguem abre a aba: sao
  // meses de linhas, e carregar isso a toa em toda abertura da tela custaria
  // caro para o porteiro, que nem ve a aba.
  const [historico, setHistorico] = useState([]);
  // Comeca carregando: sem isso, o primeiro quadro depois de clicar na aba
  // mostra "nada neste recorte" antes de a busca sair.
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [versaoHistorico, setVersaoHistorico] = useState(0);
  const [filtros, setFiltros] = useState(() => ({
    // Abre nos ultimos 30 dias em vez de vazio: filtro que exige preenchimento
    // para mostrar alguma coisa faz a tela abrir vazia e parecer quebrada.
    entradaDe: diaDeHoje(-29),
    entradaAte: diaDeHoje(0),
    saidaDe: "", saidaAte: "", busca: "", situacao: "", tipo: "", unidade: "",
  }));
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [vendo, setVendo] = useState(null);
  const [limite, setLimite] = useState(LOTE);
  const mostraHistorico = can(user, "verHistoricoPortaria");
  // O porteiro ve o historico com o CPF coberto: para o turno dele basta o
  // nome; o numero inteiro de meses de visitantes fica com a administracao.
  const cpfMascarado = !can(user, "verCpfNoHistorico");

  const [modalCadastro, setModalCadastro] = useState(false);
  // Temporada (0091): as liberações que a administração faz antes, e a que o
  // porteiro usou para preencher o crachá desta entrada.
  const [temporadas, setTemporadas] = useState([]);
  const [carregandoTemporadas, setCarregandoTemporadas] = useState(true);
  const [janelaTemporada, setJanelaTemporada] = useState(false);
  const [temporadaUsada, setTemporadaUsada] = useState(null);
  const [filtroCadastro, setFiltroCadastro] = useState("");
  const [editCpf, setEditCpf] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [excluindoCpf, setExcluindoCpf] = useState(null);

  const campoUnidadeRef = useRef(null);
  // O CPF que esta no campo agora. A busca no banco e assincrona: se a resposta
  // chega depois de o porteiro ter trocado o CPF, ela nao pode preencher o
  // formulario de outra pessoa.
  const cpfDigitadoRef = useRef("");

  // Um relogio so para a tela inteira, batendo a cada 30s. Sem ele a contagem
  // congela no valor do carregamento e a coluna passa a mentir devagar.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // O cadastro inteiro por CPF, e nao so o nome: agora ele guarda tambem o
  // veiculo e a placa da ultima entrada, que e o que a tela preenche sozinha.
  const indiceCpf = useMemo(() => {
    const m = new Map();
    entregadores.forEach((e) => m.set(soDigitos(e.cpf), e));
    return m;
  }, [entregadores]);

  /**
   * As chegadas do dia da portaria: DUAS perguntas ao banco, não uma.
   *
   * "As de hoje" sozinho perderia quem entrou ontem e ainda está aqui — e essa
   * pessoa e a mais importante da tela, porque ninguem sabe que ela esta la. "As
   * abertas" sozinho perderia quem entrou e saiu hoje de manha. As duas juntas
   * dao a lista certa, e cada uma é uma consulta pequena e indexada.
   *
   * Antes isto puxava a tabela inteira e peneirava aqui. Funcionava com tres
   * linhas; com mais de mil, o PostgREST devolve um pedaco qualquer, e a tela
   * ficaria vazia sem erro nenhum.
   */
  const carregarChegadas = async () => {
    try {
      const inicioDeHoje = new Date();
      inicioDeHoje.setHours(0, 0, 0, 0);
      const [deHoje, abertas] = await Promise.all([
        listarChegadas({ desde: inicioDeHoje.toISOString() }),
        listarChegadas({ abertas: true }),
      ]);
      setChegadas(unirChegadas(deHoje, abertas));
    } catch {
      setChegadas([]);
    }
  };

  // As liberações de temporada. Sem a tabela (0091 ainda não aplicada) a lista
  // fica vazia e o resto da portaria segue: não é motivo de derrubar a tela.
  const carregarTemporadas = async () => {
    try {
      const t = await listar("TEMPORADAS");
      setTemporadas(Array.isArray(t) ? t : []);
    } catch {
      setTemporadas([]);
    } finally {
      setCarregandoTemporadas(false);
    }
  };

  // Cadastro e unidades quase não mudam: carregados uma vez e mantidos em cache.
  useEffect(() => {
    carregarTemporadas();
    (async () => {
      setCarregando(true);
      try {
        const [ent, uni] = await Promise.all([
          // Inteiro, e nao as primeiras mil: e nele que o CPF e reconhecido e
          // que a janela de cadastro busca.
          listarTudo("ENTREGADORES"),
          listar("UNIDADES"),
        ]);
        setEntregadores(Array.isArray(ent) ? ent : []);
        setUnidades(Array.isArray(uni) ? uni.filter((u) => u.bloco && u.unidade) : []);
      } catch {
        setEntregadores([]);
        setUnidades([]);
        toast.error("Não foi possível carregar o cadastro de quem entra.");
      }
      await carregarChegadas();
      setCarregando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * O historico, so quando alguem abre a aba.
   *
   * O recorte de DATA vai para o banco; busca, situacao e tipo ficam aqui.
   * Mandar cada tecla digitada para o servidor renderia uma requisicao por
   * letra, e o recorte de data ja reduziu o conjunto ao que cabe na memoria.
   *
   * `cancelado` protege contra a resposta antiga chegar depois da nova quando
   * as datas mudam duas vezes seguidas — sem isso a tela pisca com o resultado
   * do filtro anterior e fica nele.
   */
  useEffect(() => {
    if (aba !== "historico") return undefined;
    let cancelado = false;
    (async () => {
      setCarregandoHistorico(true);
      try {
        const dados = await listarChegadas({
          desde: inicioDoDia(filtros.entradaDe),
          ate: fimDoDia(filtros.entradaAte),
          limite: LIMITE_HISTORICO,
        });
        if (!cancelado) setHistorico(dados);
      } catch {
        if (!cancelado) setHistorico([]);
      } finally {
        if (!cancelado) setCarregandoHistorico(false);
      }
    })();
    return () => { cancelado = true; };
  }, [aba, filtros.entradaDe, filtros.entradaAte, versaoHistorico]);

  const mudarFiltro = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const limparFiltros = () => setFiltros({
    entradaDe: diaDeHoje(-29), entradaAte: diaDeHoje(0),
    saidaDe: "", saidaAte: "", busca: "", situacao: "", tipo: "", unidade: "",
  });

  // Fecha a lista de sugestões ao clicar fora.
  useEffect(() => {
    const fora = (e) => {
      if (campoUnidadeRef.current && !campoUnidadeRef.current.contains(e.target)) {
        setFocoUnidade(false);
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  /**
   * O CPF e a chave de tudo.
   *
   * Reconhecido, o formulario se preenche sozinho — e a tela PERGUNTA se o
   * veiculo continua sendo o mesmo. Preencher placa antiga em silencio seria
   * pior que campo vazio: o porteiro confere o que ja esta escrito e libera um
   * carro que nao e aquele.
   */
  const aoDigitarCpf = (valor) => {
    const dig = soDigitos(valor).slice(0, 11);
    setCpf(dig);
    cpfDigitadoRef.current = dig;
    setErro((e) => ({ ...e, cpf: undefined }));

    const registro = dig.length === 11 ? indiceCpf.get(dig) : null;
    if (!registro) {
      setJaCadastrado(false);
      if (!dig) { setNome(""); setEmpresa(""); }
      // Fora da lista carregada ao abrir nao quer dizer fora do banco: outro
      // porteiro pode ter cadastrado a pessoa depois. Pergunta pelo CPF antes
      // de tratar como novo.
      if (dig.length === 11) {
        buscarUm("ENTREGADORES", "cpf", dig)
          .then((achado) => {
            if (!achado || cpfDigitadoRef.current !== dig) return;
            setEntregadores((prev) => (prev.some((x) => soDigitos(x.cpf) === dig) ? prev : [...prev, achado]));
            preencherCom(achado);
          })
          .catch(() => {});
      }
      return;
    }

    preencherCom(registro);
  };

  /** O formulario de quem o CPF reconheceu. */
  const preencherCom = (registro) => {
    setJaCadastrado(true);
    setNome(padronizarNome(registro.nome));
    if (registro.empresa) setEmpresa(registro.empresa);

    if (temVeiculoGuardado(registro)) {
      setVeiculo(registro.veiculo);
      setPlaca(String(registro.placa || "").toUpperCase());
      setModelo(registro.modelo || "");
      setConferirVeiculo(registro);
    }
  };

  /** "Sim, e esse mesmo": nada muda, so fecha o aviso. */
  const confirmarVeiculo = () => setConferirVeiculo(null);

  /**
   * "Nao, e outro": apaga SO veiculo, placa e modelo.
   *
   * CPF e nome ficam — sao da pessoa e nao mudaram. Foi o pedido, e e o certo:
   * manter o veiculo velho ali convidaria a salvar o dado errado sem perceber.
   */
  const trocarVeiculo = () => {
    setVeiculo("");
    setPlaca("");
    setModelo("");
    setConferirVeiculo(null);
  };

  /**
   * Busca por digitação em vez de select: o porteiro digita "5205" e acha
   * bloco 5 apto 205 na hora. A forma concatenada é o atalho que ele usa
   * dezenas de vezes por turno; um select o obrigaria a rolar 128 opções.
   */
  const sugestoes = useMemo(() => {
    if (unidadeSel || !buscaUnidade.trim()) return [];
    const termos = norm(buscaUnidade).split(/\s+/).filter(Boolean);
    return unidades
      .filter((u) => {
        const alvo = norm(
          `${u.bloco}${u.unidade} ${u.bloco} ${u.unidade} bloco ${u.bloco} apto ${u.unidade}`
        );
        return termos.every((t) => alvo.includes(t));
      })
      .slice(0, 8);
  }, [buscaUnidade, unidadeSel, unidades]);

  const selecionarUnidade = (u) => {
    setUnidadeSel(u);
    setBuscaUnidade(`Bloco ${u.bloco} · Apto ${u.unidade}`);
    setFocoUnidade(false);
    setErro((e) => ({ ...e, unidade: undefined }));
  };

  const exigePlaca = pedePlaca(veiculo);
  // Vazio nao e "veio a pe": e "ninguem escolheu ainda", e e o estado em que o
  // formulario fica depois de o porteiro dizer "nao, e outro" na conferencia.
  const faltaVeiculo = semVeiculo(veiculo);

  /** O porteiro que esta com a tela aberta. E ele quem libera o servico interno. */
  const nomeDoPorteiro = user?.nome || user?.email || "";

  /** Servico do proprio predio: sem unidade de destino, liberado pelo porteiro. */
  const interno = ehServicoInterno({ tipo, doCondominio });

  const limparFormulario = () => {
    setCpf(""); setNome(""); setJaCadastrado(false);
    cpfDigitadoRef.current = "";
    setVeiculo(veiculoPadrao(tipo)); setPlaca(""); setModelo("");
    setBuscaUnidade(""); setUnidadeSel(null);
    setLiberadoPor(""); setErro({});
    setEmpresa(""); setConferirVeiculo(null);
    setDoCondominio(false);
    // O tipo NAO volta ao padrao: quem esta registrando dez entregadores
    // seguidos nao quer reescolher "Entregador" a cada um.
    setMinutos(minutosIniciais(tipo) ?? MINUTOS_PADRAO);
    setIlimitado(false);
    setTemporadaUsada(null);
  };

  /**
   * O porteiro usou uma liberação de temporada: unidade, quem liberou e o
   * carro vão para o crachá. O nome só entra se ninguém digitou nem o CPF
   * trouxe: quem chega pode ser outro hóspede, e o CPF manda.
   */
  const usarTemporada = (t, v, pessoa) => {
    // Quem chega é quem casou com o CPF digitado (responsável ou acompanhante);
    // sem CPF digitado, o do responsável entra — é ele que reconhece quem já
    // veio e preenche o nome do cadastro.
    if (!cpf && t.cpf) aoDigitarCpf(String(t.cpf));
    const u = unidades.find((x) => String(x.id) === String(t.id_unidade));
    if (u) selecionarUnidade(u);
    if (!jaCadastrado && !nome.trim()) setNome(emMaiusculo((pessoa?.nome ?? t.hospede) || ""));
    // "Liberado por" é o dono do apartamento, gravado na liberação (0094).
    // Liberação antiga, sem ele: o campo fica vazio para o porteiro escrever.
    if (t.proprietario) setLiberadoPor(padronizarNome(t.proprietario));
    // O carro: o que casou com a placa; achada pelo CPF, o da liberação (o
    // primeiro, se houver mais de um — o porteiro troca se for outro).
    const carro = v ?? veiculosDa(t)[0];
    if (carro) {
      setVeiculo("Carro");
      setPlaca(String(carro.placa).toUpperCase());
      setModelo(descreverCarro(carro));
    }
    setErro((e) => ({ ...e, unidade: undefined, liberadoPor: undefined }));
    setTemporadaUsada(t.id);
  };

  /** Na primeira entrada a liberação vira "hospedado". Falhar aqui não desfaz a entrada. */
  const marcarChegadaDaTemporada = async (id) => {
    const t = temporadas.find((x) => x.id === id);
    if (!t || t.situacao !== "agendada") return;
    const r = await editar("TEMPORADAS", id, { situacao: "hospedado", chegou_em: new Date().toISOString() }).catch(() => null);
    if (r?.success) carregarTemporadas();
  };

  /** Trocar de tipo redefine o prazo: e o tipo que decide se ha prazo. */
  const escolherTipo = (novo) => {
    setTipo(novo);
    setMinutos(minutosIniciais(novo) ?? MINUTOS_PADRAO);
    if (novo !== "AIRBNB") setTemporadaUsada(null);
    // Sair do visitante com a marca ligada deixaria o entregador seguinte sem
    // contagem — e sem nada na tela dizendo isso, porque a caixa nem aparece
    // nos outros tipos.
    if (!podeSerIlimitado(novo)) setIlimitado(false);
    // A marca de "do condominio" so existe em servico. Sair de servico com ela
    // ligada deixaria a entrada seguinte sem destino e sem ninguem explicando
    // por que — e o `check` do banco recusaria a gravacao.
    if (novo !== "SERVICO") setDoCondominio(false);
    // Caminhao so existe em servico. Saindo de la com ele escolhido, o <select>
    // ficaria com um valor que nao esta mais na lista: a tela mostraria "Moto"
    // e a gravacao mandaria "Caminhao".
    //
    // Sem cadastro, o veículo acompanha o tipo (motorista, visita e temporada
    // chegam de carro). Com cadastro, fica o que o CPF trouxe: é o veículo que
    // a pessoa usou da última vez, e a conferência já perguntou por ele.
    if (!jaCadastrado) setVeiculo(veiculoPadrao(novo));
    else if (!veiculosDoTipo(novo).includes(veiculo)) setVeiculo(veiculosDoTipo(novo)[0]);
    setErro((e) => ({ ...e, tipo: undefined, empresa: undefined, minutos: undefined }));
  };

  /**
   * A caixa "e do proprio condominio".
   *
   * Marcada, ela nao esconde so um campo: ela troca quem responde pela entrada.
   * O eletricista do elevador nao vai a apartamento nenhum, e nao ha morador
   * para autorizar — quem autoriza e o porteiro de plantao, e o nome dele entra
   * ali na hora, para o registro nao ficar sem responsavel.
   */
  const marcarInterno = (marcado) => {
    setDoCondominio(marcado);
    if (marcado) {
      setUnidadeSel(null);
      setBuscaUnidade("");
      if (nomeDoPorteiro) setLiberadoPor(nomeDoPorteiro);
      setErro((e) => ({ ...e, unidade: undefined, liberadoPor: undefined }));
      return;
    }
    // Desmarcou: o nome do porteiro sai, senao ele ficaria como "morador que
    // autorizou" numa entrada que agora tem destino de verdade.
    if (liberadoPor === nomeDoPorteiro) setLiberadoPor("");
  };

  const registrar = async () => {
    // Uma funcao so, compartilhada com o botao: quando a validacao do envio e
    // a do botao sao codigos diferentes, elas discordam no dia em que alguem
    // mexe numa delas.
    const e = problemasDaEntrada({
      tipo, cpf, nome, unidade: unidadeSel, liberadoPor, veiculo, placa, empresa,
      ilimitado,
      minutos, doCondominio,
    });
    setErro(e);
    if (Object.keys(e).length > 0) return;

    setSalvando(true);
    const eraNovo = !jaCadastrado;
    const cpfAtual = cpf;
    const nomeAtual = padronizarNome(nome);
    const unidadeAtual = interno ? null : unidadeSel;

    try {
      const quem = user?.nome || user?.email || "";

      // O CADASTRO GUARDA O VEICULO DESTA ENTRADA, sempre. E o que faz a tela
      // reconhecer a moto na proxima vez e perguntar se continua sendo ela.
      //
      // So as colunas do veiculo: desde o 0035 (e o modelo, desde o 0063) o
      // porteiro pode atualizar exatamente estas, e um `nome` no meio — ainda que igual ao que
      // ja esta la — faz o gatilho recusar o UPDATE inteiro.
      const dadosDoVeiculo = {
        veiculo: veiculo || null,
        placa: placa.trim().toUpperCase() || null,
        modelo: modelo.trim() || null,
        tipo,
        empresa: empresa.trim() || null,
      };
      const dadosDoCadastro = { nome: nomeAtual, ...dadosDoVeiculo };

      // Duas gravações, nesta ordem. Se o cadastro falhar, a chegada não é
      // registrada — melhor recusar do que soltar alguém no prédio sem que o
      // entregador exista no cadastro.
      let novoCadastro = null;
      let avisoDoCadastro = "";

      if (eraNovo) {
        const rc = await criar("ENTREGADORES", {
          cpf: cpfAtual, ...dadosDoCadastro, created_by: quem,
        });
        if (rc.success) {
          novoCadastro = rc.data;
        } else if (/duplicate key|already exists|23505/i.test(rc.message || "")) {
          // O CPF ja existe no banco, mas nao na lista que esta tela carregou
          // ao abrir: outro porteiro cadastrou essa pessoa depois. O indice
          // unico do 0034 recusa a segunda insercao, e com razao. Recarrega e
          // atualiza a linha que ja existe, em vez de barrar a entrada por um
          // detalhe que nao e do porteiro resolver.
          //
          // Pelo CPF, no banco: a lista desta tela e de quando ela abriu, e a
          // pessoa entrou no cadastro depois.
          const achado = await buscarUm("ENTREGADORES", "cpf", cpfAtual).catch(() => null);
          if (!achado?.id) {
            setErro({ geral: mensagemErro(rc.message) });
            return;
          }
          await editar("ENTREGADORES", achado.id, dadosDoVeiculo);
          novoCadastro = achado;
        } else {
          setErro({ geral: mensagemErro(rc.message) });
          return;
        }
      } else {
        // Sem isto, quem trocou de moto continuaria sendo perguntado sobre a
        // antiga para sempre, e a pergunta viraria ruido que se fecha no
        // automatico.
        const antigo = indiceCpf.get(cpfAtual);
        if (antigo?.id) {
          const ra = await editar("ENTREGADORES", antigo.id, dadosDoVeiculo);
          // Falhar aqui nao impede a entrada — mas tambem nao pode passar
          // calado: era assim antes do 0035, e o veiculo simplesmente nunca
          // era guardado sem que nada na tela dissesse isso.
          if (!ra.success) {
            avisoDoCadastro = "Entrada registrada, mas o veículo não foi guardado no cadastro.";
          }
        }
      }

      const res = await criar("ENTREGADORES_CHEGADAS", {
        cpf: cpfAtual,
        nome: nomeAtual,
        tipo,
        empresa: empresa.trim() || null,
        do_condominio: interno,
        // Nulo quando o tipo nao tem prazo: e assim que o banco entende
        // "sem limite".
        // `null` é o que o banco entende por "sem limite", e é o mesmo valor
        // que a temporada e o prestador já gravam. A tela lê isso e mostra
        // "sem limite" na coluna do prazo.
        minutos_permitidos:
          temPrazo(tipo) && !semRelogio({ tipo, ilimitado }) ? Number(minutos) : null,
        veiculo,
        placa: placa.trim().toUpperCase() || null,
        modelo: modelo.trim() || null,
        // As colunas são texto; `bloco` vem de unidades como número. Nulo no
        // servico do condominio: nao ha destino, e inventar um seria mentir no
        // registro que existe justamente para dizer aonde a pessoa foi.
        bloco: unidadeAtual ? String(unidadeAtual.bloco) : null,
        apartamento: unidadeAtual ? String(unidadeAtual.unidade) : null,
        liberado_por: liberadoPor.trim(),
        // Quem carimba a entrada é o relógio, não o formulário.
        horario_entrada: new Date().toISOString(),
        // O 0035 reescreve esta coluna com o nome tirado do token. Mandar daqui
        // continua valendo para as contas sem `usuario_id`.
        created_by: quem,
      });

      if (!res.success) {
        setErro({ geral: mensagemErro(res.message) });
        return;
      }

      // Injeta o novo entregador no cache local, sem rebaixar o cadastro
      // inteiro. Guarda o id que o banco gerou: é por ele que editar e excluir
      // encontram a linha.
      if (eraNovo) {
        setEntregadores((prev) => [
          ...prev,
          { id: novoCadastro?.id, cpf: cpfAtual, ...dadosDoCadastro },
        ]);
      } else {
        setEntregadores((prev) => prev.map((x) =>
          soDigitos(x.cpf) === cpfAtual ? { ...x, ...dadosDoVeiculo } : x
        ));
      }

      const temporadaDestaEntrada = temporadaUsada;
      limparFormulario();
      if (temporadaDestaEntrada) marcarChegadaDaTemporada(temporadaDestaEntrada);
      toast.success(
        (unidadeAtual
          ? `${nomeAtual} liberado para o bloco ${unidadeAtual.bloco}, apto ${unidadeAtual.unidade}`
          : `${nomeAtual} liberado · serviço do condomínio`)
        + (semRelogio({ tipo, ilimitado })
          ? " · sem limite de tempo"
          : temPrazo(tipo) ? ` · ${formatarDuracao(minutos)}` : "")
      );
      if (avisoDoCadastro) toast.info(avisoDoCadastro);
      carregarChegadas(); // em segundo plano: o formulário já fica livre
    } finally {
      setSalvando(false);
    }
  };

  const registrarSaida = async (c) => {
    setSaindoId(c.id);
    try {
      const res = await editar("ENTREGADORES_CHEGADAS", c.id, {
        horario_saida: new Date().toISOString(),
        // O 0035 reescreve esta coluna com o nome tirado do token — mandar
        // daqui e o que faz a coluna funcionar no modo demonstracao e nas
        // contas sem `usuario_id`.
        saida_por: nomeDoPorteiro,
      });
      if (!res.success) { toast.error(mensagemErro(res.message)); return; }
      await carregarChegadas();
      setVersaoHistorico((v) => v + 1);
      toast.success(`Saída de ${c.nome} registrada`);
    } finally {
      setSaindoId(null);
    }
  };

  const excluirChegada = async (c) => {
    const ok = await confirmar({
      title: `Excluir a chegada de ${c.nome}?`,
      description:
        (c.bloco ? `Bloco ${c.bloco}, apto ${c.apartamento}` : "Serviço do condomínio")
        + `, às ${soHora(c.horario_entrada)}. Não dá para desfazer.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const res = await remover("ENTREGADORES_CHEGADAS", c.id);
    if (!res.success) { toast.error(mensagemErro(res.message)); return; }
    await carregarChegadas();
    // O historico e outra consulta: sem isto a linha apagada continuaria la
    // ate alguem trocar de aba.
    setVersaoHistorico((v) => v + 1);
    toast.success("Chegada excluída");
  };

  const salvarEdicao = async (cpfDig) => {
    const novo = padronizarNome(editNome);
    if (!novo) return;
    // O Apps Script achava a linha pelo CPF; o Postgres edita por id. O id
    // vem da própria lista já carregada.
    const alvo = entregadores.find((e) => soDigitos(e.cpf) === cpfDig);
    if (!alvo?.id) { toast.error("Não encontrei essa pessoa no cadastro."); return; }

    const res = await editar("ENTREGADORES", alvo.id, { nome: novo });
    if (!res.success) { toast.error(mensagemErro(res.message)); return; }

    setEntregadores((prev) =>
      prev.map((e) => (soDigitos(e.cpf) === cpfDig ? { ...e, nome: novo } : e))
    );
    setEditCpf(null);
    setEditNome("");
    toast.success("Nome atualizado");
  };

  const excluirEntregador = async (e) => {
    const cpfDig = soDigitos(e.cpf);
    const ok = await confirmar({
      title: `Excluir ${e.nome} do cadastro?`,
      description: "As chegadas passadas dele continuam no histórico. Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;

    setExcluindoCpf(cpfDig);
    try {
      const res = await remover("ENTREGADORES", e.id);
      if (!res.success) { toast.error(mensagemErro(res.message)); return; }
      setEntregadores((prev) => prev.filter((x) => soDigitos(x.cpf) !== cpfDig));
      toast.success(`${e.nome} removido do cadastro`);
    } finally {
      setExcluindoCpf(null);
    }
  };

  // A busca roda no cadastro inteiro; a janela desenha so o comeco. Milhares de
  // linhas com botoes deixariam a janela lenta para abrir, e ninguem rola tudo
  // isso: digita parte do nome.
  const cadastroFiltrado = useMemo(() => {
    const q = norm(filtroCadastro);
    const lista = q
      ? entregadores.filter(
          (e) => norm(e.nome).includes(q) || soDigitos(e.cpf).includes(soDigitos(filtroCadastro))
        )
      : entregadores;
    return [...lista].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  }, [entregadores, filtroCadastro]);

  // Quem ainda nao saiu. Sai da mesma funcao que a lib usa para a contagem de
  // prazo — duas nocoes de "esta dentro" acabariam discordando.
  const dentro = useMemo(() => chegadas.filter(estaDentro), [chegadas]);
  const dentroAgora = dentro.length;

  // O que ainda falta para registrar, na mesma regra do envio: o crachá diz
  // isso antes do clique, em vez de o porteiro descobrir pelo erro vermelho.
  const faltam = Object.keys(problemasDaEntrada({
    tipo, cpf, nome, unidade: unidadeSel, liberadoPor, veiculo, placa, empresa,
    ilimitado, minutos, doCondominio,
  })).map((k) => FALTA[k] ?? k);
  // A meia-noite a lista vira, mas quem esta no predio nao sai dela: o hospede
  // que chegou sexta continua sendo trabalho da portaria no domingo.
  const deHoje = useMemo(() => daJanelaDeHoje(chegadas, agora), [chegadas, agora]);
  // Quantos ja passaram do tempo combinado. Alimenta o alerta do topo — e sai
  // do mesmo calculo da coluna de prazo e da cor do pino no mapa, para os tres
  // nunca discordarem.
  const estourados = useMemo(
    () => dentro.filter((c) => (minutosRestantes(c, agora) ?? 0) < 0).length,
    [dentro, agora]
  );
  const doHistorico = useMemo(
    () => filtrarHistorico(historico, filtros), [historico, filtros]
  );
  const linhas = aba === "dentro" ? dentro : aba === "historico" ? doHistorico : deHoje;

  /**
   * Clicou no pino do mapa: rola ate a linha da pessoa e marca ela.
   *
   * `id` no <tr> em vez de ref: a linha e criada pela Table a partir de uma
   * lista, e guardar uma ref por linha significaria um mapa de refs vivendo em
   * paralelo com os dados, so para achar um elemento que o DOM ja sabe achar.
   *
   * O quadro seguinte e de proposito — a marca precisa estar pintada antes de
   * rolar, senao o navegador rola para onde a linha estava.
   */
  const apontarNaLista = (chegada) => {
    setDestacada(chegada.id);
    // A linha pode estar depois do "Mostrar mais": abre a lista até ela.
    setLimite((n) => Math.max(n, linhas.length));
    requestAnimationFrame(() => {
      const alvo = document.getElementById(`chegada-${chegada.id}`);
      if (!alvo) return;
      const paradinho = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      alvo.scrollIntoView({ behavior: paradinho ? "auto" : "smooth", block: "center" });
    });
  };

  /** Trocar de aba apaga a marca: ela apontava para uma lista que saiu da tela. */
  const trocarAba = (nova) => {
    setAba(nova);
    setDestacada(null);
    setLimite(LOTE);
  };

  /**
   * Clicar fora desmarca.
   *
   * Sem isto a marca fica na tela para sempre, e meia hora depois ela aponta uma
   * pessoa que ninguem apontou — pior que nao marcar nada, porque parece
   * informacao.
   *
   * `pointerdown` e nao `click`: o clique num pino dispara os dois, e em
   * `pointerdown` da para reconhecer o pino e sair antes de apagar o que ele
   * acabou de escolher. So fica escutando enquanto ha marca.
   */
  useEffect(() => {
    if (destacada === null) return undefined;
    const fora = (e) => {
      if (e.target.closest?.(".mapa__pino")) return;
      setDestacada(null);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [destacada]);

  /* ---------------- lista de chegadas ---------------- */

  /** "restam 5 min", "10 min a mais", "Sem limite" ou "—". */
  const textoDoPrazo = (c) => {
    const restam = minutosRestantes(c, agora);
    if (restam === null) {
      // Sem prazo, ou ja saiu. Traco, e nao "0 min": sao coisas diferentes.
      return estaDentro(c) && !c.minutos_permitidos ? "Sem Limite" : "—";
    }
    return restam < 0 ? `${formatarDuracao(-restam)} a mais` : `restam ${formatarDuracao(restam)}`;
  };

  // Cada horario carrega o porteiro que o produziu, colado nele: duas colunas a
  // mais ("Registrado por", "Saida por") empurrariam a lista para a rolagem.
  // A entrada leva o dia em toda aba: "Dentro agora" tambem mostra o hospede
  // que entrou anteontem, e "17:23" sozinho o faria parecer de hoje.
  const celulasDaChegada = (c) => {
    const restam = minutosRestantes(c, agora);
    return [
      <span key="e" className="mud-quem">
        <b className="conf-dado__mono">{`${soDia(c.horario_entrada)} ${soHora(c.horario_entrada)}`.trim()}</b>
        {c.created_by ? <small>{c.created_by}</small> : null}
      </span>,
      <span key="t" className="ent-tipo-selo" data-tipo={c.tipo || "ENTREGADOR"}>
        {rotuloDoTipo(c.tipo || "ENTREGADOR")}
      </span>,
      <span key="q" className="mud-quem">
        <b>{c.nome}</b>
        <small>{aba === "historico" && cpfMascarado ? mascararCpf(c.cpf) : formatarCpf(c.cpf)}</small>
      </span>,
      // Sem bloco e servico do proprio condominio — nao e campo esquecido.
      <b key="d" className="conf-dado__mono">{c.bloco ? `B${c.bloco}-${c.apartamento}` : "condomínio"}</b>,
      <span key="v" className="mud-quem">
        <b>{c.veiculo}{c.placa ? <span className="ent-placa"> {c.placa}</span> : null}</b>
        {c.modelo || c.empresa ? <small>{[c.modelo, c.empresa].filter(Boolean).join(" · ")}</small> : null}
      </span>,
      <span key="p" className={restam !== null && restam < 0 ? "ent-prazo-estourado" : undefined}>
        {textoDoPrazo(c)}
      </span>,
      // No historico a saida leva o dia junto: o hospede de temporada sai dias
      // depois. Nas outras abas toda saida mostrada e de hoje.
      soHora(c.horario_saida) ? (
        <span key="s" className="mud-quem">
          <b className="conf-dado__mono">
            {aba === "historico" ? `${soDia(c.horario_saida)} ${soHora(c.horario_saida)}` : soHora(c.horario_saida)}
          </b>
          {c.saida_por ? <small>{c.saida_por}</small> : null}
        </span>
      ) : <Badge key="s" tone="brand">dentro</Badge>,
    ];
  };

  // As pílulas do histórico contam com tudo aplicado menos a própria situação.
  const contagemHistorico = useMemo(() => {
    const base = filtrarHistorico(historico, { ...filtros, situacao: "" });
    const saiu = base.filter((c) => soHora(c.horario_saida)).length;
    return { todas: base.length, saiu, dentro: base.length - saiu };
  }, [historico, filtros]);

  const filtrosDoPainel = [
    filtros.unidade,
    filtros.tipo,
    filtros.saidaDe || filtros.saidaAte,
    filtros.entradaDe !== diaDeHoje(-29) || filtros.entradaAte !== diaDeHoje(0),
  ].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Entradas e Saídas"
        meta={
          carregando
            ? "Carregando chegadas"
            : `${dentroAgora} dentro agora · ${deHoje.length} chegadas hoje · ${entregadores.length} cadastrados`
        }
        actions={
          <>
            {/* As liberações de temporada da administração (0091). O número
                é quantas chegam hoje: é o que o porteiro precisa saber ao
                abrir o turno. */}
            <Button onClick={() => setJanelaTemporada(true)} iconLeft={<CalendarCheck size={15} />}>
              Temporada
              {esperadasHoje(temporadas, hojeEmBrasilia(agora)).length > 0 && (
                <span className="tem-botao__conta">{esperadasHoje(temporadas, hojeEmBrasilia(agora)).length}</span>
              )}
            </Button>
            <Button onClick={() => setModalCadastro(true)} iconLeft={<Users size={15} />}>
              Cadastrados
            </Button>
          </>
        }
      />

      <div className="ent-indicadores">
        {/* O alerta fica no indicador do topo porque é lá que o olho cai ao
            abrir a tela, e "alguém passou do tempo" é a única coisa desta
            página que pede ação AGORA. O símbolo não pisca: quem pisca é o pino
            no mapa, e dois piscares na mesma tela deixam de significar urgência.
            O número embaixo é o que carrega o sentido — símbolo sozinho não diz
            quantos, nem é lido por quem usa leitor de tela. */}
        <Stat
          label={
            estourados > 0 ? (
              <span className="ent-stat-alerta">
                <AlertTriangle size={13} aria-hidden="true" />
                Dentro agora
              </span>
            ) : "Dentro agora"
          }
          value={carregando ? "…" : dentroAgora}
          tone={estourados > 0 ? "danger" : "brand"}
          hint={
            estourados > 0
              ? `${estourados} ${estourados === 1 ? "passou" : "passaram"} do tempo`
              : undefined
          }
        />
        <Stat label="Chegadas hoje" value={carregando ? "…" : deHoje.length} tone="neutral" />
      </div>

      {/* ---- Registro de chegada ----
          Uma ficha em seções, na ordem da conversa no portão: o tipo (que
          decide o resto), a pessoa, para onde vai, como chegou e por quanto
          tempo. Ao lado, o crachá se monta com o que já foi preenchido, e o
          botão de registrar fica nele, dizendo o que falta. */}
      <div className="ent-registro">
        <section className="ent-ficha" aria-labelledby="ent-ficha-titulo">
          <h2 className="ent-form__titulo" id="ent-ficha-titulo">
            <DoorOpen size={17} aria-hidden="true" /> Registrar chegada
          </h2>

          <SecaoDaFicha Icone={Tag} titulo="Tipo" nota="Decide prazo, empresa e veículos">
            {/* O TIPO VEM PRIMEIRO porque decide o resto do formulario: se pede
                empresa, se tem prazo, e o que o botao vai cobrar. Escolher depois
                de preencher faria campos aparecerem e sumirem embaixo do dedo. */}
            <div className="ent-tipos" role="radiogroup" aria-label="Tipo de entrada">
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tipo === t.id}
                  className={`ent-tipo${tipo === t.id ? " ent-tipo--ativo" : ""}`}
                  onClick={() => escolherTipo(t.id)}
                >
                  <strong>{t.rotulo}</strong>
                  <span>{t.nota}</span>
                </button>
              ))}
            </div>
          </SecaoDaFicha>

          <SecaoDaFicha Icone={IdCard} titulo="Pessoa" nota="O CPF reconhece quem já veio">
            <div className="ent-ficha__campos">
              <Field
                label="CPF"
                required
                error={erro.cpf}
                help={jaCadastrado ? "Já cadastrado — nome e veículo preenchidos." : "Só números"}
              >
                <Input
                  value={formatarCpf(cpf)}
                  inputMode="numeric"
                  autoFocus
                  placeholder="000.000.000-00"
                  onChange={(e) => aoDigitarCpf(e.target.value)}
                />
              </Field>

              {/* Nao "nome do entregador": a mesma tela recebe motorista de app,
                  visitante de morador, hospede de temporada e prestador. O rotulo
                  antigo era do tempo em que so entrava entregador, e quem le hoje
                  hesita antes de digitar. */}
              <Field
                label="Nome e sobrenome"
                required
                error={erro.nome}
                help="De quem está pedindo para entrar"
              >
                <Input
                  value={nome}
                  readOnly={jaCadastrado}
                  disabled={jaCadastrado}
                  onChange={(e) => setNome(emMaiusculo(e.target.value))}
                />
              </Field>

              {/* So o prestador de servico. E o nome da empresa que identifica quem
                  entrou — sem ele, o registro diz que "alguem de alguma empresa"
                  passou pelo portao. */}
              {pedeEmpresa(tipo) && (
                <Field label="Empresa" required error={erro.empresa} help="Quem o prestador representa">
                  <Input
                    value={empresa}
                    placeholder="Ex: Elevadores XPTO"
                    onChange={(e) => { setEmpresa(e.target.value); setErro((x) => ({ ...x, empresa: undefined })); }}
                  />
                </Field>
              )}
            </div>
            {/* Fica FORA da grade e logo abaixo das fichas porque muda o formulario
                inteiro: some a unidade de destino e o "liberado por" se preenche
                sozinho. Escondida numa coluna do meio, a caixa seria marcada depois
                de o porteiro ja ter procurado um apartamento. */}
            {pedeEmpresa(tipo) && (
              <div className="ent-interno">
                <Chave
                  ligada={doCondominio}
                  onChange={marcarInterno}
                  icone={<Wrench size={18} />}
                  titulo="É serviço do próprio condomínio"
                  sub="Manutenção, jardinagem, obra da administração. Não tem apartamento de destino, e quem libera é você."
                />
              </div>
            )}
          </SecaoDaFicha>

          <SecaoDaFicha Icone={Building2} titulo="Destino" nota={interno ? "Serviço do condomínio" : "Apartamento e quem autorizou"}>
            <div className="ent-ficha__campos">
              {/* Sem destino no servico interno: o eletricista do elevador nao vai a
                  apartamento nenhum, e obrigar a escolher um encheria o registro de
                  destinos inventados. */}
              {!interno && (
              <Field label="Unidade de destino" required error={erro.unidade} className="ent-form__unidade">
                <span className="ent-combo" ref={campoUnidadeRef}>
                  <Input
                    value={buscaUnidade}
                    placeholder="Digite 5205 ou bloco 5 apto 205"
                    autoComplete="off"
                    onFocus={() => setFocoUnidade(true)}
                    onChange={(e) => {
                      setBuscaUnidade(e.target.value);
                      setUnidadeSel(null);
                      setFocoUnidade(true);
                    }}
                  />
                  {unidadeSel && (
                    <button
                      type="button"
                      className="ent-combo__limpar"
                      aria-label="Limpar unidade"
                      onClick={() => { setUnidadeSel(null); setBuscaUnidade(""); }}
                    >
                      <X size={15} />
                    </button>
                  )}
                  {focoUnidade && sugestoes.length > 0 && (
                    <ul className="ent-combo__lista" role="listbox">
                      {sugestoes.map((u) => (
                        <li key={u.id}>
                          <button type="button" className="ent-combo__item" onClick={() => selecionarUnidade(u)}>
                            <span className="ent-combo__unidade">B{u.bloco}-{u.unidade}</span>
                            <span className="ent-combo__desc">Bloco {u.bloco} · Apto {u.unidade}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              </Field>
              )}

              {/* No servico interno quem autoriza e o porteiro de plantao, e o nome
                  dele entra sozinho. O campo so trava quando ha nome a colocar:
                  travar vazio deixaria a entrada impossivel de registrar, sem
                  nenhuma saida na tela. */}
              <Field
                label="Liberado por"
                required
                error={erro.liberadoPor}
                help={interno ? "Você, como porteiro de plantão" : "Quem no apartamento autorizou"}
              >
                <Input
                  value={liberadoPor}
                  disabled={interno && Boolean(nomeDoPorteiro)}
                  onChange={(e) => setLiberadoPor(e.target.value)}
                />
              </Field>
            </div>
          </SecaoDaFicha>

          <SecaoDaFicha Icone={CarFront} titulo="Veículo" nota="A pé não pede placa">
            <div className="ent-ficha__campos ent-ficha__campos--3">
              <Field label="Veículo" required error={erro.veiculo}>
                <Select
                  value={veiculo}
                  onChange={(e) => { setVeiculo(e.target.value); setErro((x) => ({ ...x, veiculo: undefined })); }}
                >
                  {/* A opcao vazia so existe enquanto ninguem escolheu. Sem ela, um
                      `value=""` deixa o <select> MOSTRANDO a primeira opcao com o
                      estado vazio por tras: a tela diz "Moto" e a gravacao manda
                      nada. */}
                  {faltaVeiculo && <option value="">Escolha o veículo</option>}
                  {veiculosDoTipo(tipo).map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </Field>

              <Field label="Placa" required={exigePlaca} error={erro.placa}>
                <Input
                  value={placa}
                  disabled={!exigePlaca}
                  placeholder={
                    faltaVeiculo ? "escolha o veículo primeiro"
                      : exigePlaca ? "ABC1D23"
                      : "não se aplica"
                  }
                  onChange={(e) => setPlaca(e.target.value.toUpperCase().slice(0, 8))}
                />
              </Field>

              {/* Opcional, e aberto em todo tipo e todo veiculo: ate "bicicleta
                  azul" ajuda a achar quem esta la dentro. O limite e o do 0063. */}
              <Field label="Modelo do veículo" help="Opcional. Modelo, cor, algo que o identifique">
                <Input
                  value={modelo}
                  maxLength={120}
                  placeholder="Ex.: Honda CG 160 vermelha, baú do iFood"
                  onChange={(e) => setModelo(e.target.value)}
                />
              </Field>
            </div>
          </SecaoDaFicha>

          {tipo === "AIRBNB" && (
            <SecaoDaFicha Icone={CalendarCheck} titulo="Temporada" nota="Liberações da administração">
              <AvisoDaTemporada
                temporadas={temporadas}
                placa={placa}
                cpf={cpf}
                rotuloUnidade={(id) => {
                  const u = unidades.find((x) => String(x.id) === String(id));
                  return u ? `B${u.bloco}-${u.unidade}` : String(id ?? "—");
                }}
                usada={temporadaUsada}
                onUsar={usarTemporada}
              />
            </SecaoDaFicha>
          )}

          <SecaoDaFicha Icone={Timer} titulo="Tempo" nota={temPrazo(tipo) ? "Anda de 5 em 5" : "Este tipo não tem prazo"}>
            {temPrazo(tipo) ? (
              <div className="ent-ficha__campos ent-ficha__campos--1">
                {/* Prazo so para quem entra e sai. Hospede de temporada e prestador
                    ficam sem: pedir minutos a quem passa o fim de semana produz um
                    numero que ninguem olha. */}
                {temPrazo(tipo) && (
                  <Field
                    label="Tempo permitido"
                    error={erro.minutos}
                    help={ilimitado
                      ? "Sem contagem: fica o tempo que precisar"
                      : "Comeca em 15 e anda de 5 em 5"}
                  >
                    <div className="ent-prazo-linha">
                      {/* O mais e o menos ficam DESABILITADOS, e nao escondidos.
                          Sumindo, a linha encolhe e a caixa pula de lugar debaixo do
                          dedo de quem acabou de marca-la; e ao desmarcar o porteiro
                          perde de vista o numero que estava ali. Apagado, o 15 min
                          continua visivel esperando. */}
                      <div className="ent-prazo" data-desligado={ilimitado ? "sim" : undefined}>
                        <button
                          type="button"
                          className="ent-prazo__botao"
                          disabled={ilimitado}
                          aria-label={`Diminuir ${PASSO_MINUTOS} minutos`}
                          onClick={() => setMinutos((m) => ajustarMinutos(m, -PASSO_MINUTOS))}
                        >
                          <Minus size={16} />
                        </button>
                        <output className="ent-prazo__valor">
                          <Timer size={15} aria-hidden="true" />
                          {ilimitado ? "Sem Limite" : formatarDuracao(minutos)}
                        </output>
                        <button
                          type="button"
                          className="ent-prazo__botao"
                          disabled={ilimitado}
                          aria-label={`Aumentar ${PASSO_MINUTOS} minutos`}
                          onClick={() => setMinutos((m) => ajustarMinutos(m, +PASSO_MINUTOS))}
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {/* So o visitante. Visita de morador nao tem hora para ir
                          embora, e cobrar prazo dela so enchia o mapa de alarme
                          vermelho a tarde inteira. */}
                      {podeSerIlimitado(tipo) && (
                        <Checkbox
                          className="ent-ilimitado"
                          label="Ilimitado"
                          checked={ilimitado}
                          onChange={(e) => {
                            setIlimitado(e.target.checked);
                            setErro((x) => ({ ...x, minutos: undefined }));
                          }}
                        />
                      )}
                    </div>
                  </Field>
                )}
              </div>
            ) : (
              <p className="ent-ficha__sem">
                {rotuloDoTipo(tipo)} fica sem contagem: sai quando terminar.
              </p>
            )}
          </SecaoDaFicha>
        </section>

        <Cracha
          hora={soHora(agora)}
          nome={nome}
          tipo={rotuloDoTipo(tipo)}
          empresa={pedeEmpresa(tipo) ? empresa : ""}
          destino={interno ? "Condomínio" : unidadeSel ? `B${unidadeSel.bloco}-${unidadeSel.unidade}` : ""}
          liberadoPor={liberadoPor}
          veiculo={veiculo}
          placa={exigePlaca ? placa : ""}
          modelo={modelo}
          tempo={!temPrazo(tipo) ? "Sem prazo" : ilimitado ? "Sem limite" : formatarDuracao(minutos)}
          faltam={faltam}
          erro={erro.geral}
          salvando={salvando}
          onRegistrar={registrar}
          onLimpar={limparFormulario}
        />
      </div>

      {/* ---- O veiculo continua o mesmo? ----
          Preencher a placa antiga em silencio seria pior que campo vazio: o
          porteiro confere o que ja esta escrito e libera um carro que nao e
          aquele. Por isso a tela PERGUNTA, e a resposta "nao" apaga so o que
          esta errado. */}
      <Modal
        open={Boolean(conferirVeiculo)}
        onClose={confirmarVeiculo}
        title="Confira o veículo"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={trocarVeiculo}>Não, é outro</Button>
            <Button variant="primary" onClick={confirmarVeiculo} iconLeft={<Check size={16} />}>
              Sim, é esse
            </Button>
          </>
        }
      >
        {conferirVeiculo && (
          <div className="ent-confere">
            <p className="ent-confere__quem">
              <strong>{conferirVeiculo.nome}</strong> já esteve aqui.
            </p>
            <div className="ent-confere__veiculo">
              <CarFront size={20} aria-hidden="true" />
              <span>
                {conferirVeiculo.veiculo}
                {conferirVeiculo.placa ? <b> {String(conferirVeiculo.placa).toUpperCase()}</b> : null}
                {conferirVeiculo.modelo ? <span className="ent-modelo">{conferirVeiculo.modelo}</span> : null}
              </span>
            </div>
            <p className="ent-confere__nota">
              <AlertTriangle size={14} aria-hidden="true" />
              Está com esse veículo agora? Dizendo que não, o veículo, a placa e
              o modelo são apagados para você preencher de novo — CPF e nome ficam.
            </p>
          </div>
        )}
      </Modal>

      {/* ---- Fila de chegadas ----
          Duas vistas do mesmo dia. "Dentro agora" e a pergunta que o porteiro
          faz o tempo todo, e e a unica que desenha o mapa; "chegadas de hoje" e
          o dia inteiro, e contem a outra — por isso e ela quem abre. */}
      <div className="ent-secao-topo">
        <h2 className="ent-secao">
          {aba === "dentro" ? "Dentro agora" : aba === "historico" ? "Histórico" : "Chegadas de hoje"}
        </h2>
        <Tabs
          value={aba}
          onChange={trocarAba}
          aria-label="O que mostrar"
          items={[
            { value: "hoje", label: "Chegadas de hoje", count: deHoje.length },
            { value: "dentro", label: "Dentro agora", count: dentroAgora },
            // O histórico é da administração. Fora para o porteiro por peso de
            // tela, e não por sigilo — ele lê estas linhas pela API de qualquer
            // jeito, e é assim que a baixa de encomenda funciona.
            ...(mostraHistorico ? [{ value: "historico", label: "Histórico" }] : []),
          ]}
        />
      </div>

      {aba === "historico" && (
        <>
          <Filtros
            busca={filtros.busca}
            onBusca={(x) => mudarFiltro("busca", x)}
            placeholder="Nome, CPF, empresa, placa ou quem liberou"
            filtro={filtros.situacao}
            onFiltro={(x) => mudarFiltro("situacao", x)}
            filtros={[
              ["", "Todas", contagemHistorico.todas],
              ["dentro", "Ainda dentro", contagemHistorico.dentro],
              ["saiu", "Já saiu", contagemHistorico.saiu],
            ]}
            painel={
              <PainelDeFiltros aberto={maisFiltros}>
                {/* Separado da busca de texto de propósito: "5206" na busca acharia
                    também qualquer CPF com 5206 dentro. A regra é a da lib/unidades. */}
                <Field label="Unidade" help="Como 5206 ou B5-206">
                  <Input
                    value={filtros.unidade}
                    placeholder="Ex: 5206"
                    onChange={(e) => mudarFiltro("unidade", e.target.value)}
                  />
                </Field>
                <Field label="Entrada — de" help="Este recorte é buscado no banco">
                  <Input type="date" value={filtros.entradaDe}
                         onChange={(e) => mudarFiltro("entradaDe", e.target.value)} />
                </Field>
                <Field label="Entrada — até">
                  <Input type="date" value={filtros.entradaAte}
                         onChange={(e) => mudarFiltro("entradaAte", e.target.value)} />
                </Field>
                <Field label="Saída — de" help="Quem não saiu não entra neste recorte">
                  <Input type="date" value={filtros.saidaDe}
                         onChange={(e) => mudarFiltro("saidaDe", e.target.value)} />
                </Field>
                <Field label="Saída — até">
                  <Input type="date" value={filtros.saidaAte}
                         onChange={(e) => mudarFiltro("saidaAte", e.target.value)} />
                </Field>
                <Field label="Tipo">
                  <Opcoes rotulo="Tipo" valor={filtros.tipo} onMudar={(x) => mudarFiltro("tipo", x)}
                    opcoes={[["", "Todos"], ...TIPOS.map((t) => [t.id, t.rotulo])]} />
                </Field>
              </PainelDeFiltros>
            }
          >
            <MaisFiltros aberto={maisFiltros} onAlternar={() => setMaisFiltros((a) => !a)}
              ativos={filtrosDoPainel} onLimpar={limparFiltros} />
          </Filtros>

          <div className="ent-filtros__rodape">
            <span className="ent-filtros__conta">
              {carregandoHistorico
                ? "Buscando…"
                : `${doHistorico.length} ${doHistorico.length === 1 ? "entrada" : "entradas"}`}
              {doHistorico.length !== historico.length && !carregandoHistorico
                ? ` de ${historico.length} no período`
                : ""}
            </span>
            {/* O teto do banco não pode passar calado: uma lista cortada em
                silêncio faz quem procura concluir que o registro não existe. */}
            {historico.length >= LIMITE_HISTORICO && (
              <span className="ent-filtros__aviso">
                <AlertTriangle size={14} aria-hidden="true" />
                Período grande demais: mostrando as {LIMITE_HISTORICO} entradas mais
                recentes dele. Diminua o intervalo de entrada para ver o resto.
              </span>
            )}
          </div>
        </>
      )}

      {aba === "dentro" && !carregando && (
        <MapaDaPortaria
          chegadas={dentro}
          agora={agora}
          destacada={destacada}
          onEscolher={apontarNaLista}
        />
      )}

      {!(aba === "historico" ? carregandoHistorico : carregando) && linhas.length === 0 ? (
        aba === "historico" ? (
          <EmptyState
            icon={<Search size={20} />}
            title="Nada neste recorte"
            description="Nenhuma entrada bate com os filtros. Alargue o período ou limpe os filtros."
            action={<Button onClick={limparFiltros}>Limpar filtros</Button>}
          />
        ) : aba === "dentro" ? (
          <EmptyState
            icon={<DoorOpen size={20} />}
            title="Ninguém dentro agora"
            description="Todo mundo que chegou hoje já registrou saída."
          />
        ) : (
          <EmptyState
            icon={<PackageCheck size={20} />}
            title="Nenhuma chegada registrada hoje"
            description="Assim que alguém for liberado, aparece aqui com horário de entrada e destino."
          />
        )
      ) : (
        <ListaQueAbre
          colunas={[
            { rotulo: "Entrada", largura: "120px" },
            { rotulo: "Tipo", largura: "118px" },
            { rotulo: "Quem entrou", largura: "minmax(0, 1.6fr)" },
            { rotulo: "Destino", largura: "100px" },
            { rotulo: "Veículo", largura: "minmax(0, 1.2fr)" },
            { rotulo: "Prazo", largura: "110px" },
            { rotulo: "Saída", largura: aba === "historico" ? "130px" : "110px" },
          ]}
          larguraAcoes="96px"
          itens={linhas.slice(0, limite)}
          carregando={aba === "historico" ? carregandoHistorico : carregando}
          chave={(c) => c.id}
          // O `id` é como o clique no mapa encontra esta linha para rolar até ela.
          propsDaLinha={(c) => ({
            id: `chegada-${c.id}`,
            "data-destacada": String(c.id) === String(destacada) ? "sim" : undefined,
          })}
          onAbrir={setVendo}
          rotuloDaLinha={(c) => `Abrir a entrada de ${c.nome}`}
          celulas={(c) => celulasDaChegada(c)}
          acoes={(c) => (
            <>
              <Button size="sm" variant="ghost" aria-label={`Ver a entrada de ${c.nome}`}
                      onClick={() => setVendo(c)}><Eye size={16} /></Button>
              {!soHora(c.horario_saida) && (
                <Button size="sm" variant="ghost" aria-label={`Registrar saída de ${c.nome}`}
                        loading={saindoId === c.id}
                        onClick={() => registrarSaida(c)}><LogOut size={16} /></Button>
              )}
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

      {/* ---- Ver a entrada: modal centrado, só leitura ---- */}
      <Modal
        open={Boolean(vendo)}
        onClose={() => setVendo(null)}
        title="Detalhes da entrada"
        size="lg"
        footer={vendo && (
          <div className="app-modal__acoes">
            {can(user, "excluirChegada") && (
              <Button variant="ghost" iconLeft={<Trash2 size={15} />}
                      onClick={() => { const c = vendo; setVendo(null); excluirChegada(c); }}>
                Excluir
              </Button>
            )}
            <Button variant="primary" iconLeft={<LogOut size={15} />} loading={saindoId === vendo.id}
                    disabled={Boolean(soHora(vendo.horario_saida))}
                    onClick={async () => { await registrarSaida(vendo); setVendo(null); }}>
              {soHora(vendo.horario_saida) ? "Já saiu" : "Registrar saída"}
            </Button>
          </div>
        )}
      >
        {vendo && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <Iniciais nome={vendo.nome} grande apagado={Boolean(soHora(vendo.horario_saida))} />
              <div className="app-modal__quem">
                <strong>{vendo.nome}</strong>
                <small>
                  {vendo.bloco ? `B${vendo.bloco}-${vendo.apartamento}` : "Condomínio"}
                  {" · "}
                  {rotuloDoTipo(vendo.tipo || "ENTREGADOR")}
                </small>
                <span className="app-modal__selos">
                  {soHora(vendo.horario_saida)
                    ? <Badge tone="muted">Já saiu</Badge>
                    : <Badge tone="brand">Dentro</Badge>}
                  {(minutosRestantes(vendo, agora) ?? 0) < 0 && <Badge tone="danger">Passou do tempo</Badge>}
                </span>
              </div>
            </div>

            {/* O mesmo desenho do detalhe de Encomendas: à esquerda o que se
                confere de olho (lá a foto, aqui o crachá da entrada); à direita
                os dados em fichas empilhadas. */}
            <div className="app-detalhe">
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Crachá da entrada</p>
                <Cracha
                  soLeitura
                  hora={soHora(vendo.horario_entrada)}
                  nome={vendo.nome}
                  tipo={rotuloDoTipo(vendo.tipo || "ENTREGADOR")}
                  empresa={vendo.empresa || ""}
                  destino={vendo.bloco ? `B${vendo.bloco}-${vendo.apartamento}` : "Condomínio"}
                  liberadoPor={vendo.liberado_por}
                  veiculo={vendo.veiculo}
                  placa={vendo.placa ? String(vendo.placa).toUpperCase() : ""}
                  modelo={vendo.modelo}
                  tempo={vendo.minutos_permitidos ? formatarDuracao(vendo.minutos_permitidos) : "Sem limite"}
                  faltam={[]}
                />
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Pessoa" itens={[
                  ["CPF", mascararCpf(vendo.cpf) || "Não informado", true],
                  ["Liberado por", vendo.liberado_por || "—"],
                  vendo.empresa ? ["Empresa", vendo.empresa] : null,
                ]} />
                <Ficha titulo="Entrada" itens={[
                  ["Data", `${soDia(vendo.horario_entrada)} ${soHora(vendo.horario_entrada)}`.trim() || "—"],
                  ["Registrada por", vendo.created_by || "—"],
                  ["Tempo combinado", vendo.minutos_permitidos ? formatarDuracao(vendo.minutos_permitidos) : "Sem limite"],
                ]} />
                <Ficha titulo="Saída" itens={soHora(vendo.horario_saida) ? [
                  ["Data", `${soDia(vendo.horario_saida)} ${soHora(vendo.horario_saida)}`],
                  ["Saída por", vendo.saida_por || "—"],
                ] : [
                  ["Situação", "Ainda dentro"],
                  ["Prazo", textoDoPrazo(vendo)],
                ]} />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <JanelaDaTemporada
        aberta={janelaTemporada}
        onFechar={() => setJanelaTemporada(false)}
        temporadas={temporadas}
        unidades={unidades}
        user={user}
        carregando={carregandoTemporadas}
        onMudou={carregarTemporadas}
      />

      {/* ---- Cadastro de entregadores ---- */}
      <Modal
        open={modalCadastro}
        onClose={() => { setModalCadastro(false); setEditCpf(null); setFiltroCadastro(""); }}
        title="Pessoas cadastradas"
        footer={<Button variant="ghost" onClick={() => setModalCadastro(false)}>Fechar</Button>}
      >
        <div className="cad-filtros__busca ent-cadastro__busca">
          <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
          <Input
            value={filtroCadastro}
            onChange={(e) => setFiltroCadastro(e.target.value)}
            placeholder="Buscar por nome ou CPF"
            aria-label="Buscar pessoa cadastrada"
          />
        </div>

        {cadastroFiltrado.length === 0 ? (
          <EmptyState
            icon={<Users size={20} />}
            title={filtroCadastro ? "Ninguém encontrado" : "Ninguém cadastrado ainda"}
            description={
              filtroCadastro
                ? "Tente outro nome ou CPF."
                : "O cadastro é criado sozinho na primeira chegada registrada."
            }
          />
        ) : (
          <ul className="ent-cadastro">
            {cadastroFiltrado.slice(0, MAX_NA_JANELA).map((e) => {
              const cpfDig = soDigitos(e.cpf);
              const editando = editCpf === cpfDig;
              return (
                <li key={cpfDig} className="ent-cadastro__item">
                  {editando ? (
                    <>
                      <Input
                        value={editNome}
                        autoFocus
                        aria-label={`Novo nome de ${e.nome}`}
                        onChange={(ev) => setEditNome(emMaiusculo(ev.target.value))}
                        onKeyDown={(ev) => { if (ev.key === "Enter") salvarEdicao(cpfDig); }}
                      />
                      <Button size="sm" variant="primary" aria-label="Salvar nome"
                              onClick={() => salvarEdicao(cpfDig)} iconLeft={<Check size={14} />} />
                      <Button size="sm" variant="ghost" aria-label="Cancelar edição"
                              onClick={() => setEditCpf(null)} iconLeft={<X size={14} />} />
                    </>
                  ) : (
                    <>
                      <span className="ent-cadastro__quem">
                        <span className="ent-nome">{e.nome}</span>
                        <span className="ent-cpf">{formatarCpf(e.cpf)}</span>
                      </span>
                      {can(user, "editarEntregador") && (
                        <Button size="sm" variant="ghost" aria-label={`Editar nome de ${e.nome}`}
                                onClick={() => { setEditCpf(cpfDig); setEditNome(e.nome || ""); }}
                                iconLeft={<Pencil size={14} />} />
                      )}
                      {can(user, "excluirEntregador") && (
                        <Button size="sm" variant="ghost" aria-label={`Excluir ${e.nome}`}
                                loading={excluindoCpf === cpfDig}
                                onClick={() => excluirEntregador(e)} iconLeft={<Trash2 size={14} />} />
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {cadastroFiltrado.length > MAX_NA_JANELA && (
          <p className="ent-cadastro__mais" role="status">
            Mostrando {MAX_NA_JANELA} de {cadastroFiltrado.length}. Digite parte do nome ou do CPF para achar os demais.
          </p>
        )}
      </Modal>
    </div>
  );
}
