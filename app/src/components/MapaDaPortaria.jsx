import React from "react";
import {
  ESTOURADO, NO_PRAZO, SEM_PRAZO,
  contarPorEstado, distribuirNoMapa, iniciais, pinosDaZona,
} from "../lib/mapa-portaria";
import { formatarDuracao, rotuloDoTipo } from "../lib/portaria";

/**
 * Quem está dentro, na planta do condomínio.
 *
 * O porteiro sabe ler a planta do próprio prédio muito mais rápido do que uma
 * lista: "tem gente no 5" é uma olhada, e "BLOCO 5 - UNIDADE 206" é uma leitura.
 * O que a lista faz melhor é o detalhe — por isso ela continua logo abaixo, e o
 * mapa não tenta ser ela.
 *
 * Implantação de miolo aberto: os blocos em volta na ordem em que se fala
 * deles — 1, 2, 3 e 4 na fileira de cima, 5 e 8 nas laterais —, o pátio no meio
 * com o nome do condomínio, e o salão fechando embaixo.
 *
 * Amarelo piscando é quem tem prazo correndo; vermelho piscando, quem já passou
 * do combinado. Quem não tem prazo fica quieto: piscar tudo é o mesmo que não
 * piscar nada.
 */

const LEGENDA = [
  { estado: ESTOURADO, rotulo: "Tempo esgotado" },
  { estado: NO_PRAZO,  rotulo: "Com tempo correndo" },
  { estado: SEM_PRAZO, rotulo: "Sem Limite" },
];

/** A frase inteira do pino: é o que o leitor de tela lê e o que o hover mostra. */
function descrever({ chegada, estado, restam }) {
  const partes = [chegada.nome, rotuloDoTipo(chegada.tipo || "ENTREGADOR")];
  if (chegada.bloco) partes.push(`bloco ${chegada.bloco}, apto ${chegada.apartamento}`);
  else partes.push("serviço do condomínio");
  if (estado === ESTOURADO) partes.push(`${formatarDuracao(-restam)} além do combinado`);
  else if (estado === NO_PRAZO) partes.push(`restam ${formatarDuracao(restam)}`);
  else partes.push("sem limite de tempo");
  return partes.join(" · ");
}

// `agora` vem de fora, do relógio da tela de Entregas, e não tem valor padrão
// aqui: um `Date.now()` na assinatura seria lido a cada render, o que é impuro
// e faz o React reclamar com razão — dois renders seguidos dariam dois "agora"
// diferentes. Sem o argumento, quem decide é a própria lib.
//
// `onEscolher` recebe a chegada do pino clicado, e `destacada` é o id de quem
// está marcado na lista. Os dois juntos fecham o caminho: o mapa responde
// "tem alguém no bloco 3", e o clique responde "é a Ana, e o tempo dela
// estourou há oito minutos" — que é a pergunta seguinte, sempre.
export default function MapaDaPortaria({ chegadas = [], agora, onEscolher, destacada }) {
  const zonas = distribuirNoMapa(chegadas, agora);
  const conta = contarPorEstado(chegadas, agora);

  return (
    <div className="mapa">
      <div className="mapa__legenda">
        {LEGENDA.map(({ estado, rotulo }) => (
          <span key={estado} className="mapa__chave">
            <i className="mapa__ponto" data-estado={estado} aria-hidden="true" />
            {rotulo}
            <b>{conta[estado]}</b>
          </span>
        ))}
      </div>

      {/* `group` e não `img`: as pessoas dentro da planta continuam sendo lidas
          uma a uma. O mapa é atalho visual, não substituto da lista. */}
      <div className="mapa__planta" role="group" aria-label="Planta do condomínio com quem está dentro">
        {zonas.map((z) => (
          <div
            key={z.id}
            className="mapa__zona"
            data-tipo={z.tipo}
            data-cheia={z.pessoas.length > 0 ? "sim" : undefined}
            style={{
              left: `${z.x}%`, top: `${z.y}%`,
              width: `${z.w}%`, height: `${z.h}%`,
            }}
          >
            {/* O corpo do prédio: fundo, contorno e as lajes horizontais. Fica
                num elemento próprio para o rótulo e os pinos ficarem por cima
                da textura, e não misturados a ela. */}
            <span className="mapa__predio" aria-hidden="true" />

            <div className="mapa__conteudo">
              <span className="mapa__rotulo">
                {z.rotulo}
                {z.pessoas.length > 0 && <b className="mapa__conta">{z.pessoas.length}</b>}
                {z.nota && <small>{z.nota}</small>}
              </span>

              {z.assinatura && <em className="mapa__assinatura">{z.assinatura}</em>}

              {z.pessoas.length > 0 && (
                <ul className="mapa__pinos">
                  {pinosDaZona(z.pessoas).mostrar.map((p) => (
                    <li key={p.chegada.id}>
                      {/* Botão, e não span: ele leva a pessoa até a linha dela
                          na lista. O que é clicável precisa parecer e se
                          comportar como clicável, inclusive pelo teclado. */}
                      <button
                        type="button"
                        className="mapa__pino"
                        data-estado={p.estado}
                        data-marcado={
                          destacada !== undefined && destacada !== null &&
                          String(destacada) === String(p.chegada.id) ? "sim" : undefined
                        }
                        title={descrever(p)}
                        aria-label={`${descrever(p)} · ver na lista`}
                        onClick={() => onEscolher?.(p.chegada)}
                      >
                        {iniciais(p.chegada.nome)}
                      </button>
                    </li>
                  ))}
                  {pinosDaZona(z.pessoas).sobra > 0 && (
                    <li>
                      <span
                        className="mapa__sobra"
                        title={`mais ${pinosDaZona(z.pessoas).sobra} na lista abaixo`}
                      >
                        +{pinosDaZona(z.pessoas).sobra}
                      </span>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {chegadas.length === 0 && (
        <p className="mapa__vazio">Ninguém dentro do condomínio agora.</p>
      )}
    </div>
  );
}
