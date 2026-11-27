import React, { useState } from "react";
import { Wand2 } from "lucide-react";
import { Button, Checkbox, Field, Textarea, useToast } from "../ui";
import { MODO_DEMO } from "../api/config";
import { chamarEdgeFunction, mensagemDaEdgeFunction } from "../api/edge";
import { buscarPorPalavras } from "../lib/convencao/convencao.ts";

/**
 * "Pedir para a IA montar a notificação": quem cadastra conta o caso do jeito
 * dela ("parou mais de um carro dentro do condomínio") e a IA devolve o
 * parágrafo formal da carta, que cai na Descrição da infração e continua
 * editável, junto com as sugestões da Convenção e das atas (uma chamada só,
 * ação redigir-notificacao da função `ia`).
 *
 * A IA não inventa fato: o que não estiver no relato (data, placa, nome) fica
 * de fora do texto, e quem cadastra completa.
 */
export default function RedacaoComIA({ tipo, onRedigido }) {
  const toast = useToast();
  const [ligado, setLigado] = useState(false);
  const [pedido, setPedido] = useState("");
  const [montando, setMontando] = useState(false);

  const curto = pedido.trim().length < 10;

  const montar = async () => {
    if (curto || montando) return;
    setMontando(true);
    try {
      // Na demonstração nada sai da máquina: sem IA, o relato vai como está
      // para a descrição, e as sugestões vêm da busca local.
      if (MODO_DEMO) {
        onRedigido({ descricao: pedido.trim(), itens: buscarPorPalavras(pedido), origem: "palavras" });
        toast.info("Modo demonstração: a IA não roda aqui. O relato foi copiado para a descrição.");
        return;
      }
      const r = await chamarEdgeFunction("ia", { acao: "redigir-notificacao", pedido, tipo }, { limiteMs: 30000 });
      if (r.ok && r.corpo?.descricao) {
        onRedigido({ descricao: r.corpo.descricao, itens: r.corpo.itens ?? [], origem: "ia" });
        toast.success("Texto montado. Confira e ajuste antes de registrar.");
        return;
      }
      // Sem redação, as sugestões que vierem (ou as da busca local) ainda
      // ajudam; a descrição fica para quem cadastra.
      const itens = Array.isArray(r.corpo?.itens) ? r.corpo.itens : buscarPorPalavras(pedido);
      onRedigido({ descricao: null, itens, origem: "palavras" });
      toast.error(r.falhaConexao
        ? "A IA demorou demais para responder. Tente de novo ou escreva a descrição à mão."
        : mensagemDaEdgeFunction(r, "A IA não conseguiu montar o texto agora. Escreva a descrição à mão."));
    } finally {
      setMontando(false);
    }
  };

  return (
    <div className="redacao">
      <Checkbox
        checked={ligado}
        onChange={(e) => setLigado(e.target.checked)}
        label="Pedir para a IA montar a notificação"
      />
      {ligado && (
        <>
          <Field
            label="Conte o que aconteceu, do seu jeito"
            help="A IA escreve o texto formal na Descrição da infração. Você revisa e edita antes de registrar."
          >
            <Textarea
              rows={3}
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="Ex.: morador parou mais de um carro dentro do condomínio, ocupando duas vagas."
            />
          </Field>
          <Button variant="secondary" iconLeft={<Wand2 size={16} />} loading={montando} disabled={curto} onClick={montar}>
            Montar com a IA
          </Button>
        </>
      )}
    </div>
  );
}
