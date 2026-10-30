import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "../ui";
import { buscarUnidades, rotuloCurtoDaUnidade } from "../lib/unidades";

/**
 * Achar a unidade digitando, em vez de rolar 128 opções num `<select>`.
 *
 * O padrão nasceu na portaria e está copiado à mão em oito telas. Aqui ele
 * virou componente — não para arrumar as oito de uma vez, que é outro
 * trabalho, mas para a nona não ser mais uma cópia.
 *
 * `valor` é a unidade escolhida (o objeto inteiro, não o id) ou `null`, e
 * `onEscolher` recebe a mesma coisa. Guardar o objeto poupa quem usa de ficar
 * procurando o bloco pelo id para escrever "B5-206" na tela.
 */
export default function BuscaUnidade({
  unidades = [],
  valor,
  onEscolher,
  placeholder = "Digite 5206 ou bloco 5 apto 206",
  disabled = false,
  id,
  "aria-describedby": descritoPor,
  "aria-invalid": invalido,
  required,
}) {
  const [busca, setBusca] = useState("");

  // O que aparece no campo é DERIVADO, não copiado: com unidade escolhida, o
  // rótulo dela; sem, o que a pessoa digitou. A primeira versão guardava o
  // rótulo dentro de `busca` num efeito, e aí eram duas fontes para o mesmo
  // texto — o tipo de coisa que sai do lugar quando o valor muda de fora.
  const [aberto, setAberto] = useState(false);
  const campo = useRef(null);

  // Fecha a lista ao clicar fora. Sem isto ela fica aberta por cima do resto do
  // formulário, e some só quando alguém escolhe alguma coisa.
  useEffect(() => {
    const fora = (e) => {
      if (campo.current && !campo.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  // Com a unidade já escolhida, a lista some: o que está no campo é o rótulo
  // dela, e sugerir a partir dele devolveria ela mesma.
  const sugestoes = useMemo(
    () => (valor ? [] : buscarUnidades(unidades, busca)),
    [unidades, busca, valor]
  );

  const limpar = () => {
    setBusca("");
    setAberto(false);
    onEscolher?.(null);
  };

  const escolher = (u) => {
    setBusca(rotuloCurtoDaUnidade(u));
    setAberto(false);
    onEscolher?.(u);
  };

  return (
    <span className="ent-combo" ref={campo}>
      <Input
        id={id}
        aria-describedby={descritoPor}
        aria-invalid={invalido}
        required={required}
        value={valor ? rotuloCurtoDaUnidade(valor) : busca}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
          // Digitar depois de ter escolhido desfaz a escolha: senão o campo
          // mostraria um texto e o formulário guardaria outra unidade.
          if (valor) onEscolher?.(null);
        }}
      />

      {valor && !disabled && (
        <button
          type="button"
          className="ent-combo__limpar"
          aria-label="Limpar unidade"
          onClick={limpar}
        >
          <X size={15} />
        </button>
      )}

      {aberto && sugestoes.length > 0 && (
        <ul className="ent-combo__lista" role="listbox">
          {sugestoes.map((u) => (
            <li key={u.id}>
              <button type="button" className="ent-combo__item" onClick={() => escolher(u)}>
                <span className="ent-combo__unidade">{rotuloCurtoDaUnidade(u)}</span>
                <span className="ent-combo__desc">Bloco {u.bloco} · Apto {u.unidade}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
