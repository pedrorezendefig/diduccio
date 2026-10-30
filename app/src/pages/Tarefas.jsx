import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NotebookPen, Plus, Search } from "lucide-react";
import { Button, EmptyState, PageHeader, useToast } from "../ui";
import QuadroDeTarefas from "../components/QuadroDeTarefas";
import GavetaDeTarefa from "../components/GavetaDeTarefa";
import BlocoDeNotas from "../components/BlocoDeNotas";
import { listar, listarResponsaveis, criar, editar, remover, lerNotas, salvarNotas } from "../api/db";
import { can } from "../auth/permissions";
import { useEstreito } from "../lib/useEstreito";
import {
  agruparPorSituacao, filtrarTarefas, mensagemErro, noQuadro, paraGravar, pessoasResponsaveis, resumo,
} from "../lib/tarefas";
import { juntarNotas, linhasDasNotas, tirarLinha, tirarLinhas } from "../lib/notas";

/**
 * O quadro de tarefas da administração.
 *
 * A página carrega e grava; o quadro e a gaveta só desenham. Mover é otimista:
 * o cartão muda de coluna na hora e volta se o banco recusar — arrastar e
 * esperar a rede para ver o cartão cair faz parecer que o arrasto falhou.
 */
// O que uma operação da fila do bloco devolve para o bloco abrir no fim.
const ABRIR_BLOCO = "abrir-bloco";

export default function Tarefas({ user }) {
  const toast = useToast();
  const estreito = useEstreito();

  const [tarefas, setTarefas] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState("");
  const [agora, setAgora] = useState(() => Date.now());

  const [minhas, setMinhas] = useState(false);
  const [busca, setBusca] = useState("");
  const [mostrarAnteriores, setMostrarAnteriores] = useState(false);
  // `{ chave, tarefa, situacao, daNota }` ou null. A chave nova remonta a
  // gaveta, para o formulário não herdar o que se digitou na tarefa aberta
  // antes. `daNota` (`{ linha, indice }`) marca a tarefa que nasceu de uma
  // linha do bloco de notas: é ela que sai do bloco quando a tarefa é salva.
  const [gaveta, setGaveta] = useState(null);
  // A mesma gaveta, para quem decide depois de um `await` se o bloco pode
  // reabrir (não pode, por cima de uma gaveta de tarefa aberta nesse meio-tempo).
  const gavetaRef = useRef(null);
  const trocarGaveta = (valor) => {
    gavetaRef.current = valor;
    setGaveta(valor);
  };

  // O bloco de notas. `notas` é o texto que a tela conhece; `notasNoBanco`, o
  // que ela sabe que o banco tem (a última leitura ou gravação que deu certo).
  // Diferem quando um salvamento falhou: o texto fica aqui, e o bloco, ao
  // reabrir, tenta gravá-lo de novo. As refs são os mesmos valores para quem
  // lê depois de um `await`.
  //
  // O bloco é um por pessoa, e a pessoa tem mais de um aparelho: anota no
  // celular na reunião e passa para o quadro no computador, que ficou com a
  // aba aberta desde de manhã. Por isso o banco é relido toda vez que o bloco
  // abre, quando a aba volta a ficar visível e antes de tirar linhas que
  // viraram tarefa — gravar o texto de manhã por cima apagaria o da reunião.
  // As regras de quem ganha estão em `juntarNotas`.
  //
  // O que isto NÃO cobre: dois aparelhos com o bloco ABERTO e digitando no
  // mesmo instante. Aí vale o último que gravou. Resolver exigiria versão na
  // linha e recusa no banco; para um rascunho pessoal, o caso é raro demais.
  const [notas, setNotas] = useState("");
  const notasRef = useRef("");
  const [notasNoBanco, setNotasNoBanco] = useState("");
  const notasNoBancoRef = useRef("");
  // Falso até a leitura dar certo, e de novo falso quando uma releitura falha.
  // Enquanto falso, o bloco avisa que não carregou e só grava se a pessoa
  // digitar: gravar sem saber o que o banco tem poderia apagar o que outro
  // aparelho escreveu.
  const [notasCarregadas, setNotasCarregadas] = useState(false);
  const [blocoAberto, setBlocoAberto] = useState(false);
  // O bloco aberto tem texto que ainda não chegou ao banco (dentro do debounce).
  const [blocoPendente, setBlocoPendente] = useState(false);
  // Lendo, tirando linha ou criando as tarefas de "Virar as N": o botão do
  // bloco fica ocupado. Reabrir no meio mostraria um texto que ainda vai mudar,
  // e o que se digitasse nele seria gravado por cima. As operações da página
  // sobre o bloco andam numa fila, uma de cada vez, como os salvamentos dentro
  // do próprio bloco: duas releituras cruzadas podiam aplicar a velha depois.
  const [ocupadoBloco, setOcupadoBloco] = useState(false);
  const filaBlocoRef = useRef(Promise.resolve());
  const naFilaRef = useRef(0);
  const [virando, setVirando] = useState(false);
  const tituloRef = useRef(null);
  const botaoBlocoRef = useRef(null);
  // Número da última gravação pedida (ver `gravarNotas`).
  const gravacaoRef = useRef(0);

  const meuId = user?.id;

  const trocarNotas = (texto) => {
    notasRef.current = texto;
    setNotas(texto);
  };
  const marcarNoBanco = (texto) => {
    notasNoBancoRef.current = texto;
    setNotasNoBanco(texto);
  };

  /**
   * Põe `fn` na fila do bloco, com o botão ocupado até a fila esvaziar.
   * `pularSeOcupado`: para o que não faz sentido repetir (abrir, reler na volta
   * da aba) — se já há algo na fila, não entra. Tirar linha e "Virar as N"
   * nunca pulam: esperam a vez.
   *
   * `fn` devolve `ABRIR_BLOCO` para o bloco abrir no fim. Quem abre é esta
   * função, na MESMA leva em que o botão volta a ligar: assim o foco que a
   * espera pôs no título volta ao botão (efeito de layout abaixo) antes de o
   * bloco anotar para onde devolvê-lo ao fechar. Abrindo dentro de `fn`, o
   * bloco podia montar uma renderização antes e anotar o título.
   */
  const ocuparBloco = (fn, { pularSeOcupado = false } = {}) => {
    if (pularSeOcupado && naFilaRef.current > 0) return Promise.resolve(undefined);
    naFilaRef.current += 1;
    setOcupadoBloco(true);
    const vez = filaBlocoRef.current.then(fn);
    const fim = (resultado) => {
      naFilaRef.current -= 1;
      if (naFilaRef.current === 0) setOcupadoBloco(false);
      // Nem por cima de uma gaveta de tarefa que abriu nesse meio-tempo.
      if (resultado === ABRIR_BLOCO && !gavetaRef.current) setBlocoAberto(true);
    };
    vez.then(fim, () => fim());
    filaBlocoRef.current = vez.catch(() => {});
    return vez;
  };

  /**
   * Relê o bloco do banco e aplica `juntarNotas`. Devolve `true` se leu. Se a
   * leitura falha, o bloco passa a "não carregado" e o texto da tela fica
   * como está.
   */
  const relerNotas = async () => {
    let banco;
    try {
      banco = await lerNotas(meuId);
    } catch {
      banco = null;
    }
    if (typeof banco !== "string") {
      setNotasCarregadas(false);
      return false;
    }
    const { texto, conflito } = juntarNotas(notasRef.current, banco, notasNoBancoRef.current);
    marcarNoBanco(banco);
    trocarNotas(texto);
    setNotasCarregadas(true);
    if (conflito) toast.info("O bloco mudou em outro aparelho. Juntei as duas versões.");
    return true;
  };

  // Abrir o bloco sempre passa pelo banco antes.
  const abrirBloco = () => ocuparBloco(async () => {
    await relerNotas();
    return ABRIR_BLOCO;
  }, { pularSeOcupado: true });

  const carregar = useCallback(async () => {
    try {
      // A lista de nomes não derruba o quadro: sem ela o campo Responsável
      // oferece só quem está logado, e o resto da tela funciona. Tarefas e
      // unidades, sim — sem elas o quadro mentiria.
      let faltaramResponsaveis = false;
      const responsaveis = listarResponsaveis().catch(() => {
        faltaramResponsaveis = true;
        return [];
      });
      // O bloco de notas também não derruba: é rascunho, e o quadro vale mais.
      // `null` quer dizer "não li" — diferente de "", que é "li, e está vazio".
      let faltaramNotas = false;
      const bloco = lerNotas(meuId).catch(() => {
        faltaramNotas = true;
        return null;
      });
      const [t, p, u, n] = await Promise.all([listar("TAREFAS"), responsaveis, listar("UNIDADES"), bloco]);
      setTarefas(Array.isArray(t) ? t : []);
      setPerfis(Array.isArray(p) ? p : []);
      setUnidades(Array.isArray(u) ? u : []);
      if (typeof n === "string") {
        notasRef.current = n;
        setNotas(n);
        notasNoBancoRef.current = n;
        setNotasNoBanco(n);
        setNotasCarregadas(true);
      }
      setErroCarga("");
      setAgora(Date.now());
      if (faltaramResponsaveis) toast.error("Não consegui carregar a lista de responsáveis.");
      if (faltaramNotas) toast.error("Não consegui carregar o bloco de notas.");
    } catch (e) {
      // Quadro vazio seria indistinguível de "não há tarefa nenhuma".
      setErroCarga(e?.message || "Não foi possível carregar as tarefas.");
    } finally {
      setCarregando(false);
    }
  }, [toast, meuId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Quadro deixado aberto de um dia para o outro: sem isto o prazo e o "Concluída
  // há N dias" ficariam congelados na hora da carga.
  //
  // E o bloco de notas, fechado, é relido na volta: a pessoa pode ter anotado
  // no celular enquanto esta aba estava escondida. Em silêncio, porque não foi
  // pedido; só o conflito avisa. Com o bloco aberto não relê — o bloco nasce
  // do texto da página e não se sincroniza depois, e a própria edição é o que
  // está valendo ali.
  const aoVoltarRef = useRef(null);
  // De layout, e não comum: atualiza na mesma leva em que a tela muda. Com o
  // efeito comum, uma volta de aba logo depois da carga ainda via a versão de
  // antes ("carregando") e pulava a releitura.
  useLayoutEffect(() => {
    aoVoltarRef.current = () => {
      // Durante a carga, é ela quem lê; com o quadro em erro, o bloco nem abre.
      if (blocoAberto || gaveta || carregando || erroCarga) return;
      ocuparBloco(relerNotas, { pularSeOcupado: true });
    };
  });
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      setAgora(Date.now());
      aoVoltarRef.current?.();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);

  const tentarDeNovo = () => {
    if (carregando) return;
    setErroCarga("");
    setCarregando(true);
    carregar();
  };

  // Quem vê o quadro inteiro (síndico, dev) escolhe o responsável entre a
  // administração. O auxiliar só tem a si mesmo: o 0045 recusa passar a tarefa
  // para outro — e ela sumiria da tela dele.
  const veTodas = can(user, "verTodasTarefas");
  const pessoas = useMemo(
    () => pessoasResponsaveis(veTodas ? perfis : [], user),
    [veTodas, perfis, user]
  );
  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [String(p.id), p])), [pessoas]);
  const unidadePorId = useMemo(() => new Map(unidades.map((u) => [String(u.id), u])), [unidades]);

  // O que o cargo enxerga. Em produção o 0045 já entrega ao auxiliar só as
  // dele; repetir aqui é o que faz o modo demonstração — que não tem banco —
  // contar a mesma história, em vez de mostrar e deixar apagar a do síndico.
  const doCargo = useMemo(
    () => (veTodas ? tarefas : filtrarTarefas(tarefas, { minhas: true, meuId: user?.id })),
    [veTodas, tarefas, user]
  );

  const filtradas = useMemo(
    () => filtrarTarefas(doCargo, { minhas, meuId: user?.id, busca, unidadePorId }),
    [doCargo, minhas, user, busca, unidadePorId]
  );
  const visiveis = useMemo(
    () => (mostrarAnteriores ? filtradas : filtradas.filter((t) => noQuadro(t, agora))),
    [filtradas, mostrarAnteriores, agora]
  );
  const escondidas = filtradas.length - visiveis.length;
  const grupos = useMemo(() => agruparPorSituacao(visiveis), [visiveis]);

  const { abertas, atrasadas } = resumo(doCargo, agora);
  const abertasMinhas = resumo(filtrarTarefas(doCargo, { minhas: true, meuId: user?.id }), agora).abertas;

  const trocar = (id, dados) => setTarefas((ts) => ts.map((t) => (t.id === id ? { ...t, ...dados } : t)));

  // Movimentos seguidos do mesmo cartão. `contador` numera todos os pedidos da
  // página e nunca volta a 1: um número velho nunca se confunde com um novo.
  // Por cartão, uma rodada: `ultimo` é o pedido mais novo (a resposta dele é a
  // que mexe na tela), `confirmada` é a última situação que o banco aceitou,
  // com o número do pedido que a confirmou (para onde o cartão volta se
  // falhar), e `pendentes` conta os pedidos ainda no ar.
  //
  // A rodada só fecha quando `pendentes` chega a zero. Fechar na resposta do
  // mais novo deixava um pedido mais velho ainda no ar; se o mais novo falhasse
  // e o velho desse certo depois, o banco ficava com a situação do velho e a
  // tela, com a de antes. `ultimoFalhou` marca esse caso: o sucesso que chega
  // depois da falha do mais novo, sem nenhum movimento posterior, vai para a
  // tela. As entradas não são apagadas — o mapa tem no máximo uma por cartão.
  const contador = useRef(0);
  const pedidos = useRef(new Map());

  const mover = async (tarefa, situacao) => {
    const id = tarefa.id;
    setAgora(Date.now());
    const seq = ++contador.current;
    let e = pedidos.current.get(id);
    if (!e || !e.aberto) {
      // Rodada nova: nada no ar, e a tela é a verdade.
      e = { ultimo: seq, aberto: true, pendentes: 0, ultimoFalhou: false, confirmada: { situacao: tarefa.situacao, seq: seq - 1 } };
      pedidos.current.set(id, e);
    } else {
      e.ultimo = seq;
      e.ultimoFalhou = false;
    }
    e.pendentes += 1;
    trocar(id, { situacao });

    const r = await editar("TAREFAS", id, { situacao });
    e.pendentes -= 1;

    const confirmou = Boolean(r?.success) && seq > e.confirmada.seq;
    if (confirmou) e.confirmada = { situacao: r.data?.situacao ?? situacao, seq };

    if (e.ultimo === seq) {
      if (r?.success) {
        // O gatilho preenche `concluida_em` e `movida_*`: a linha do banco manda.
        if (r.data) trocar(id, r.data);
      } else {
        trocar(id, { situacao: e.confirmada.situacao });
        e.ultimoFalhou = true;
        toast.error(mensagemErro(r?.message));
      }
    } else if (confirmou && e.ultimoFalhou) {
      // O mais novo já falhou e o cartão voltou; este, mais velho, deu certo
      // depois — é o que o banco guarda agora.
      trocar(id, r.data ?? { situacao: e.confirmada.situacao });
    }
    if (e.pendentes === 0) e.aberto = false;
  };

  /**
   * Grava o bloco. Nunca lança: o bloco mostra a falha, e a página guarda o
   * texto em `notas` até o banco aceitar. Gravou, a tela passa a conhecer este
   * texto — inclusive o contador, com o bloco ainda aberto.
   */
  const gravarNotas = async (texto) => {
    // Só a gravação mais nova mexe na tela. A do bloco que fechou sem rede
    // continua no ar depois que ele desmonta; se ela respondesse depois de
    // uma mais nova, traria de volta o texto de antes — com a linha que já
    // virou tarefa, por exemplo.
    const seq = ++gravacaoRef.current;
    let r;
    try {
      r = await salvarNotas(meuId, texto);
    } catch (e) {
      r = { success: false, message: e?.message };
    }
    if (r?.success && seq === gravacaoRef.current) {
      trocarNotas(texto);
      marcarNoBanco(texto);
      // Gravou: o que está no banco agora é isto, carregado ou não antes.
      setNotasCarregadas(true);
    }
    return r;
  };

  const salvar = async (campos) => {
    setAgora(Date.now());
    const existente = gaveta?.tarefa;
    const daNota = gaveta?.daNota;
    const r = existente ? await editar("TAREFAS", existente.id, campos) : await criar("TAREFAS", campos);
    if (!r?.success) return r;
    const linha = r.data ?? { ...existente, ...campos };
    setTarefas((ts) => (existente ? ts.map((t) => (t.id === existente.id ? { ...t, ...linha } : t)) : [...ts, linha]));
    trocarGaveta(null);
    toast.success(existente ? "Tarefa atualizada." : "Tarefa criada.");
    // Só agora, com a tarefa no banco, a linha sai do bloco. Sem `await`: a
    // gaveta de tarefa já fechou e não tem o que esperar.
    if (daNota) tirarDoBlocoEReabrir(daNota);
    return r;
  };

  /**
   * A linha virou tarefa: sai do bloco. Na fila do bloco, com o botão ocupado
   * até o fim — o bloco reaberto no meio gravaria o texto de antes por cima.
   *
   * Relê o banco primeiro e tira a linha DO TEXTO QUE ESTÁ LÁ (juntado com o
   * que esta tela tiver por gravar): entre abrir o bloco e salvar a tarefa,
   * outro aparelho pode ter escrito. `tirarLinha` usa o índice e, se o texto
   * andou, a primeira linha igual. Se a releitura falha, a linha sai só desta
   * tela e nada é gravado — o bloco reabre "não carregado" e só grava se a
   * pessoa digitar.
   *
   * Reabre o bloco no fim (`ocuparBloco`), a não ser que outra gaveta tenha
   * aberto nesse meio.
   */
  const tirarDoBlocoEReabrir = ({ linha, indice }) => ocuparBloco(async () => {
    const leu = await relerNotas();
    const novo = tirarLinha(notasRef.current, indice, linha);
    if (novo !== notasRef.current) {
      if (leu) await gravarNotas(novo);
      trocarNotas(novo);
    }
    return ABRIR_BLOCO;
  });

  // Fechou o bloco (X, Esc, fundo). `salvo` falso: o bloco insistiu e não
  // conseguiu; o texto fica aqui e é gravado quando o bloco reabrir.
  const fecharBloco = (texto, salvo) => {
    trocarNotas(texto);
    setBlocoPendente(false);
    setBlocoAberto(false);
    if (!salvo) toast.error("O bloco de notas não foi salvo. O texto ficou nesta tela: abra o bloco para tentar de novo.");
  };

  const virarUmaLinha = (linha, indice, texto) => {
    trocarNotas(texto);
    setBlocoPendente(false);
    setBlocoAberto(false);
    trocarGaveta({ chave: Date.now(), tarefa: null, situacao: "A_FAZER", daNota: { linha, indice } });
  };

  // Fechar a gaveta de tarefa: se ela veio do bloco, o bloco volta, igual —
  // pelo caminho de sempre, que relê o banco.
  const fecharGaveta = () => {
    const veioDoBloco = Boolean(gaveta?.daNota);
    trocarGaveta(null);
    if (veioDoBloco) abrirBloco();
  };

  /**
   * "Virar as N em tarefas". Uma de cada vez, e não em paralelo: N pedidos
   * simultâneos com o token vencendo no meio renovariam a sessão N vezes, e a
   * ordem de criação sairia embaralhada. Cada tarefa entra no quadro assim que
   * o banco a devolve; só as linhas criadas saem do bloco — do texto relido do
   * banco, pelo mesmo motivo de `tirarDoBlocoEReabrir`.
   */
  const virarTodas = (linhas, texto) => {
    trocarNotas(texto);
    setBlocoPendente(false);
    setBlocoAberto(false);
    // Liga o foco no título (efeito abaixo) já, e não quando a fila andar.
    setVirando(true);
    setAgora(Date.now());
    return ocuparBloco(async () => {
      const criadas = [];
      try {
        for (const linha of linhas) {
          const campos = paraGravar({
            titulo: linha, descricao: "", responsavel_id: meuId, prazo: "", id_unidade: null, situacao: "A_FAZER",
          });
          let r;
          try {
            r = await criar("TAREFAS", campos);
          } catch (e) {
            r = { success: false, message: e?.message };
          }
          if (!r?.success) continue;
          criadas.push(linha);
          const nova = r.data ?? campos;
          setTarefas((ts) => [...ts, nova]);
        }

        const falharam = linhas.length - criadas.length;
        let gravou = true;
        if (criadas.length) {
          const leu = await relerNotas();
          const novo = tirarLinhas(notasRef.current, criadas);
          gravou = leu && Boolean((await gravarNotas(novo))?.success);
          trocarNotas(novo);
        }
        const aviso = gravou ? "" : " O bloco não foi salvo: abra-o para tentar de novo.";
        if (!falharam) {
          toast.success(`${criadas.length === 1 ? "1 tarefa criada." : `${criadas.length} tarefas criadas.`}${aviso}`);
        } else if (!criadas.length) {
          // "0 criadas, N não" diria a mesma coisa pior.
          toast.error("Nenhuma tarefa foi criada. As linhas ficaram no bloco.");
        } else {
          toast.error(`${criadas.length} ${criadas.length === 1 ? "criada" : "criadas"}, ${falharam} não. As que faltaram ficaram no bloco.${aviso}`);
        }
      } finally {
        setVirando(false);
      }
    });
  };

  // Com a fila do bloco andando, o botão do bloco fica desligado — e é para ele
  // que as gavetas devolvem o foco ao fechar (a do bloco em "Virar as N", a de
  // tarefa depois de salvar a linha), e é nele que se clicou para abrir. O
  // foco iria parar no <body>, e o leitor de tela perderia o lugar: vai para
  // o título da página. Só se estava no botão ou em lugar nenhum — a releitura
  // na volta da aba não tira ninguém do campo de busca. "Virar as N" leva
  // sempre. Efeito, e não chamada direta, para vir DEPOIS de a gaveta que
  // desmonta devolver o foco.
  //
  // `preventScroll`: a releitura na volta da aba acontece com a pessoa em
  // qualquer ponto do quadro, e focar o título rolaria a página até o topo.
  const focoNoTituloPelaFilaRef = useRef(false);
  useEffect(() => {
    if (!ocupadoBloco) return;
    const ativo = document.activeElement;
    const perdido = !ativo || ativo === document.body || ativo === botaoBlocoRef.current;
    if (virando || perdido) {
      tituloRef.current?.focus({ preventScroll: true });
      focoNoTituloPelaFilaRef.current = document.activeElement === tituloRef.current;
    }
  }, [ocupadoBloco, virando]);

  // A fila esvaziou: o foco que a espera pôs no título volta ao botão do bloco,
  // que já está ligado de novo — é dele que a pessoa saiu. Se ela levou o foco
  // a outro lugar nesse meio, fica lá. Efeito de layout, e não comum, para
  // rodar ANTES de o bloco que reabre nesta mesma renderização anotar quem
  // tinha o foco: assim, ao fechar, ele o devolve ao botão, e não ao título.
  useLayoutEffect(() => {
    if (ocupadoBloco || !focoNoTituloPelaFilaRef.current) return;
    focoNoTituloPelaFilaRef.current = false;
    if (document.activeElement === tituloRef.current) botaoBlocoRef.current?.focus({ preventScroll: true });
  }, [ocupadoBloco]);

  // Sair da página (fechar a aba, recarregar) com texto que o banco não tem:
  // o navegador pergunta antes. Só quando há mesmo texto por gravar — o
  // ouvinte de `beforeunload` desliga o cache de voltar/avançar de alguns
  // navegadores, e ninguém quer a pergunta à toa.
  const haTextoPorGravar = notas !== notasNoBanco || blocoPendente;
  useEffect(() => {
    if (!haTextoPorGravar) return undefined;
    const aoSair = (e) => {
      e.preventDefault();
      // Navegadores mais velhos só perguntam com `returnValue` preenchido.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [haTextoPorGravar]);

  const excluir = async (tarefa) => {
    const r = await remover("TAREFAS", tarefa.id);
    if (!r?.success) return r;
    setTarefas((ts) => ts.filter((t) => t.id !== tarefa.id));
    trocarGaveta(null);
    toast.success("Tarefa excluída.");
    return r;
  };

  const abrir = (tarefa, situacao = "A_FAZER") => trocarGaveta({ chave: Date.now(), tarefa, situacao });

  const meta = erroCarga
    ? "Não foi possível carregar"
    : carregando
    ? "Carregando tarefas"
    : `${abertas} ${abertas === 1 ? "aberta" : "abertas"}`
      + (atrasadas > 0 ? ` · ${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}` : "");

  const linhasNoBloco = linhasDasNotas(notas).length;

  return (
    <div className="tar-pagina">
      <PageHeader
        title="Tarefas"
        // `tabIndex -1`: focável por código (ver "Virar as N"), fora do Tab.
        titleProps={{ ref: tituloRef, tabIndex: -1 }}
        meta={meta}
        actions={
          <>
            <Button
              variant="secondary"
              iconLeft={<NotebookPen size={15} aria-hidden="true" />}
              disabled={!!erroCarga || carregando}
              ref={botaoBlocoRef}
              loading={ocupadoBloco}
              // O número sozinho no nome acessível seria "Bloco de notas 3":
              // três o quê? O rótulo começa pelo texto visível, como pede a
              // WCAG para quem comanda por voz.
              aria-label={linhasNoBloco
                ? `Bloco de notas, ${linhasNoBloco} ${linhasNoBloco === 1 ? "linha" : "linhas"}`
                : "Bloco de notas"}
              onClick={abrirBloco}
            >
              Bloco de notas
              {linhasNoBloco > 0 && <span className="tar-notas__conta" aria-hidden="true">{linhasNoBloco}</span>}
            </Button>
            <Button variant="primary" iconLeft={<Plus size={15} aria-hidden="true" />} disabled={!!erroCarga} onClick={() => abrir(null)}>
              Nova tarefa
            </Button>
          </>
        }
      />

      {!erroCarga && (
        <div className="tar-filtros">
          {/* Só para quem vê o quadro inteiro: o auxiliar já recebe do banco
              apenas as dele, e o filtro teria as duas opções iguais. */}
          {veTodas && (
            <div className="tar-segmento" role="group" aria-label="Quais tarefas mostrar">
              <button type="button" className="tar-segmento__botao" aria-pressed={!minhas} onClick={() => setMinhas(false)}>
                Todas <span className="tar-segmento__conta">{abertas}</span>
              </button>
              <button type="button" className="tar-segmento__botao" aria-pressed={minhas} onClick={() => setMinhas(true)}>
                Minhas <span className="tar-segmento__conta">{abertasMinhas}</span>
              </button>
            </div>
          )}
          <label className="tar-busca">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar tarefa"
              placeholder="Buscar tarefa"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
        </div>
      )}

      {erroCarga ? (
        <EmptyState
          title="Não foi possível carregar as tarefas"
          description={erroCarga}
          action={<Button onClick={tentarDeNovo}>Tentar de novo</Button>}
        />
      ) : carregando ? (
        <p className="tar-carregando">Carregando tarefas…</p>
      ) : (
        <QuadroDeTarefas
          grupos={grupos}
          pessoaPorId={pessoaPorId}
          unidadePorId={unidadePorId}
          agora={agora}
          estreito={estreito}
          escondidas={escondidas}
          onMover={mover}
          onAbrir={(t) => abrir(t)}
          onAdicionar={(situacao) => abrir(null, situacao)}
          onMostrarAnteriores={() => setMostrarAnteriores(true)}
        />
      )}

      {gaveta && (
        <GavetaDeTarefa
          key={gaveta.chave}
          tarefa={gaveta.tarefa}
          situacaoInicial={gaveta.situacao}
          tituloInicial={gaveta.daNota?.linha}
          pessoas={pessoas}
          unidades={unidades}
          user={user}
          podeExcluir={can(user, "excluirTarefa")}
          onFechar={fecharGaveta}
          onSalvar={salvar}
          onExcluir={excluir}
        />
      )}

      {blocoAberto && (
        <BlocoDeNotas
          textoInicial={notas}
          textoSalvo={notasNoBanco}
          carregado={notasCarregadas}
          onSalvar={gravarNotas}
          onFechar={fecharBloco}
          onVirarTarefa={virarUmaLinha}
          onVirarTodas={virarTodas}
          onPendente={setBlocoPendente}
        />
      )}
    </div>
  );
}
