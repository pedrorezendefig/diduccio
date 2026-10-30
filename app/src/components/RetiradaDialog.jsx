import React, { useState, useMemo, useEffect, useRef } from "react";
import Assinatura, { assinaturaParaBlob } from "./Assinatura";
import { registrarRetirada } from "../api/retiradas";
import { Modal, Field, Input, Textarea, Checkbox, Button, useToast } from "../ui";
import { maskCPF, soDigitos } from "../lib/format";

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

export default function RetiradaDialog({
  aberto,
  pendentes = [],
  notasFiscais = [],
  jaRetirados = [],
  idUnidade,
  usuario,
  aoFechar,
  aoConcluir,
}) {
  const toast = useToast();

  // Cada cadastro com a sua lista do que ainda está na prateleira.
  const listas = useMemo(
    () => pendentes.map((p) => ({ p, itens: itensPendentes(p, notasFiscais, jaRetirados) })),
    [pendentes, notasFiscais, jaRetirados]
  );

  // Nasce com tudo marcado. O caso comum é o morador levar tudo o que chegou;
  // começar vazio faria o caso comum exigir cliques, e cada clique esquecido é
  // uma encomenda que continua constando como pendente na portaria.
  const [marcadas, setMarcadas] = useState(() =>
    listas.flatMap(({ itens }) => itens.map((i) => i.chave))
  );
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [observacao, setObservacao] = useState("");
  const [temAssinatura, setTemAssinatura] = useState(false);
  const [salvando, setSalvando] = useState(false);

  /**
   * Sem notificação enviada não existe código na mão de ninguém.
   *
   * O código só é gerado quando há telefone (gatilho do 0020), e só chega ao
   * morador quando o WhatsApp sai. Deixar o campo aberto nesse caso convida o
   * porteiro a digitar o número da encomenda ali, não casar com nada, e seguir
   * pela identificação achando que conferiu alguma coisa.
   */
  const houveNotificacao = pendentes.some(foiNotificada);

  /**
   * Notificado com código na mão: o código é OBRIGATÓRIO.
   *
   * Ele existe justamente para provar que quem desceu é quem recebeu o aviso.
   * Deixá-lo opcional fazia toda retirada notificada poder seguir pela
   * identificação manual — o caminho que existe para quem NÃO tem código — e o
   * registro nascia dizendo "identificacao" num caso em que havia prova melhor
   * disponível e não usada.
   *
   * `temCodigo` entra na conta porque exigir o que não existe trava a portaria:
   * o gatilho do 0020 só gera código quando há telefone, e há encomenda antiga
   * marcada como notificada sem `cod` nenhum.
   */
  const temCodigo = pendentes.some((p) => String(p.cod ?? "").trim() !== "");
  const exigeCodigo = houveNotificacao && temCodigo;

  // A encomenda cujo código foi digitado. É ela que diz quem é o TITULAR —
  // informação diferente de quem está retirando.
  const casada = useMemo(() => {
    const digitado = codigo.trim().toUpperCase();
    if (!digitado) return null;
    return pendentes.find((p) => String(p.cod ?? "").toUpperCase() === digitado) ?? null;
  }, [codigo, pendentes]);

  // No caminho do código, o nome vem preenchido com o do titular — e continua
  // editável. Quem desce pode ser a filha, o marido, a diarista; sem a correção,
  // toda retirada por terceiro seria gravada com o nome de quem não estava lá.
  //
  // Preenche UMA vez por código reconhecido, e é para isso que existe a
  // referência. A primeira versão condicionava a "o campo está vazio", e o
  // efeito reenchia no instante em que o porteiro apagava para digitar outro
  // nome — na prática, o campo não deixava ser corrigido.
  const preenchidoPara = useRef(null);
  useEffect(() => {
    if (casada && preenchidoPara.current !== casada.id) {
      preenchidoPara.current = casada.id;
      setNome(casada.nome ?? "");
    }
  }, [casada]);

  const via = casada ? "codigo" : "identificacao";

  /** Os itens que saem agora, no formato que o banco espera. */
  const itensSaindo = useMemo(
    () =>
      listas.flatMap(({ p, itens }) =>
        itens
          .filter((i) => marcadas.includes(i.chave))
          .map((i) => ({ id_entrega: p.id, id_nota: i.idNota }))
      ),
    [listas, marcadas]
  );

  /**
   * Só fecha o cadastro que não deixou nada para trás.
   *
   * Marcar 2 de 3 e mesmo assim encerrar seria dizer que a caixa da prateleira
   * foi entregue — assinada, com CPF e hora. O que sobra vira 'Parcialmente
   * entregue' e sai numa segunda retirada, com a sua própria assinatura.
   */
  const entregasCompletas = useMemo(
    () =>
      listas
        .filter(({ itens }) => itens.length > 0 && itens.every((i) => marcadas.includes(i.chave)))
        .map(({ p }) => p.id),
    [listas, marcadas]
  );

  const semEncomenda = entregasCompletas.length === 0;
  const faltaItem = semEncomenda && itensSaindo.length > 0;

  // Código digitado por inteiro que não bate com nada da lista.
  //
  // Agora que a lista é só o cadastro aberto, o desencontro tem um significado
  // útil: o porteiro abriu a encomenda errada. Sem dizer isso, o campo
  // simplesmente não reagiria, e a retirada seguiria pela identificação manual
  // — gravando baixa no cadastro errado, com o código do certo na mão.
  const codigoNaoBate = !casada && codigo.trim().length >= 5;

  // Sem cadastro completo a observação é obrigatória: assinatura sem nada
  // ligado e sem explicação é um comprovante que não prova nada. O banco recusa
  // também (0027); aqui é para o porteiro descobrir no campo.
  const podeConcluir =
    temAssinatura &&
    (!exigeCodigo || Boolean(casada)) &&
    Boolean(nome.trim()) &&
    soDigitos(cpf).length === 11 &&
    (!semEncomenda || Boolean(observacao.trim())) &&
    !salvando;

  const alternar = (chave) =>
    setMarcadas((atual) =>
      atual.includes(chave) ? atual.filter((x) => x !== chave) : [...atual, chave]
    );

  const concluir = async () => {
    setSalvando(true);
    try {
      const tela = document.querySelector("[data-testid='assinatura-tela']");
      // Repassa o que o canvas devolveu, mesmo `null`. Fabricar um blob aqui
      // contornaria a única guarda que impede gravar comprovante em branco: se
      // o navegador negar o contexto 2D, o campo diz "assinado" e o PNG sai
      // vazio. Quem recusa é `registrarRetirada`, com mensagem escrita para o
      // porteiro ler.
      const assinatura = await assinaturaParaBlob(tela);

      const r = await registrarRetirada({
        idUnidade,
        nome: nome.trim(),
        cpf,
        idMorador: casada?.id_morador ?? null,
        via,
        observacao: observacao.trim(),
        entregas: entregasCompletas,
        itens: itensSaindo,
        entreguePor: usuario?.nome ?? "",
        assinatura,
      });

      if (!r.success) {
        // Não fecha. Fechar numa falha faria o porteiro achar que deu certo, e
        // a encomenda sairia da portaria sem registro nenhum.
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
    if (!houveNotificacao) {
      return "Notificação não enviada: o morador não recebeu código. Siga pela identificação abaixo.";
    }
    if (casada) return `Confere: encomenda de ${casada.nome}`;
    if (codigoNaoBate) return "Este código não é o desta encomenda. Confira se abriu o cadastro certo.";
    if (exigeCodigo) return "Obrigatório: a notificação foi enviada, então o morador tem o código.";
    return "O morador digita aqui. Sem código, siga pela identificação abaixo.";
  };

  return (
    <Modal
      open={aberto}
      onClose={aoFechar}
      title="Entregar encomenda"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button variant="primary" onClick={concluir} disabled={!podeConcluir} loading={salvando}>
            Concluir retirada
          </Button>
        </>
      }
    >
      <Field label="Código de retirada" required={exigeCodigo} help={ajudaDoCodigo()}>
        <Input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          disabled={!houveNotificacao}
          autoCapitalize="characters"
          placeholder={houveNotificacao ? "5 caracteres" : "Sem notificação enviada"}
        />
      </Field>

      <Field label="Nome de quem está retirando" required>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>

      <Field label="CPF de quem está retirando" required help="Só números">
        <Input
          value={cpf}
          onChange={(e) => setCpf(maskCPF(e.target.value))}
          inputMode="numeric"
          placeholder="000.000.000-00"
        />
      </Field>

      <fieldset className="ret-lista">
        <legend>Itens entregues agora</legend>
        {listas.length === 0 || listas.every(({ itens }) => itens.length === 0) ? (
          <p className="ret-lista__vazia">
            Nada pendente neste cadastro. Descreva na observação o que está sendo
            entregue.
          </p>
        ) : (
          listas.map(({ p, itens }) => {
            const jaSaiu = Number(p.volumes_retirados) > 0;

            // Item único e nenhum histórico: uma caixa só, com o nome do
            // cadastro. Abrir um grupo com título e uma linha dentro seria
            // enfeite no caso mais comum.
            if (itens.length === 1 && !jaSaiu) {
              return (
                <Checkbox
                  key={itens[0].chave}
                  label={`${rotuloDaEncomenda(p)} · ${itens[0].rotulo}`}
                  checked={marcadas.includes(itens[0].chave)}
                  onChange={() => alternar(itens[0].chave)}
                />
              );
            }

            return (
              <div className="ret-lista__grupo" key={p.id}>
                <p className="ret-lista__titulo">
                  {rotuloDaEncomenda(p)} · {itens.length} na prateleira
                  {/* Sem isto, o porteiro da noite não tem como saber que parte
                      da encomenda já saiu — nem por que a lista encolheu. */}
                  {jaSaiu && ` · ${p.volumes_retirados} já retirado(s)`}
                </p>
                {itens.map((i) => (
                  <Checkbox
                    key={i.chave}
                    label={i.rotulo}
                    checked={marcadas.includes(i.chave)}
                    onChange={() => alternar(i.chave)}
                  />
                ))}
              </div>
            );
          })
        )}
      </fieldset>

      <Field
        label="Observação"
        required={semEncomenda}
        help={
          faltaItem
            ? "Obrigatória: sobrou item, então o cadastro fica “Parcialmente entregue” e continua na portaria. Diga o que ficou."
            : semEncomenda
              ? "Obrigatória: sem item marcado, é ela que diz o que foi entregue."
              : "Opcional. Use para o que não bate — pacote que não estava na prateleira, por exemplo."
        }
      >
        <Textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
        />
      </Field>

      <Field label="Assinatura de quem está retirando" required>
        <Assinatura aoMudar={setTemAssinatura} />
      </Field>
    </Modal>
  );
}
