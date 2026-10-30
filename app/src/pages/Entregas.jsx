import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, LogOut, Trash2, UserPlus, Users, Pencil, Check, X,
  DoorOpen, PackageCheck, Minus, Plus, Timer, CarFront, AlertTriangle,
} from "lucide-react";
import { listar, listarTudo, listarChegadas, buscarUm, criar, editar, remover } from "../api/db";
import { can } from "../auth/permissions";
import {
  TIPOS, MINUTOS_PADRAO, PASSO_MINUTOS, ajustarMinutos, daJanelaDeHoje,
  ehServicoInterno, emMaiusculo, estaDentro, filtrarHistorico, fimDoDia, formatarDuracao,
  padronizarNome,
  hojeEmBrasilia, inicioDoDia, minutosIniciais, minutosRestantes, pedeEmpresa,
  pedePlaca, podeSerIlimitado, problemasDaEntrada, rotuloDoTipo, semRelogio,
  semVeiculo, temPrazo,
  temVeiculoGuardado, unirChegadas, veiculosDoTipo,
} from "../lib/portaria";
import MapaDaPortaria from "../components/MapaDaPortaria";
import {
  Button, Card, Badge, Table, Tabs, Modal, Field, Input, Select, Checkbox, Stat,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";

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
  const [veiculo, setVeiculo] = useState("Moto");
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
  const mostraHistorico = can(user, "verHistoricoPortaria");
  // O porteiro ve o historico com o CPF coberto: para o turno dele basta o
  // nome; o numero inteiro de meses de visitantes fica com a administracao.
  const cpfMascarado = !can(user, "verCpfNoHistorico");

  const [modalCadastro, setModalCadastro] = useState(false);
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

  // Cadastro e unidades quase não mudam: carregados uma vez e mantidos em cache.
  useEffect(() => {
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
    setVeiculo("Moto"); setPlaca(""); setModelo("");
    setBuscaUnidade(""); setUnidadeSel(null);
    setLiberadoPor(""); setErro({});
    setEmpresa(""); setConferirVeiculo(null);
    setDoCondominio(false);
    // O tipo NAO volta ao padrao: quem esta registrando dez entregadores
    // seguidos nao quer reescolher "Entregador" a cada um.
    setMinutos(minutosIniciais(tipo) ?? MINUTOS_PADRAO);
    setIlimitado(false);
  };

  /** Trocar de tipo redefine o prazo: e o tipo que decide se ha prazo. */
  const escolherTipo = (novo) => {
    setTipo(novo);
    setMinutos(minutosIniciais(novo) ?? MINUTOS_PADRAO);
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
    if (!veiculosDoTipo(novo).includes(veiculo)) setVeiculo(veiculosDoTipo(novo)[0]);
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

      limparFormulario();
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

  /* ---------------- tabela de chegadas ---------------- */

  const colunas = [
    // Cada horario carrega o porteiro que o produziu. Duas colunas a mais
    // ("Registrado por", "Saida por") empurrariam a tabela para a rolagem
    // horizontal; e o nome so faz sentido colado no horario a que ele pertence.
    //
    // A entrada leva o dia em toda aba, e nao so no historico: "Dentro agora"
    // tambem mostra o hospede de temporada que entrou anteontem, e "17:23"
    // sozinho o faria parecer de hoje. Com o dia aqui, a coluna "Dia" que o
    // historico tinha seria a mesma informacao duas vezes, e saiu.
    { key: "horario_entrada", label: "Entrada", tipo: "num", width: 128,
      render: (c) => (
        <span>
          <span style={{ display: "block" }}>
            {`${soDia(c.horario_entrada)} ${soHora(c.horario_entrada)}`.trim()}
          </span>
          {c.created_by ? <span className="ent-porteiro">{c.created_by}</span> : null}
        </span>
      ) },
    { key: "tipo", label: "Tipo", width: 118,
      render: (c) => (
        <span className="ent-tipo-selo" data-tipo={c.tipo || "ENTREGADOR"}>
          {rotuloDoTipo(c.tipo || "ENTREGADOR")}
        </span>
      ) },
    { key: "nome", label: "Quem entrou",
      render: (c) => (
        <span>
          <span className="ent-nome">{c.nome}</span>
          <span className="ent-cpf">
            {aba === "historico" && cpfMascarado ? mascararCpf(c.cpf) : formatarCpf(c.cpf)}
          </span>
        </span>
      ) },
    { key: "unidade", label: "Destino", tipo: "id", width: 116,
      // Sem bloco e servico do proprio condominio — nao e campo esquecido, e
      // a tabela nao pode deixar isso parecendo buraco.
      render: (c) => (c.bloco ? `B${c.bloco}-${c.apartamento}` : "condomínio") },
    { key: "veiculo", label: "Veículo",
      render: (c) => (
        <span>
          {c.veiculo}
          {c.placa ? <span className="ent-placa"> {c.placa}</span> : null}
          {c.modelo ? <span className="ent-modelo">{c.modelo}</span> : null}
        </span>
      ) },
    { key: "liberado_por", label: "Liberado por",
      render: (c) => (
        <span>
          {c.liberado_por}
          {c.empresa ? <span className="ent-empresa">{c.empresa}</span> : null}
        </span>
      ) },
    { key: "prazo", label: "Prazo", width: 104,
      render: (c) => {
        const restam = minutosRestantes(c, agora);
        if (restam === null) {
          // Sem prazo, ou ja saiu. Traco, e nao "0 min": sao coisas diferentes.
          return estaDentro(c) && !c.minutos_permitidos ? "Sem Limite" : "—";
        }
        return (
          <span className={restam < 0 ? "ent-prazo-estourado" : undefined}>
            {restam < 0 ? `${formatarDuracao(-restam)} a mais` : `restam ${formatarDuracao(restam)}`}
          </span>
        );
      } },
    // No historico a saida leva o dia junto: o hospede de temporada sai dias
    // depois, e "18:30" ao lado do dia da entrada faria a saida parecer do
    // mesmo dia. Nas outras abas toda saida mostrada e de hoje.
    { key: "horario_saida", label: "Saída", tipo: "num", width: aba === "historico" ? 140 : 122,
      render: (c) => {
        if (!soHora(c.horario_saida)) return <Badge tone="brand">dentro</Badge>;
        return (
          <span>
            <span style={{ display: "block" }}>
              {aba === "historico"
                ? `${soDia(c.horario_saida)} ${soHora(c.horario_saida)}`
                : soHora(c.horario_saida)}
            </span>
            {c.saida_por ? <span className="ent-porteiro">{c.saida_por}</span> : null}
          </span>
        );
      } },
  ];

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
          <Button onClick={() => setModalCadastro(true)} iconLeft={<Users size={15} />}>
            Cadastrados
          </Button>
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

      {/* ---- Registro de chegada ---- */}
      <Card as="section" className="ent-form">
        <h2 className="ent-form__titulo">
          <DoorOpen size={17} aria-hidden="true" /> Registrar chegada
        </h2>

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

        {/* Fica FORA da grade e logo abaixo das fichas porque muda o formulario
            inteiro: some a unidade de destino e o "liberado por" se preenche
            sozinho. Escondida numa coluna do meio, a caixa seria marcada depois
            de o porteiro ja ter procurado um apartamento. */}
        {pedeEmpresa(tipo) && (
          <div className="ent-interno">
            <Checkbox
              label="É serviço do próprio condomínio"
              checked={doCondominio}
              onChange={(e) => marcarInterno(e.target.checked)}
            />
            <span className="ent-interno__nota">
              Manutenção, jardinagem, obra da administração. Não tem apartamento
              de destino, e quem libera é você.
            </span>
          </div>
        )}

        <div className="ent-form__grade">
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

        {erro.geral && (
          <p className="vit-field__error" style={{ marginTop: "var(--space-5)" }}>{erro.geral}</p>
        )}

        <div className="ent-form__acoes">
          <Button variant="ghost" onClick={limparFormulario}>Limpar</Button>
          <Button variant="primary" onClick={registrar} loading={salvando} iconLeft={<UserPlus size={16} />}>
            Registrar chegada
          </Button>
        </div>
      </Card>

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
        <Card as="section" className="ent-filtros">
          <div className="ent-filtros__grade">
            <Field label="Buscar" help="Nome, CPF, empresa, placa, modelo ou quem liberou">
              <Input
                value={filtros.busca}
                placeholder="Ex: Ana, 111, Elevadores"
                onChange={(e) => mudarFiltro("busca", e.target.value)}
              />
            </Field>

            {/* Separado da busca de texto de propósito: "5206" na busca acharia
                também qualquer CPF com 5206 dentro, e a lista viria maior do que
                a pergunta. A regra de casar é a da lib/unidades. */}
            <Field label="Unidade" help="Bloco e apartamento, como 5206 ou B5-206">
              <Input
                value={filtros.unidade}
                placeholder="Ex: 5206, 5 206 ou bloco 5"
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

            <Field label="Situação">
              <Select value={filtros.situacao}
                      onChange={(e) => mudarFiltro("situacao", e.target.value)}>
                <option value="">Todas</option>
                <option value="dentro">Ainda dentro</option>
                <option value="saiu">Já saiu</option>
              </Select>
            </Field>

            <Field label="Tipo">
              <Select value={filtros.tipo} onChange={(e) => mudarFiltro("tipo", e.target.value)}>
                <option value="">Todos</option>
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </Select>
            </Field>
          </div>

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
            <Button variant="ghost" onClick={limparFiltros}>Limpar filtros</Button>
          </div>
        </Card>
      )}

      {aba === "dentro" && !carregando && (
        <MapaDaPortaria
          chegadas={dentro}
          agora={agora}
          destacada={destacada}
          onEscolher={apontarNaLista}
        />
      )}

      <Table
        columns={colunas}
        rows={linhas}
        loading={aba === "historico" ? carregandoHistorico : carregando}
        getRowKey={(c) => c.id}
        // O `id` é como o clique no mapa encontra esta linha para rolar até ela.
        rowProps={(c) => ({
          id: `chegada-${c.id}`,
          "data-destacada": String(c.id) === String(destacada) ? "sim" : undefined,
        })}
        rowActions={(c) => (
          <>
            {!soHora(c.horario_saida) && (
              <Button size="sm" variant="ghost" aria-label={`Registrar saída de ${c.nome}`}
                      loading={saindoId === c.id}
                      onClick={() => registrarSaida(c)} iconLeft={<LogOut size={14} />} />
            )}
            {can(user, "excluirChegada") && (
              <Button size="sm" variant="ghost" aria-label={`Excluir chegada de ${c.nome}`}
                      onClick={() => excluirChegada(c)} iconLeft={<Trash2 size={14} />} />
            )}
          </>
        )}
        empty={
          aba === "historico" ? (
            <EmptyState
              icon={<Search size={20} />}
              title="Nada neste recorte"
              description="Nenhuma entrada bate com os filtros. Alargue o período ou limpe os filtros."
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
        }
      />

      {/* ---- Cadastro de entregadores ---- */}
      <Modal
        open={modalCadastro}
        onClose={() => { setModalCadastro(false); setEditCpf(null); setFiltroCadastro(""); }}
        title="Pessoas cadastradas"
        footer={<Button variant="ghost" onClick={() => setModalCadastro(false)}>Fechar</Button>}
      >
        <div className="cad-filtros__busca" style={{ marginBottom: "var(--space-6)" }}>
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
                      <span style={{ flex: 1, minWidth: 0 }}>
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
