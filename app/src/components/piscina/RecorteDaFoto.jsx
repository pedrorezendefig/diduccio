import { useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button, Modal } from "../../ui";
import { recortar } from "./imagemDaCarteirinha";

// Recortar a foto da carteirinha: a foto aparece INTEIRA e, por cima dela, um
// círculo que a pessoa arrasta (mover) e aumenta ou diminui (o canto, ou os
// botões − e +). O que fica dentro do círculo é o que vai para a carteirinha.
// Sem isto, a foto era cortada sozinha para caber no círculo (object-fit),
// e um rosto fora do centro saía pela metade.

const MIN_RELATIVO = 0.15; // o menor círculo: 15% do lado menor da foto
const ALTURA_MAX = 420;

const prender = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * O modal do recorte. `src`: a foto em data URL (sem isso o canvas fica
 * "sujo" e não exporta). `onRecorte(dataUrl)` recebe o recorte pronto.
 */
export default function RecorteDaFoto({ src, salvando = false, onRecorte, onCancelar }) {
  return (
    <Modal open={Boolean(src)} onClose={onCancelar} title="Recortar a foto" size="md">
      {src && <Recorte src={src} salvando={salvando} onRecorte={onRecorte} onCancelar={onCancelar} />}
    </Modal>
  );
}

function Recorte({ src, salvando, onRecorte, onCancelar }) {
  const palco = useRef(null);
  const imgRef = useRef(null);
  const arrasto = useRef(null);
  const [tamanho, setTamanho] = useState(null); // { w, h } naturais da foto
  const [largura, setLargura] = useState(480); // px disponíveis na tela
  const [sel, setSel] = useState(null); // { x, y, lado } em px da foto

  useLayoutEffect(() => {
    const el = palco.current;
    if (!el) return;
    const medir = () => { if (el.offsetWidth > 0) setLargura(el.offsetWidth); };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const carregou = (e) => {
    const w = e.currentTarget.naturalWidth || 1;
    const h = e.currentTarget.naturalHeight || 1;
    setTamanho({ w, h });
    // Começa com um círculo grande, centrado na largura e puxado para cima,
    // onde costuma estar o rosto.
    const lado = Math.round(Math.min(w, h) * 0.8);
    setSel({ x: Math.round((w - lado) / 2), y: Math.round(Math.max(0, (h - lado) * 0.25)), lado });
  };

  // Escala da foto na tela: cabe na largura do palco e em ALTURA_MAX.
  const k = tamanho ? Math.min(largura / tamanho.w, ALTURA_MAX / tamanho.h, 1.5) : 1;
  const minLado = tamanho ? Math.min(tamanho.w, tamanho.h) * MIN_RELATIVO : 10;
  const maxLado = tamanho ? Math.min(tamanho.w, tamanho.h) : 10;

  const ajustar = (novo) => {
    if (!tamanho) return;
    const lado = prender(novo.lado, minLado, maxLado);
    setSel({
      lado: Math.round(lado),
      x: Math.round(prender(novo.x, 0, tamanho.w - lado)),
      y: Math.round(prender(novo.y, 0, tamanho.h - lado)),
    });
  };
  /** Muda o tamanho mantendo o centro do círculo no lugar. */
  const redimensionar = (fator) => {
    const lado = prender(sel.lado * fator, minLado, maxLado);
    ajustar({ lado, x: sel.x + (sel.lado - lado) / 2, y: sel.y + (sel.lado - lado) / 2 });
  };

  const comecar = (modo) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    arrasto.current = { modo, px: e.clientX, py: e.clientY, ...sel };
  };
  const mover = (e) => {
    const a = arrasto.current;
    if (!a) return;
    const dx = (e.clientX - a.px) / k;
    const dy = (e.clientY - a.py) / k;
    if (a.modo === "mover") ajustar({ lado: a.lado, x: a.x + dx, y: a.y + dy });
    else ajustar({ lado: a.lado + Math.max(dx, dy), x: a.x, y: a.y });
  };
  const soltar = () => { arrasto.current = null; };
  const teclado = (e) => {
    const passo = (e.shiftKey ? 40 : 10) / k;
    const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    if (d) { e.preventDefault(); ajustar({ ...sel, x: sel.x + d[0], y: sel.y + d[1] }); }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); redimensionar(1.1); }
    if (e.key === "-") { e.preventDefault(); redimensionar(1 / 1.1); }
  };

  const usar = () => {
    if (!sel || !imgRef.current) return;
    onRecorte(recortar(imgRef.current, sel));
  };

  return (
    <div className="rec">
      <p className="rec__dica">
        Arraste o círculo até o rosto e puxe o canto para aumentar ou diminuir. O que ficar dentro do círculo vai para a carteirinha e fica salvo no cadastro.
      </p>
      <div className="rec__palco" ref={palco}>
        <div
          className="rec__foto"
          style={tamanho ? { width: tamanho.w * k, height: tamanho.h * k } : undefined}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
        >
          <img ref={imgRef} src={src} alt="A foto inteira" onLoad={carregou} draggable={false} />
          {sel && (
            <div
              className="rec__circulo"
              role="group"
              aria-label="Área do recorte: arraste, ou use as setas e + e −"
              tabIndex={0}
              onKeyDown={teclado}
              onPointerDown={comecar("mover")}
              style={{ left: sel.x * k, top: sel.y * k, width: sel.lado * k, height: sel.lado * k }}
            >
              <span className="rec__alca" aria-hidden="true" onPointerDown={comecar("tamanho")} />
            </div>
          )}
        </div>
      </div>

      <div className="rec__controles">
        <Button variant="secondary" size="sm" aria-label="Diminuir o círculo" disabled={!sel || sel.lado <= minLado + 1}
          onClick={() => redimensionar(1 / 1.1)}><Minus size={16} /></Button>
        <span className="rec__rotulo">Tamanho do recorte</span>
        <Button variant="secondary" size="sm" aria-label="Aumentar o círculo" disabled={!sel || sel.lado >= maxLado - 1}
          onClick={() => redimensionar(1.1)}><Plus size={16} /></Button>
      </div>

      <div className="app-modal__acoes rec__acoes">
        <Button variant="ghost" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
        <Button variant="primary" onClick={usar} disabled={!sel} loading={salvando}>Salvar recorte</Button>
      </div>
    </div>
  );
}
