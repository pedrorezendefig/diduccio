// Retirada de encomenda com assinatura: a camada entre o campo de assinatura
// (src/components/Assinatura.jsx) e a função `registrar_retirada` do banco
// (migração 0027), que grava a linha e dá baixa nas encomendas numa transação
// única.
//
// ===========================================================================
// A ORDEM É A DECISÃO CENTRAL DESTE ARQUIVO: sobe a assinatura, DEPOIS grava.
// ===========================================================================
// Não são duas operações numa transação — o bucket e a tabela são sistemas
// diferentes, e uma delas vai falhar sozinha algum dia. A pergunta é qual
// sobra pela metade.
//
// Nesta ordem, uma falha na gravação deixa um PNG órfão no bucket: um arquivo
// que ninguém referencia, invisível, inofensivo.
//
// Na ordem inversa, uma falha no upload deixaria uma retirada gravada com
// `assinatura_caminho` apontando para arquivo nenhum — o comprovante que
// aparece completo na tela do síndico e não prova coisa alguma. Esta
// funcionalidade existe para substituir o livro de papel da portaria; um
// registro que mente é pior que registro nenhum, porque encerra a discussão.
//
// Consequência direta da ordem: o caminho NÃO pode usar o id da retirada, que
// só existe depois do insert. Por isso `crypto.randomUUID()`.
import { supabase } from "./supabase";

const BUCKET = "anexos";

/**
 * Menor tamanho, em bytes, que um PNG assinado de verdade tem.
 *
 * O campo de assinatura marca "assinado" mesmo quando o navegador nega o
 * contexto 2D (memória, canvas bloqueado por privacidade) — decisão
 * deliberada dele, para não barrar a retirada sem explicação. O preço é que o
 * canvas pode devolver um PNG em BRANCO, e é aqui que ele tem de morrer.
 *
 * O tamanho separa os dois casos com folga: a área de assinatura tem 180px de
 * altura, e vazia comprime para poucas centenas de bytes; qualquer traço passa
 * de mil. O corte fica no meio dessa distância — não é limite de qualidade, é
 * a diferença entre "tem tinta" e "não tem".
 */
const MINIMO_COM_TRACO = 1000;

/**
 * Registra a retirada. Devolve `{ success: true, id }` ou
 * `{ success: false, message }`.
 *
 * Não lança: as telas do ViT já tratam `{ success: false }` em toda gravação,
 * e um caminho diferente só criaria mais um jeito de errar.
 */
export async function registrarRetirada({
  idUnidade,
  nome,
  cpf,
  idMorador,
  via,
  observacao,
  entregas,
  itens,
  entreguePor,
  assinatura,
}) {
  // 1. Recusa ANTES de qualquer rede. Barrar depois do upload já teria deixado
  //    o arquivo inútil no bucket, e barrar depois da rpc é tarde demais.
  if (!assinatura) {
    return { success: false, message: "A retirada exige assinatura." };
  }
  if (assinatura.size < MINIMO_COM_TRACO) {
    return {
      success: false,
      message:
        "A assinatura não foi capturada. Peça para assinar de novo — se persistir, o aparelho não está exportando o desenho.",
    };
  }

  // 2. Caminho sorteado. A primeira pasta NÃO é organização: é o que as
  //    políticas do 0027 leem para decidir quem escreve e quem apaga
  //    (`retiradas` só o síndico apaga). Mudar o formato aqui sem mexer lá
  //    abre ou fecha acesso sem querer.
  const caminho = `retiradas/${crypto.randomUUID()}/assinatura.png`;

  // 3. Assinatura primeiro. `upsert: false` porque um uuid nunca colide de
  //    verdade: se colidiu, algo está errado e sobrescrever apagaria a
  //    assinatura de OUTRA retirada já gravada.
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, assinatura, { contentType: "image/png", upsert: false });

  if (erroUpload) {
    // Sem assinatura no bucket não se grava linha nenhuma. É a metade
    // aceitável de falhar: o porteiro tenta de novo e nada ficou registrado.
    return { success: false, message: erroUpload.message };
  }

  // 4. Só agora a linha. A função do banco valida o resto (observação
  //    obrigatória quando não há encomenda marcada, encomenda já retirada) e
  //    faz insert + baixa na mesma transação.
  const { data, error } = await supabase.rpc("registrar_retirada", {
    p_id_unidade: idUnidade,
    p_retirado_por_nome: nome,
    p_retirado_por_cpf: cpf,
    p_id_morador: idMorador ?? null,
    p_via: via,
    p_assinatura_caminho: caminho,
    // null e não string vazia: a função distingue "sem observação" de
    // observação em branco para exigir uma quando não há encomenda marcada.
    p_observacao: observacao?.trim() ? observacao.trim() : null,
    // Array sempre, nunca null: `array_length(null, 1)` é null e a contagem de
    // baixas do lado do banco deixaria de bater consigo mesma.
    p_entregas: entregas ?? [],
    // Todo item que saiu, com a nota fiscal dele: [{id_entrega, id_nota}].
    // Quem não estiver em `p_entregas` fica 'Parcialmente entregue' e continua
    // na portaria — o que sobrou sai numa segunda retirada, com assinatura
    // própria. Quais ficam parciais o banco deduz daqui (0029): mandar a lista
    // pronta seria um segundo lugar para a mesma verdade errar.
    p_itens: itens ?? [],
    p_entregue_por: entreguePor,
  });

  // 5. Erro da função vira mensagem. As exceções dela são texto escrito para o
  //    porteiro ler ("Sem encomenda marcada, a observação é obrigatória."),
  //    não código — repassar é o certo.
  if (error) return { success: false, message: error.message };

  return { success: true, id: data };
}
