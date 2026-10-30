import React, { useEffect, useId, useRef, useState } from "react";
import { Button, Field, Gaveta, Textarea, useConfirm } from "../ui";
import { linhasDasNotas } from "../lib/notas";
import { horaEmBrasilia } from "../lib/tarefas";

// Quanto esperar depois da última tecla. Menos que isso grava no meio da
// palavra; mais, e quem fecha o celular logo depois de anotar perde a linha.
const ESPERA_PARA_SALVAR = 800;
// Quanto de silêncio no teclado antes de o leitor de tela ouvir "Salvo às".
// Anunciar a cada pausa de 800 ms atropelaria o eco das próprias teclas.
const ESPERA_PARA_ANUNCIAR = 2000;
// O mesmo teto do `check` do 0044: melhor o campo parar de aceitar do que o
// banco recusar o bloco inteiro.
const TETO_DO_BLOCO = 20000;
const FRASE_ERRO = "Não foi possível salvar. Tentando de novo ao continuar digitando.";

/**
 * O bloco de notas pessoal da tela de Tarefas: anota solto na reunião, uma
 * ideia por linha, e depois passa cada linha para o quadro.
 *
 * Salva sozinho, 800 ms depois da última tecla. A regra que manda em tudo aqui
 * é não perder texto:
 *   - um salvamento de cada vez. Dois no ar podiam voltar fora de ordem, e o
 *     banco ficaria com o texto velho mostrando "Salvo" na tela;
 *   - resposta de um texto que já mudou não diz "Salvo" — agenda outro;
 *   - falhou, o texto fica no campo e a meta diz que não salvou;
 *   - fechar (X, Esc, fundo, "Virar tarefa", "Virar as N") salva antes. Se
 *     esse salvamento falha, o bloco fica aberto com o aviso; só na segunda
 *     tentativa seguida ele fecha, e avisa a página com `salvo = false` para
 *     ela guardar o texto e tentar de novo quando o bloco reabrir. Prender a
 *     pessoa no bloco sem rede seria pior que isso;
 *   - o celular travado não espera debounce: aba escondida (`visibilitychange`
 *     para hidden) ou saindo (`pagehide`) grava na hora, porque o navegador
 *     pode congelar a aba antes de o timer disparar;
 *   - desmontar com texto por gravar grava, sem esperar (troca de rota).
 *
 * Nasce de `textoInicial` e não se sincroniza depois: monte-o só ao abrir.
 * `textoSalvo` é o que o banco tem (se diferente, o bloco já abre salvando).
 * `carregado = false` diz que a última leitura do banco falhou: o bloco avisa
 * e não grava nada até a pessoa digitar ou limpar — nem o texto que a página
 * guardou, nem ao fechar, desmontar ou esconder a aba —, porque sem saber o
 * que o banco tem, gravar por conta própria poderia apagar o que outro
 * aparelho escreveu. Fechar assim devolve `salvo = false` à página.
 *
 * `onSalvar(texto)` devolve `{ success, message }`.
 * `onFechar(texto, salvo)`, `onVirarTarefa(linha, indice, texto)` e
 * `onVirarTodas(linhas, texto)` só são chamados depois do salvamento.
 * `onPendente(bool)` (opcional) avisa quando passa a haver, ou deixa de haver,
 * texto por gravar — a página usa para o aviso de "sair sem salvar".
 */
export default function BlocoDeNotas({
  textoInicial = "",
  textoSalvo,
  carregado = true,
  onSalvar,
  onFechar,
  onVirarTarefa,
  onVirarTodas,
  onPendente,
}) {
  const confirmar = useConfirm();
  const idLista = useId();
  const [texto, setTexto] = useState(textoInicial ?? "");
  // `{ tipo: "ocioso" | "salvando" | "salvo" | "erro", em }`
  const [estado, setEstado] = useState({ tipo: "ocioso" });
  // O que a região viva diz. Separado do `estado` visível: o leitor de tela
  // ouve os erros na hora e o "Salvo às" só depois de uma pausa, nunca o
  // "Salvando…" de cada pausa.
  const [anuncio, setAnuncio] = useState("");
  const [saindo, setSaindo] = useState(false);

  // O que está no campo e o que o banco confirmou. Refs e não estado: são
  // lidos no fim de um `await`, quando o estado do render já é velho.
  const textoRef = useRef(textoInicial ?? "");
  const salvoRef = useRef(textoSalvo ?? textoInicial ?? "");
  const timerRef = useRef(null);
  const anuncioTimerRef = useRef(null);
  const ultimaTeclaRef = useRef(0);
  const emVooRef = useRef(null);
  const montadoRef = useRef(false);
  const saindoRef = useRef(false);
  const insistiuRef = useRef(false);
  const carregadoAoAbrirRef = useRef(carregado);
  // A pessoa digitou (ou limpou) desde que o bloco abriu. Num bloco aberto sem
  // leitura do banco, é a única coisa que autoriza gravar: ver `semAval`.
  const digitouRef = useRef(false);
  // A página já sabe se abriu com texto por gravar; o aviso é só de mudança.
  const pendenteAvisadoRef = useRef((textoInicial ?? "") !== (textoSalvo ?? textoInicial ?? ""));
  // As versões mais novas de `salvarAgora` e `onPendente`, para timer e
  // ouvinte de evento não chamarem as de um render antigo.
  const salvarRef = useRef(null);
  const onPendenteRef = useRef(onPendente);

  const linhas = linhasDasNotas(texto);
  const n = linhas.length;

  /**
   * Aberto sem leitura do banco e ninguém digitou: nada grava — nem fechar,
   * nem desmontar, nem a aba escondida. O texto diferente do "salvo" pode ser
   * só o desta tela (uma linha tirada sem conseguir reler, por exemplo), e
   * gravá-lo apagaria o que outro aparelho escreveu. A página continua com o
   * texto e o junta ao do banco na próxima leitura que der certo.
   */
  const semAval = () => !carregadoAoAbrirRef.current && !digitouRef.current;

  const cancelarAgendado = () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const agendar = () => {
    cancelarAgendado();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      salvarRef.current?.();
    }, ESPERA_PARA_SALVAR);
  };

  const conferirPendente = () => {
    if (!montadoRef.current) return;
    const pendente = textoRef.current !== salvoRef.current;
    if (pendente === pendenteAvisadoRef.current) return;
    pendenteAvisadoRef.current = pendente;
    onPendenteRef.current?.(pendente);
  };

  const calarAnuncio = () => {
    clearTimeout(anuncioTimerRef.current);
    anuncioTimerRef.current = null;
    setAnuncio("");
  };

  const mudarEstado = (novo) => {
    if (!montadoRef.current) return;
    setEstado(novo);
    if (novo.tipo === "erro") {
      clearTimeout(anuncioTimerRef.current);
      setAnuncio(FRASE_ERRO);
    } else if (novo.tipo === "salvo") {
      const frase = `Salvo às ${horaEmBrasilia(novo.em)}`;
      clearTimeout(anuncioTimerRef.current);
      anuncioTimerRef.current = setTimeout(() => {
        anuncioTimerRef.current = null;
        setAnuncio(frase);
      }, Math.max(0, ultimaTeclaRef.current + ESPERA_PARA_ANUNCIAR - Date.now()));
    }
  };

  /**
   * Grava o que está no campo, se o banco ainda não tem. Devolve `true` quando
   * o banco termina com exatamente o texto do campo.
   */
  const salvarAgora = async () => {
    cancelarAgendado();
    // Um de cada vez: espera o que está no ar e então grava o texto de agora.
    while (emVooRef.current) await emVooRef.current;
    // O que estava no ar pode ter agendado outro ao voltar; este já cobre.
    cancelarAgendado();

    const alvo = textoRef.current;
    if (alvo === salvoRef.current) return true;
    // Não gravou, e diz isso: quem chamou (o fechar) conta à página.
    if (semAval()) return false;

    mudarEstado({ tipo: "salvando" });
    const voo = (async () => {
      try {
        return await onSalvar(alvo);
      } catch (err) {
        return { success: false, message: err?.message };
      }
    })();
    emVooRef.current = voo;
    const r = await voo;
    emVooRef.current = null;

    if (!r?.success) {
      mudarEstado({ tipo: "erro" });
      return false;
    }
    salvoRef.current = alvo;
    // A rede voltou: a próxima falha ao fechar volta a segurar o bloco.
    insistiuRef.current = false;
    conferirPendente();
    if (textoRef.current === alvo) {
      mudarEstado({ tipo: "salvo", em: Date.now() });
      return true;
    }
    // A pessoa digitou enquanto este estava no ar: "Salvo" seria mentira.
    mudarEstado({ tipo: "ocioso" });
    if (montadoRef.current && !timerRef.current) agendar();
    return false;
  };

  useEffect(() => {
    salvarRef.current = salvarAgora;
    onPendenteRef.current = onPendente;
  });

  useEffect(() => {
    montadoRef.current = true;
    // Texto que a página guardou sem conseguir gravar: tenta de novo — mas só
    // se a leitura do banco deu certo (ver `carregado` no comentário do topo).
    if (textoRef.current !== salvoRef.current && carregadoAoAbrirRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        salvarRef.current?.();
      }, ESPERA_PARA_SALVAR);
    }
    return () => {
      montadoRef.current = false;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      clearTimeout(anuncioTimerRef.current);
      // Sem `await`: o componente está indo embora, e a gravação segue a fila
      // de sempre (espera a que estiver no ar).
      if (textoRef.current !== salvoRef.current && !semAval()) salvarRef.current?.();
    };
  }, []);

  // Tela travada, troca de aplicativo, aba fechando: grava já.
  useEffect(() => {
    const gravarJa = () => {
      if (textoRef.current !== salvoRef.current && !semAval()) salvarRef.current?.();
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") gravarJa();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("pagehide", gravarJa);
    return () => {
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("pagehide", gravarJa);
    };
  }, []);

  const mudar = (valor) => {
    textoRef.current = valor;
    setTexto(valor);
  };

  const digitar = (e) => {
    const valor = e.target.value;
    mudar(valor);
    digitouRef.current = true;
    ultimaTeclaRef.current = Date.now();
    calarAnuncio();
    if (valor === salvoRef.current && !emVooRef.current) {
      // Desfez até o que o banco já tem: nada a gravar, e o erro de antes
      // deixou de ser verdade.
      cancelarAgendado();
      setEstado((s) => (s.tipo === "erro" ? { tipo: "ocioso" } : s));
    } else {
      agendar();
    }
    conferirPendente();
  };

  /** Salva e só então entrega o texto a `depois`. Ver o comentário do topo. */
  const sair = async (depois) => {
    if (saindoRef.current) return;
    // Sem aval para gravar não há o que tentar de novo: segurar o bloco aberto
    // só confundiria. Fecha já, e diz à página se o texto difere do banco.
    if (semAval()) {
      depois(textoRef.current, textoRef.current === salvoRef.current);
      return;
    }
    saindoRef.current = true;
    setSaindo(true);
    const salvo = await salvarAgora();
    saindoRef.current = false;
    if (montadoRef.current) setSaindo(false);
    if (!salvo && !insistiuRef.current) {
      insistiuRef.current = true;
      return;
    }
    depois(textoRef.current, salvo);
  };

  const virarUma = (linha, indice) => sair((t) => onVirarTarefa(linha, indice, t));

  const virarTodas = async () => {
    const ok = await confirmar({
      title: n === 1 ? "Criar 1 tarefa em A fazer?" : `Criar ${n} tarefas em A fazer?`,
      description: "Cada linha vira uma tarefa com você como responsável.",
      confirmLabel: "Criar",
    });
    if (!ok) return;
    sair((t) => onVirarTodas(linhasDasNotas(t), t));
  };

  const limpar = async () => {
    const ok = await confirmar({
      title: "Apagar todas as anotações?",
      description: "O bloco fica vazio. Não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    mudar("");
    digitouRef.current = true;
    conferirPendente();
    await salvarAgora();
  };

  const frase =
    estado.tipo === "salvando" ? "Salvando…"
    : estado.tipo === "salvo" ? `Salvo às ${horaEmBrasilia(estado.em)}`
    : estado.tipo === "erro" ? FRASE_ERRO
    : !carregado ? "Não consegui carregar o que estava salvo. O que você digitar aqui substitui o bloco salvo."
    : "";

  return (
    <Gaveta
      open
      onClose={() => sair(onFechar)}
      titulo="Bloco de notas"
      meta={
        <>
          Uma ideia por linha. <span className="tar-notas__estado">{frase}</span>
          {/* Existe desde o início, vazia: região viva criada junto com o
              texto não é anunciada por todo leitor de tela. */}
          <span className="tar-anuncio" aria-live="polite">{anuncio}</span>
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={limpar} disabled={saindo || !texto.trim()}>
            Limpar bloco
          </Button>
          <span className="tar-gaveta__espaco" />
          <Button variant="primary" onClick={virarTodas} disabled={saindo || n === 0}>
            {n === 1 ? "Virar 1 em tarefa" : `Virar as ${n} em tarefas`}
          </Button>
        </>
      }
    >
      <div className="tar-notas">
        <Field label="Anotações">
          <Textarea
            rows={8}
            value={texto}
            maxLength={TETO_DO_BLOCO}
            // Enquanto salva para sair, o que se digitasse não entraria no
            // salvamento e sumiria com o bloco.
            readOnly={saindo}
            onChange={digitar}
          />
        </Field>

        <section className="tar-notas__secao" aria-labelledby={idLista}>
          <h3 className="tar-notas__titulo" id={idLista}>Passar para o quadro</h3>
          {n > 0 ? (
            <ul className="tar-notas__lista" aria-labelledby={idLista}>
              {linhas.map((linha, i) => (
                <li key={`${i}-${linha}`} className="tar-notas__item">
                  <span className="tar-notas__texto" title={linha}>{linha}</span>
                  <Button
                    size="sm"
                    className="tar-notas__virar"
                    aria-label={`Virar em tarefa: ${linha}`}
                    disabled={saindo}
                    onClick={() => virarUma(linha, i)}
                  >
                    Virar tarefa
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tar-notas__vazio">Nada anotado ainda.</p>
          )}
        </section>
      </div>
    </Gaveta>
  );
}
