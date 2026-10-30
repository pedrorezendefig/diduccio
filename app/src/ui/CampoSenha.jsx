import React, { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Input from "./Input";

/**
 * Campo de senha com o olho de mostrar.
 *
 * Digitar senha às escuras num celular, de pé na portaria, erra muito — e o
 * erro é invisível: a tela diz "usuário ou senha incorretos" sem distinguir a
 * senha errada da senha certa digitada torto.
 *
 * O botão fica DENTRO do campo, e o texto ganha recuo à direita do tamanho
 * dele: por fora, ele viraria mais uma linha no formulário e empurraria o botão
 * de entrar para fora da dobra no celular.
 *
 * `type="button"` explícito. Dentro de um <form>, um <button> sem type é
 * submit: clicar no olho tentaria entrar com a senha pela metade.
 */
const CampoSenha = React.forwardRef(function CampoSenha(
  { className = "", ...props },
  ref
) {
  const [visivel, setVisivel] = useState(false);
  const id = useId();

  return (
    <div className="vit-senha">
      <Input
        ref={ref}
        id={props.id ?? id}
        type={visivel ? "text" : "password"}
        className={`vit-senha__campo ${className}`.trim()}
        {...props}
      />
      <button
        type="button"
        className="vit-senha__olho"
        onClick={() => setVisivel((v) => !v)}
        aria-pressed={visivel}
        aria-label={visivel ? "Ocultar a senha" : "Mostrar a senha"}
        // Fora da ordem de tabulação: quem navega por teclado está vendo o que
        // digita de qualquer jeito, e o olho entre o campo e o botão de entrar
        // só atrasaria. O leitor de tela continua alcançando pelos comandos de
        // navegação por botões.
        tabIndex={-1}
      >
        {visivel ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
});

export default CampoSenha;
