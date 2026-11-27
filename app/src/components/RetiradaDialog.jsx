import React, { useState, useMemo, useEffect, useRef } from "react";
import Assinatura, { assinaturaParaBlob } from "./Assinatura";
import LeitorQR from "./LeitorQR";
import { registrarRetirada, quemRetiraPeloApp } from "../api/retiradas";
import { Modal, Field, Input, Textarea, Checkbox, Button, useToast } from "../ui";
import { maskCPF, soDigitos } from "../lib/format";
import { ScanLine } from "lucide-react";
import { Iniciais } from "./app/pecas";

/**
 * A retirada de encomenda, do começo ao fim: autorização, conferência do que
 * está saindo, e assinatura.
 *
 * Isto substitui o livro de papel da portaria. A diferença que justifica a
 * troca não é comodidade — é que do livro se arranca a folha, e daqui não: quem
 * registra não pode alterar nem apagar (políticas do 0027).
 *
 * `pendentes` traz o cadastro que o porteiro abriu, e só ele. Quem faz esse
 * recorte é `pendentesDoCadastro`, em `src/lib/retirada.js`.
 *
 * A UNIDADE de conferência é a nota fiscal, não a encomenda (0029): é o número
 * impresso na etiqueta que identifica o pacote na prateleira. Item que já saiu
 * numa retirada anterior não aparece de novo — mostrá-lo obrigaria o porteiro a
 * lembrar de cor qual das caixas já foi.
 *
 * Fica fora de `Encomendas.jsx` de propósito. Aquele arquivo tem 2000 linhas, e
 * fluxo novo lá dentro seria mais um trecho que ninguém lê junto.
 */

/**
 * Quantos volumes o cadastro declara.
 *
 * `quantidade_encomenda` é `text` no banco (herança da planilha), então chega
 * "3" e não 3. Qualquer coisa que não seja número maior que 1 vira 1: um
 * cadastro sempre tem ao menos um volume, e campo em branco não pode fazer a
 * lista sumir.
 */
export const volumesDe = (p) => {
  const n = Number(p?.quantidade_encomenda);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
};

/** As notas daquele cadastro, na ordem em que foram cadastradas. */
const notasDe = (notas, p) =>
  notas.filter((n) => String(n?.id_encomenda ?? "") === String(p.id));

/**
 * O que ainda está na prateleira daquele cadastro.
 *
 * Devolve uma lista de itens conferíveis: os que têm nota vêm identificados por
 * ela; o que sobra de volume declarado sem nota vira item genérico. Itens que
 * já saíram em retirada anterior ficam de fora — é o ponto todo do 0029.
 */
export function itensPendentes(p, notas, jaRetirados) {
  const doCadastro = jaRetirados.filter((r) => String(r?.id_entrega ?? "") === String(p.id));
  const notasEntregues = new Set(
    doCadastro.map((r) => String(r?.id_nota ?? "")).filter((x) => x !== "")
  );

  const daNota = notasDe(notas, p)
    .filter((n) => !notasEntregues.has(String(n.id)))
    .map((n) => ({
      chave: `${p.id}:n${n.id}`,
      idNota: n.id,
      rotulo: [
        `NF ${String(n.numero_fiscal ?? "").trim() || "—"}`,
        String(n.transportadora ?? "").trim(),
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  // Volume declarado além das notas cadastradas: cadastro antigo, ou item que
  // entrou sem nota. Conta como volume, e sem nota não dá para dizer qual é.
  const semNotaTotal = Math.max(0, volumesDe(p) - notasDe(notas, p).length);
  const semNotaSaidos = doCadastro.filter((r) => !r?.id_nota).length;
  const semNota = Array.from(
    { length: Math.max(0, semNotaTotal - semNotaSaidos) },
    (_, i) => ({
      chave: `${p.id}:v${i}`,
      idNota: null,
      rotulo: semNotaTotal > 1 ? `Volume sem nota ${i + 1}` : "Volume sem nota",
    })
  );

  return [...daNota, ...semNota];
}

/** O cabeçalho do cadastro: número da encomenda e titular. */
const rotuloDaEncomenda = (p) =>
  [p.numero_encomenda ? `#${p.numero_encomenda}` : "", p.nome ?? ""]
    .filter(Boolean)
    .join(" · ");

/** Notificação enviada é o que faz existir um código na mão do morador. */
const foiNotificada = (p) =>
  String(p?.notificado ?? "").trim().toUpperCase() === "SIM";

/**
 * A janela em 3 passos (2026-11-04): Quem retira → O que sai → Assinar.
 *
 * Pensada para não fazer fila no balcão. O caso comum (morador com app, uma
 * encomenda, leva tudo) é: ler o QR, assinar, concluir. Reconhecida a pessoa,
 * a janela avança sozinha; sem outra encomenda da unidade para decidir, pula
 * "O que sai" (o link "Mudar itens" volta a ele).
 */
const ESPERA_AO_RECONHECER = 900;

/**
 * Quem veio NÃO usa o app e o apartamento tem app: exigir o código?
 * Auditoria 05/11 (V1): sim, o código é a prova. Decisão do usuário
 * (23/11/2026): no começo do app, não; quem não usa o app retira com nome,
 * CPF e assinatura, como antes. Para travar de novo: `true` (sem migração).
 */
const CODIGO_DE_QUEM_NAO_USA_O_APP = false;

export default function RetiradaDialog({
  aberto,
  pendentes = [],
  notasFiscais = [],
  jaRetirados = [],
  idUnidade,
  usuario,
  aoFechar,
  aoConcluir,
  // O código lido do QR do morador (Encomendas > Ler QR): a janela já abre conferida.
  codigoInicial = "",
  // Quem do app mostrou o QR (`moradores_app.id`): o QR diz, o código digitado não.
  appInicial = null,
  // O cadastro que o porteiro abriu. Só ele nasce marcado; as outras
  // encomendas da unidade entram pelo código / QR delas (ou marcando, sem app).
  idAberto,
  // Alguém da unidade usa o app: é por ele que o código chega ao morador.
  // `undefined` (quem não informa) mantém o campo como sempre foi.
  temApp,
  // Ver CODIGO_DE_QUEM_NAO_USA_O_APP (a prop existe para os testes).
  codigoDeQuemNaoUsaOApp = CODIGO_DE_QUEM_NAO_USA_O_APP,
}) {
  const toast = useToast();

  // Cada cadastro com a sua lista do que ainda está na prateleira.
  const listas = useMemo(
    () => pendentes.map((p) => ({ p, itens: itensPendentes(p, notasFiscais, jaRetirados) })),
    [pendentes, notasFiscais, jaRetirados]
  );
  const chavesDe = (id) => listas.find((l) => l.p.id === id)?.itens.map((i) => i.chave) ?? [];
  const ehAberta = (p) => idAberto == null || String(p.id) === String(idAberto);
  const marcadasDoInicio = () => listas.filter(({ p }) => ehAberta(p)).flatMap(({ itens }) => itens.map((i) => i.chave));

  const pelo = (c) => {
    const x = String(c ?? "").trim().toUpperCase();
    return x ? pendentes.find((p) => String(p.cod ?? "").toUpperCase() === x) ?? null : null;
  };

  const [passo, setPasso] = useState(1);
  // As encomendas conferidas pelo código (ou QR). Cada encomenda tem o seu
  // código; dois QRs conferem duas encomendas, com uma assinatura só.
  const [conferidas, setConferidas] = useState(() => {
    const p = pelo(codigoInicial);
    return p ? [p.id] : [];
  });
  // Nasce marcado o cadastro aberto (e o do QR que abriu a janela).
  const [marcadas, setMarcadas] = useState(() => {
    const p = pelo(codigoInicial);
    return [...new Set([...marcadasDoInicio(), ...(p ? chavesDe(p.id) : [])])];
  });
  const [codigo, setCodigo] = useState("");
  const [codigoOutra, setCodigoOutra] = useState("");
  const [lendoQR, setLendoQR] = useState(null); // "pessoa" | "outra" | null
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [observacao, setObservacao] = useState("");
  const [temAssinatura, setTemAssinatura] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // "Quem veio é quem usa o app": nasce marcado, que é o caso comum.
  const [doApp, setDoApp] = useState(true);
  const [idApp, setIdApp] = useState(appInicial);
  const [pessoas, setPessoas] = useState({ codigo: "", lista: [], carregando: false });

  /** Notificação por WhatsApp enviada (antes do 0063): o código está na mão do morador. */
  const houveNotificacao = pendentes.some(foiNotificada);
  const temCodigo = pendentes.some((p) => String(p.cod ?? "").trim() !== "");
  // O código só está na mão do morador se ele usa o app (ou recebeu o antigo
  // WhatsApp). Sem nenhum dos dois, não há o que ler nem digitar.
  const mostraCodigo = temCodigo && (temApp !== false || houveNotificacao);
  // O caminho do app: QR ou código, e a pessoa vem do cadastro dela.
  const peloApp = mostraCodigo && doApp;
  // O morador recebeu o código (app ou aviso): a encomenda só sai com um código
  // conferido, venha quem vier. Era o `exigeCodigo` de antes; sem ele, desmarcar
  // "quem veio usa o app" entregava a encomenda só com nome e CPF digitados.
  // O código chega pelo app (alguém da unidade o usa) ou pelo aviso enviado.
  // Quem não informa se há app fica na regra de sempre: só o aviso enviado.
  // Desmarcado "quem veio usa o app", só com a trava ligada (23/11/2026).
  const precisaCodigo = temCodigo && (temApp === true || houveNotificacao) && (doApp || codigoDeQuemNaoUsaOApp);

  // A primeira conferida diz quem é a pessoa do app (o código serve ao
  // apartamento inteiro) e o titular gravado no comprovante.
  const casada = pendentes.find((p) => p.id === conferidas[0]) ?? null;
  const via = casada ? "codigo" : "identificacao";

  /** Confere a encomenda do código e marca os itens dela. */
  const conferir = (p) => {
    setConferidas((a) => (a.includes(p.id) ? a : [...a, p.id]));
    setMarcadas((a) => [...new Set([...a, ...chavesDe(p.id)])]);
  };
  const digitarCodigo = (valor, guardar) => {
    const p = pelo(valor);
    if (p) {
      conferir(p);
      guardar("");
    } else {
      guardar(valor);
    }
  };

  // Quem do apartamento usa o app (titular e dependentes), com nome e CPF. O
  // banco só responde com um código que está na portaria (0086).
  const codigoCasado = casada ? String(casada.cod).toUpperCase() : "";
  useEffect(() => {
    if (!codigoCasado || !peloApp) return undefined;
    let vivo = true;
    setPessoas({ codigo: codigoCasado, lista: [], carregando: true });
    quemRetiraPeloApp(codigoCasado).then((lista) => {
      if (vivo) setPessoas({ codigo: codigoCasado, lista: Array.isArray(lista) ? lista : [], carregando: false });
    });
    return () => {
      vivo = false;
    };
  }, [codigoCasado, peloApp]);
  const procurando = pessoas.carregando && pessoas.codigo === codigoCasado;
  const doCodigo = pessoas.codigo === codigoCasado ? pessoas.lista : [];

  // Qual pessoa é: a do QR; sem QR, a única do apartamento no app. Com mais de
  // uma e código digitado, o porteiro toca no nome de quem está no balcão.
  const escolhida = peloApp
    ? doCodigo.find((x) => String(x.id) === String(idApp ?? "")) ?? (doCodigo.length === 1 ? doCodigo[0] : null)
    : null;

  // Pessoa reconhecida: nome e CPF vêm do cadastro dela no app.
  const preenchidoPeloApp = useRef(null);
  useEffect(() => {
    if (!escolhida || preenchidoPeloApp.current === escolhida.id) return;
    preenchidoPeloApp.current = escolhida.id;
    setNome(escolhida.nome ?? "");
    // O CPF do app chega mascarado (0096): fica fora do campo, e o banco o
    // completa ao gravar. Sem CPF no app, o porteiro digita o do documento.
    setCpf("");
  }, [escolhida]);

  const marcarDoApp = (marcado) => {
    setDoApp(marcado);
    // Quem veio não é quem usa o app: sem app não há código. O que o QR tinha
    // conferido sai, e o nome e o CPF seriam os da pessoa errada.
    setNome("");
    setCpf("");
    setCodigo("");
    preenchidoPeloApp.current = null;
    // Nos dois sentidos: o que foi marcado ou conferido do outro jeito não pode
    // continuar saindo escondido (uma encomenda marcada sem app virava texto ao
    // religar o app, mas seguia em `marcadas` e saía como "conferida").
    setConferidas([]);
    setIdApp(null);
    setMarcadas(marcadasDoInicio());
  };

  // As outras encomendas da unidade: as que não nasceram marcadas.
  const outras = listas.filter(({ p, itens }) => !ehAberta(p) && itens.length > 0);
  const temOutras = outras.length > 0;
  const depoisDeQuem = temOutras ? 2 : 3;

  // Reconhecida pelo app com CPF lá: o CPF é o do cadastro, que o banco põe.
  const cpfPeloApp = Boolean(peloApp && escolhida?.tem_cpf && casada);
  const identificado = Boolean(nome.trim()) && (cpfPeloApp || soDigitos(cpf).length === 11);
  // Com código na mão do morador, a prova é ele: sem um conferido o passo não
  // fecha, pelo app ou não.
  const podeSeguir = identificado && (!precisaCodigo || conferidas.length > 0);

  // Reconhecida a pessoa pelo app, a janela segue sozinha: o porteiro só vê o
  // cartão por um instante. Uma vez por pessoa: quem volta não é empurrado.
  const avancouCom = useRef(null);
  const reconhecida = passo === 1 && peloApp && escolhida && podeSeguir ? escolhida.id : null;
  useEffect(() => {
    if (reconhecida == null || avancouCom.current === reconhecida) return undefined;
    const t = setTimeout(() => {
      avancouCom.current = reconhecida;
      setPasso(depoisDeQuem);
    }, ESPERA_AO_RECONHECER);
    return () => clearTimeout(t);
  }, [reconhecida, depoisDeQuem]);

  /** Os itens que saem agora, no formato que o banco espera. */
  const itensSaindo = useMemo(
    () =>
      listas.flatMap(({ p, itens }) =>
        itens.filter((i) => marcadas.includes(i.chave)).map((i) => ({ id_entrega: p.id, id_nota: i.idNota }))
      ),
    [listas, marcadas]
  );

  /**
   * Só fecha o cadastro que não deixou nada para trás. Marcar 2 de 3 e
   * encerrar seria dizer que a caixa da prateleira foi entregue; o que sobra
   * vira "Parcialmente entregue" e sai numa segunda retirada.
   */
  const entregasCompletas = useMemo(
    () =>
      listas
        .filter(({ itens }) => itens.length > 0 && itens.every((i) => marcadas.includes(i.chave)))
        .map(({ p }) => p.id),
    [listas, marcadas]
  );
  const encomendasSaindo = new Set(itensSaindo.map((i) => i.id_entrega)).size;
  // Sobrou item numa encomenda que está saindo (as outras da unidade não contam).
  const sobrouItem = listas.some(
    ({ itens }) => itens.some((i) => marcadas.includes(i.chave)) && itens.some((i) => !marcadas.includes(i.chave))
  );

  const semEncomenda = entregasCompletas.length === 0;
  const pedeObservacao = semEncomenda || sobrouItem;

  // Código digitado por inteiro que não é de nenhuma encomenda da unidade: o
  // que casa some do campo na hora, então o que sobra ali é o que não bate.
  const codigoNaoBate = codigo.trim().length >= 5;
  const outraNaoBate = codigoOutra.trim().length >= 5;

  const podeConcluir =
    temAssinatura && podeSeguir && (!semEncomenda || Boolean(observacao.trim())) && !salvando;

  const alternar = (chave) =>
    setMarcadas((atual) => (atual.includes(chave) ? atual.filter((x) => x !== chave) : [...atual, chave]));

  const concluir = async () => {
    setSalvando(true);
    try {
      const tela = document.querySelector("[data-testid='assinatura-tela']");
      // Repassa o que o canvas devolveu, mesmo `null`: quem recusa comprovante
      // em branco é `registrarRetirada`, com mensagem para o porteiro.
      const assinatura = await assinaturaParaBlob(tela);
      const r = await registrarRetirada({
        idUnidade,
        nome: nome.trim(),
        cpf,
        idMorador: casada?.id_morador ?? null,
        pelaApp: cpfPeloApp ? { cod: String(casada.cod), idApp: escolhida.id } : null,
        via,
        observacao: observacao.trim(),
        entregas: entregasCompletas,
        itens: itensSaindo,
        entreguePor: usuario?.nome ?? "",
        assinatura,
      });
      if (!r.success) {
        // Não fecha: fechar numa falha faria o porteiro achar que deu certo.
        toast.error(r.message);
        return;
      }
      toast.success("Retirada registrada");
      aoConcluir?.(r.id);
    } finally {
      setSalvando(false);
    }
  };

  const ajudaDoCodigo = () => {
    if (codigoNaoBate) return "Este código não é de nenhuma encomenda da unidade na portaria.";
    if (!doApp) return "Obrigatório: peça ao morador o código que ele recebeu no app.";
    return "O morador tem o código no app (e o QR).";
  };

  const camposDeIdentificacao = (soCpf = false) => (
    <>
      {!soCpf && (
        <Field label="Nome de quem está retirando" required>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
      )}
      <Field
        label="CPF de quem está retirando"
        required
        help={soCpf ? "O app não tem o CPF desta pessoa: digite." : "Só números"}
      >
        <Input
          value={cpf}
          onChange={(e) => setCpf(maskCPF(e.target.value))}
          inputMode="numeric"
          placeholder="000.000.000-00"
        />
      </Field>
    </>
  );

  // ---------------------------------------------------------------- passo 1
  const quemRetira = () => (
    <>
      {mostraCodigo && conferidas.length === 0 && (
        <>
          <button type="button" className="ret-qr" onClick={() => setLendoQR("pessoa")} disabled={!doApp}>
            <ScanLine size={30} aria-hidden="true" />
            <span>
              <b>Ler QR do celular</b>
              <small>{doApp ? "O morador abre a encomenda no app e mostra o QR." : "Desligado: quem veio não usa o app."}</small>
            </span>
          </button>
          {(doApp || precisaCodigo) && (
            <Field label="Código de retirada" required={precisaCodigo} help={ajudaDoCodigo()}>
              <Input
                value={codigo}
                onChange={(e) => digitarCodigo(e.target.value, setCodigo)}
                autoCapitalize="characters"
                placeholder="ou digite os 5 caracteres"
              />
            </Field>
          )}
        </>
      )}
      {precisaCodigo && conferidas.length > 0 && (
        <ul className="ret-conferidas" aria-label="Encomendas conferidas pelo código">
          {conferidas.map((id) => {
            const p = pendentes.find((x) => x.id === id);
            return p ? <li key={id}>Confere: {rotuloDaEncomenda(p)}</li> : null;
          })}
        </ul>
      )}

      {mostraCodigo && (
        <div className="ret-quem">
          <Checkbox
            label="Quem veio retirar é quem usa o app"
            checked={doApp}
            onChange={(e) => marcarDoApp(e.target.checked)}
          />
        </div>
      )}

      {!peloApp ? (
        camposDeIdentificacao()
      ) : (
        <div className="ret-quem__corpo" aria-live="polite">
          {!casada ? (
            <p className="ret-quem__espera">Leia o QR ou digite o código: o sistema descobre quem é.</p>
          ) : procurando ? (
            <p className="ret-quem__espera">Procurando quem usa o app…</p>
          ) : escolhida ? (
            <>
              <div className="ret-quem__pessoa">
                <Iniciais nome={escolhida.nome} />
                <div>
                  <b>{escolhida.nome}</b>
                  <span>
                    {escolhida.tipo}
                    {escolhida.tem_cpf ? ` · CPF ${escolhida.cpf}` : " · sem CPF no app"}
                  </span>
                  {doCodigo.length > 1 && (
                    <button
                      type="button"
                      className="ret-quem__trocar"
                      onClick={() => {
                        setIdApp(null);
                        preenchidoPeloApp.current = null;
                        avancouCom.current = null;
                        setNome("");
                        setCpf("");
                      }}
                    >
                      Não é esta pessoa
                    </button>
                  )}
                </div>
              </div>
              {!escolhida.tem_cpf && camposDeIdentificacao(true)}
              {reconhecida != null && avancouCom.current !== reconhecida && (
                <p className="ret-quem__espera">Indo para {depoisDeQuem === 3 ? "a assinatura" : "os itens"}…</p>
              )}
            </>
          ) : doCodigo.length > 1 ? (
            <div className="ret-quem__escolha" role="group" aria-label="Quem do app veio retirar">
              <p className="ret-quem__dica">O código é do apartamento. Quem está no balcão?</p>
              {doCodigo.map((x) => (
                <button key={x.id} type="button" className="ret-quem__opcao" onClick={() => setIdApp(x.id)}>
                  <b>{x.nome}</b>
                  <span>{x.tipo}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="ret-quem__dica">Não achamos o cadastro no app. Preencha o nome e o CPF.</p>
              {camposDeIdentificacao()}
            </>
          )}
        </div>
      )}
    </>
  );

  // ---------------------------------------------------------------- passo 2
  const caixa = (p, i, rotulo) => (
    <Checkbox key={i.chave} label={rotulo} checked={marcadas.includes(i.chave)} onChange={() => alternar(i.chave)} />
  );
  const grupoDe = ({ p, itens }) => {
    const jaSaiu = Number(p.volumes_retirados) > 0;
    // Item único e nenhum histórico: uma caixa só, com o nome do cadastro.
    if (itens.length === 1 && !jaSaiu) return caixa(p, itens[0], `${rotuloDaEncomenda(p)} · ${itens[0].rotulo}`);
    return (
      <div className="ret-lista__grupo" key={p.id}>
        <p className="ret-lista__titulo">
          {rotuloDaEncomenda(p)} · {itens.length} na prateleira
          {/* Sem isto, o porteiro da noite não sabe que parte já saiu. */}
          {jaSaiu && ` · ${p.volumes_retirados} já retirado(s)`}
        </p>
        {itens.map((i) => caixa(p, i, i.rotulo))}
      </div>
    );
  };
  const oQueSai = () => {
    const abertas = listas.filter(({ p }) => ehAberta(p));
    const vazio = listas.every(({ itens }) => itens.length === 0);
    return (
      <fieldset className="ret-lista">
        <legend>
          Itens entregues agora
          {pendentes.length > 1 && ` · ${pendentes.length} encomendas da unidade`}
        </legend>
        {vazio ? (
          <p className="ret-lista__vazia">Nada pendente neste cadastro. Descreva na observação o que está sendo entregue.</p>
        ) : (
          abertas.map(grupoDe)
        )}

        {temOutras && (
          <div className="ret-lista__outras">
            <p className="ret-lista__separador">Outras encomendas da unidade na portaria</p>
            {outras.map((l) =>
              !precisaCodigo || conferidas.includes(l.p.id) ? (
                <React.Fragment key={l.p.id}>
                  {precisaCodigo && <p className="ret-conferidas__uma">Confere: {rotuloDaEncomenda(l.p)}</p>}
                  {grupoDe(l)}
                </React.Fragment>
              ) : (
                <p className="ret-lista__fora" key={l.p.id}>
                  {rotuloDaEncomenda(l.p)} · {l.itens.length} na prateleira
                </p>
              )
            )}
            {precisaCodigo && outras.some(({ p }) => !conferidas.includes(p.id)) && (
              <div className="ret-lista__incluir">
                <Field
                  label="Código de outra encomenda"
                  help={outraNaoBate ? "Este código não é de nenhuma encomenda da unidade na portaria." : "Vai levar? Leia o QR ou digite o código dela."}
                >
                  <Input
                    value={codigoOutra}
                    onChange={(e) => digitarCodigo(e.target.value, setCodigoOutra)}
                    autoCapitalize="characters"
                    placeholder="5 caracteres"
                  />
                </Field>
                {doApp && <Button variant="secondary" onClick={() => setLendoQR("outra")}>Ler QR</Button>}
              </div>
            )}
            {!precisaCodigo && <p className="ret-lista__vazia">Sem app não há código: marque o que a pessoa vai levar.</p>}
          </div>
        )}
      </fieldset>
    );
  };

  // ---------------------------------------------------------------- passo 3
  const assinar = () => {
    const volumes = itensSaindo.length;
    return (
      <>
        <div className="ret-resumo">
          <b>{nome.trim() || "—"}</b>
          <span>
            {escolhida ? `${escolhida.tipo} · pelo app` : "Identificado pelo porteiro"}
            {cpfPeloApp ? ` · CPF ${escolhida.cpf}` : cpf ? ` · CPF ${cpf}` : ""}
          </span>
          <span>
            Leva {volumes} {volumes === 1 ? "volume" : "volumes"} de {encomendasSaindo}{" "}
            {encomendasSaindo === 1 ? "encomenda" : "encomendas"}
          </span>
          <button type="button" className="ret-quem__trocar" onClick={() => setPasso(2)}>Mudar itens</button>
        </div>

        <Field label="Assinatura de quem está retirando" required>
          <Assinatura aoMudar={setTemAssinatura} />
        </Field>

        <Field
          label="Observação"
          required={semEncomenda}
          help={
            semEncomenda && itensSaindo.length > 0
              ? "Obrigatória: sobrou item, então o cadastro fica “Parcialmente entregue” e continua na portaria. Diga o que ficou."
              : semEncomenda
                ? "Obrigatória: sem item marcado, é ela que diz o que foi entregue."
                : pedeObservacao
                  ? "Sobrou item: diga o que ficou na portaria."
                  : "Opcional. Use para o que não bate."
          }
        >
          <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
        </Field>
      </>
    );
  };

  const PASSOS = ["Quem retira", "O que sai", "Assinar"];

  return (
    <Modal
      open={aberto}
      onClose={aoFechar}
      title="Entregar encomenda"
      size="md"
      footer={
        <>
          {passo === 1 ? (
            <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          ) : (
            <Button variant="ghost" onClick={() => setPasso(passo === 3 && !temOutras ? 1 : passo - 1)}>Voltar</Button>
          )}
          {passo < 3 ? (
            <Button
              variant="primary"
              onClick={() => {
                if (passo === 1 && escolhida) avancouCom.current = escolhida.id;
                setPasso(passo === 1 ? depoisDeQuem : 3);
              }}
              disabled={passo === 1 && !podeSeguir}
            >
              Continuar
            </Button>
          ) : (
            <Button variant="primary" onClick={concluir} disabled={!podeConcluir} loading={salvando}>
              Concluir retirada
            </Button>
          )}
        </>
      }
    >
      <ol className="ret-passos" aria-label="Passos da entrega">
        {PASSOS.map((t, i) => (
          <li
            key={t}
            className={i + 1 < passo ? "ret-passos__feito" : i + 1 === passo ? "ret-passos__agora" : ""}
            aria-current={i + 1 === passo ? "step" : undefined}
          >
            {t}
          </li>
        ))}
      </ol>

      {passo === 1 && quemRetira()}
      {passo === 2 && oQueSai()}
      {passo === 3 && assinar()}

      {lendoQR && (
        <LeitorQR
          aberto
          aoFechar={() => setLendoQR(null)}
          aoLer={(c, quem = null) => {
            const modo = lendoQR;
            setLendoQR(null);
            const p = pelo(c);
            if (!p) {
              (modo === "outra" ? setCodigoOutra : setCodigo)(c);
              return;
            }
            // O primeiro QR diz quem é; os seguintes só conferem encomendas.
            if (modo === "pessoa" && !conferidas.length) setIdApp(quem);
            conferir(p);
          }}
        />
      )}
    </Modal>
  );
}
