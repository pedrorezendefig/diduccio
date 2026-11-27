import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Field, Input } from "../ui";
import { codigoDeRetirada, lerQRDeRetirada } from "../lib/codigoDeRetirada";

/**
 * O leitor do QR que o morador mostra no app (o QR leva o código de retirada
 * daquela encomenda). Abre a câmera traseira do aparelho da portaria e devolve
 * o código assim que reconhece um.
 *
 * Quem lê: o `BarcodeDetector` do próprio navegador, quando existe (Chrome do
 * Android); senão, a biblioteca `jsqr`, carregada só quando o leitor abre.
 * Só aceita o formato do código de retirada: QR de outra coisa é ignorado.
 * O QR do app diz também quem o mostra (titular ou dependente): `aoLer`
 * recebe (código, idApp); digitado, só o código.
 *
 * Sem câmera (permissão negada, computador sem webcam), o porteiro digita.
 */
export default function LeitorQR({ aberto, aoFechar, aoLer }) {
  const video = useRef(null);
  const [erro, setErro] = useState("");
  const [outro, setOutro] = useState(false);
  const [digitado, setDigitado] = useState("");
  // A função de quem abriu pode mudar a cada desenho da tela; a câmera não
  // pode reabrir por causa disso.
  const aoLerRef = useRef(aoLer);
  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);

  useEffect(() => {
    if (!aberto) return undefined;
    let fluxo = null;
    let quadro = 0;
    let vivo = true;
    const tela = document.createElement("canvas");
    const ctx = tela.getContext("2d", { willReadFrequently: true });

    async function comecar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro("Este aparelho não abre a câmera por aqui. Digite o código abaixo.");
        return;
      }
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setErro("Não deu para abrir a câmera. Libere a câmera para este site ou digite o código abaixo.");
        return;
      }
      if (!vivo) return fluxo.getTracks().forEach((t) => t.stop());
      video.current.srcObject = fluxo;
      await video.current.play().catch(() => {});

      let detector = null;
      if ("BarcodeDetector" in window) {
        try {
          const formatos = await window.BarcodeDetector.getSupportedFormats();
          if (formatos.includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;

      const ler = async () => {
        if (!vivo) return;
        const v = video.current;
        if (v && v.readyState >= 2) {
          let texto = null;
          try {
            if (detector) {
              const achados = await detector.detect(v);
              texto = achados[0]?.rawValue ?? null;
            } else if (ctx) {
              tela.width = v.videoWidth;
              tela.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              texto = jsQR(ctx.getImageData(0, 0, tela.width, tela.height).data, tela.width, tela.height)?.data ?? null;
            }
          } catch {
            texto = null;
          }
          if (texto) {
            const lido = lerQRDeRetirada(texto);
            if (lido) {
              vivo = false;
              aoLerRef.current(lido.codigo, lido.idApp);
              return;
            }
            setOutro(true);
          }
        }
        quadro = requestAnimationFrame(ler);
      };
      quadro = requestAnimationFrame(ler);
    }

    comecar();
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, [aberto]);

  const codigoDigitado = codigoDeRetirada(digitado);

  return (
    <Modal open={aberto} onClose={aoFechar} title="Ler QR do morador" size="sm"
      footer={<Button variant="ghost" onClick={aoFechar}>Fechar</Button>}>
      {!erro && (
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#101010", aspectRatio: "1 / 1" }}>
          <video ref={video} muted playsInline aria-label="Câmera do leitor de QR" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div aria-hidden="true" style={{ position: "absolute", inset: "18%", border: "3px solid rgba(255,255,255,.8)", borderRadius: 18 }} />
        </div>
      )}
      <p role="status" style={{ fontSize: 14, margin: "10px 0" }}>
        {erro || (outro ? "Este QR não é de encomenda. Peça para o morador abrir a encomenda no app e tocar em Mostrar QR." : "Aponte para o QR no celular do morador.")}
      </p>
      <Field label="Ou digite o código" help="Os 5 caracteres que o morador diz ou mostra no app.">
        <Input value={digitado} onChange={(e) => setDigitado(e.target.value)} autoCapitalize="characters" placeholder="Ex.: 7KQ3M" />
      </Field>
      <Button variant="primary" disabled={!codigoDigitado} onClick={() => aoLer(codigoDigitado)}>Usar este código</Button>
    </Modal>
  );
}
