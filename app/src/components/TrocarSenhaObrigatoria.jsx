import React, { useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "../api/supabase";
import { Button, CampoSenha, Field, Modal, useToast } from "../ui";
import { MINIMO, problemaDaSenha, regrasDaSenha, senhaValida, traduzirErroDeSenha } from "../lib/senha";

/**
 * Troca de senha obrigatória, sobre o sistema.
 *
 * Aparece quando `usuarios.senha_trocada` é falso — quer dizer, quando a senha
 * em uso foi definida por outra pessoa (cadastro ou reset) e passou por um
 * canal que não é segredo: um arquivo no disco, uma mensagem, uma conversa.
 *
 * NÃO tem botão de fechar, nem fecha no Esc ou clicando fora. Por isso o
 * `title` do Modal não é usado: ele renderiza um X junto, e um X que não fecha
 * nada é pior que nenhum. O cabeçalho vem no corpo.
 *
 * Pede a senha atual mesmo já havendo sessão. O Supabase não exigiria — a
 * sessão bastaria para `updateUser` — mas quem senta numa máquina destravada
 * trocaria a senha de outra pessoa sem nunca ter sabido a dela.
 */

/**
 * @param email     de quem está logado; usado para conferir a senha atual.
 * @param onTrocada avisa o App que a exigência foi cumprida.
 */
export default function TrocarSenhaObrigatoria({ email, onTrocada }) {
  const toast = useToast();

  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const regras = regrasDaSenha(nova);
  const senhasBatem = confirmacao.length > 0 && nova === confirmacao;
  const diferenteDaAtual = nova.length > 0 && nova !== atual;
  const podeSalvar =
    atual.length > 0 && senhaValida(nova) && senhasBatem && diferenteDaAtual && !salvando;

  // As ajudas ficam quietas até haver o que julgar: "não coincidem" com o
  // segundo campo ainda vazio é ruído, não ajuda.
  const erroRegra = problemaDaSenha(nova);
  const erroIgual = nova.length > 0 && !diferenteDaAtual ? "A nova senha precisa ser diferente da atual." : "";
  const erroConfirmacao = confirmacao.length > 0 && !senhasBatem ? "As senhas não coincidem." : "";

  const submeter = async (e) => {
    e.preventDefault();
    if (!podeSalvar) return;

    setSalvando(true);
    setErro("");

    // 1. Confere a senha atual. O Supabase não tem "verificar senha", então
    //    reautenticamos: se entrar, era ela mesma. A sessão que volta é da
    //    mesma pessoa, então nada se perde.
    const { error: erroAtual } = await supabase.auth.signInWithPassword({
      email, password: atual,
    });
    if (erroAtual) {
      setErro("A senha atual está incorreta.");
      setSalvando(false);
      return;
    }

    // 2. Troca de verdade. Falhando aqui, nada mudou e o modal continua aberto.
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) {
      setErro(traduzirErroDeSenha(error.message));
      setSalvando(false);
      return;
    }

    // 3. Só DEPOIS marca como trocada. Marcar antes e falhar o passo 2 deixaria
    //    o registro dizendo "trocou" com a provisória ainda valendo — o oposto
    //    do que a marca deveria garantir.
    const { error: erroMarca } = await supabase.rpc("marcar_senha_trocada");
    if (erroMarca) {
      // A senha JÁ mudou: prender a pessoa aqui por causa de um erro de
      // registro seria pior do que deixá-la seguir. Ela pode ser solicitada
      // de novo no próximo carregamento, e agora sabe a senha.
      toast.error(
        "Sua senha foi alterada, mas não conseguimos registrar a confirmação. Você pode ser solicitado a trocá-la de novo."
      );
    } else {
      toast.success("Senha alterada.");
    }

    onTrocada?.();
  };

  return (
    <Modal open size="sm" aria-label="Trocar senha" onClose={undefined}>
      <form onSubmit={submeter} className="vit-form">
        <div className="vit-modal__cabecalho-proprio">
          <KeyRound size={20} aria-hidden="true" />
          <h2 className="vit-modal__title">Troque sua senha</h2>
        </div>

        <p className="vit-texto-apoio">
          Sua senha atual foi definida por outra pessoa e chegou até você por um
          canal que não é secreto. Escolha uma que só você conheça para continuar.
        </p>

        <Field label="Senha atual" error={erro && !nova ? erro : ""}>
          <CampoSenha
            value={atual}
            autoFocus
            autoComplete="current-password"
            onChange={(e) => { setAtual(e.target.value); setErro(""); }}
          />
        </Field>

        <Field
          label="Nova senha"
          error={erroRegra || erroIgual}
          help={`Pelo menos ${MINIMO} caracteres, com maiúscula, minúscula e número.`}
        >
          <CampoSenha
            value={nova}
            autoComplete="new-password"
            onChange={(e) => { setNova(e.target.value); setErro(""); }}
          />
        </Field>

        {/* A lista de regras aparece só enquanto se digita, e mostra qual JÁ
            está cumprida. A tela antiga dizia uma frase só, e quando ela mentia
            — dizendo "tamanho" quando faltava maiúscula — não havia como a
            pessoa descobrir sozinha o que fazer. */}
        {nova.length > 0 && (
          <ul className="vit-senha-regras">
            {[
              [regras.tamanho, `${MINIMO} caracteres ou mais`],
              [regras.maiuscula, "uma letra maiúscula"],
              [regras.minuscula, "uma letra minúscula"],
              [regras.digito, "um número"],
            ].map(([ok, texto]) => (
              <li key={texto} className={ok ? "cumprida" : ""}>
                <span aria-hidden="true">{ok ? "✓" : "○"}</span> {texto}
              </li>
            ))}
          </ul>
        )}

        <Field label="Repita a nova senha" error={erroConfirmacao}>
          <CampoSenha
            value={confirmacao}
            autoComplete="new-password"
            onChange={(e) => setConfirmacao(e.target.value)}
          />
        </Field>

        {erro && nova ? <p className="vit-form__erro" role="alert">{erro}</p> : null}

        <Button type="submit" disabled={!podeSalvar}>
          {salvando ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    </Modal>
  );
}
