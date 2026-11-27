import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import QRCode from "qrcode";
import { DriveImage } from "../DriveImage";
import { dataBR } from "../../lib/format";
import { CORES_DO_FUNDO, CORES_DO_QR, nomeDaCarteirinha, textoDoQr } from "../../lib/carteirinha";
import { ALTURA, LARGURA } from "./imagemDaCarteirinha";

// A carteirinha da piscina, modelo "Clássico renovado" (escolhido em
// 05/11/2026). É desenhada sempre em 1011×639, o tamanho da arte, e encolhe
// por `transform` para caber na tela: assim o texto encolhe junto e a imagem
// baixada sai igual em qualquer aparelho. As cores são de papel, fixas, em
// carteirinha.css: nunca seguem o tema (no escuro, o arquivo sairia escuro).


/** O desenho do fundo: manchas verdes nos cantos, como na arte original. */
function Fundo() {
  return (
    <svg className="cart__fundo" aria-hidden="true" width={LARGURA} height={ALTURA} viewBox={`0 0 ${LARGURA} ${ALTURA}`}>
      <path fill={CORES_DO_FUNDO.claro} d="M600 0 C700 30 860 10 930 120 C980 200 930 280 1011 330 L1011 0 Z" />
      <path fill={CORES_DO_FUNDO.escuro} d="M690 0 C780 20 900 0 960 100 C1000 170 980 230 1011 260 L1011 0 Z" />
      <path fill={CORES_DO_FUNDO.escuro} d="M670 70 C740 40 840 70 870 180 C820 180 720 150 670 70 Z" />
      <path fill={CORES_DO_FUNDO.claro} d="M0 350 C80 380 120 480 200 560 C240 600 300 620 330 639 L0 639 Z" />
      <path fill={CORES_DO_FUNDO.escuro} d="M0 440 C60 470 100 540 160 600 C180 620 200 630 220 639 L0 639 Z" />
    </svg>
  );
}

/**
 * `cadastro`: { id, nome, url_foto, nascimento, validade }. `unidade`: "B5-206".
 * `fotoRecortada` (data URL), quando há, entra no lugar da foto do cadastro.
 * O ref aponta para o cartão em tamanho real (é ele que vira imagem).
 */
const Carteirinha = forwardRef(function Carteirinha({ cadastro, unidade, fotoRecortada }, ref) {
  const moldura = useRef(null);
  const [escala, setEscala] = useState(0.5);
  // O QR guarda de qual cadastro ele é: trocando de cadastro, o antigo some
  // na hora em vez de aparecer no cartão de outra pessoa até o novo ficar pronto.
  const [qrGerado, setQrGerado] = useState({ id: null, url: "" });
  const qr = cadastro?.id != null && qrGerado.id === cadastro.id ? qrGerado.url : "";

  useLayoutEffect(() => {
    const el = moldura.current;
    if (!el) return;
    const medir = () => { if (el.offsetWidth > 0) setEscala(el.offsetWidth / LARGURA); };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const id = cadastro?.id;
    if (id == null) return;
    let vivo = true;
    QRCode.toDataURL(textoDoQr(id), { margin: 1, width: 240, color: CORES_DO_QR })
      .then((url) => { if (vivo) setQrGerado({ id, url }); })
      .catch(() => { if (vivo) setQrGerado({ id, url: "" }); });
    return () => { vivo = false; };
  }, [cadastro?.id]);

  return (
    <div className="cart-moldura" ref={moldura}>
      <div id="carteirinha-piscina" className="cart" ref={ref} style={{ transform: `scale(${escala})` }}>
        <Fundo />
        <img className="cart__logo" src="/logo.png" alt="Diduccio" />
        <div className="cart__titulo">CARTEIRINHA PISCINA</div>

        <div className="cart__foto">
          <div className="cart__foto-dentro">
            {fotoRecortada || cadastro?.url_foto
              ? <DriveImage localSrc={fotoRecortada} source={cadastro?.url_foto} alt={`Foto de ${cadastro?.nome || "quem tem a carteirinha"}`} />
              : <User className="cart__foto-vazia" size={150} strokeWidth={1.5} aria-hidden="true" />}
          </div>
        </div>

        <div className="cart__dados">
          <div>
            <div className="cart__rotulo">NOME</div>
            <div className="cart__nome">{nomeDaCarteirinha(cadastro?.nome)}</div>
          </div>
          <div className="cart__grade">
            <div>
              <div className="cart__rotulo">UNIDADE</div>
              <div className="cart__valor">{unidade || "—"}</div>
            </div>
            <div>
              <div className="cart__rotulo">NASCIMENTO</div>
              <div className="cart__valor">{dataBR(cadastro?.nascimento) || "—"}</div>
            </div>
            <div>
              <div className="cart__rotulo">VALIDADE</div>
              <div className="cart__valor cart__valor--verde">{dataBR(cadastro?.validade) || "—"}</div>
            </div>
            {qr && <img className="cart__qr" src={qr} alt="QR code da carteirinha" />}
          </div>
        </div>

        <div className="cart__rodape">CARTEIRINHA PESSOAL E INTRANSFERÍVEL</div>
      </div>
    </div>
  );
});

export default Carteirinha;
