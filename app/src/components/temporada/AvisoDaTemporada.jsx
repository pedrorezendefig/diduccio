import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "../../ui";
import { dataBR, nomeProprio } from "../../lib/format";
import { hojeEmBrasilia } from "../../lib/portaria";
import {
  acharPorCpf, acharPorPlaca, descreverCarro, esperadasHoje, pessoasDa, soCpf, soPlaca, veiculosDa,
} from "../../lib/temporada";

const periodo = (t) => `${dataBR(t.entrada)?.slice(0, 5) || "—"} a ${dataBR(t.saida)?.slice(0, 5) || "—"}`;

/**
 * Na chegada do tipo Temporada (só nele): a placa OU o CPF que o porteiro
 * digita procuram nas liberações da administração (0091/0093). O CPF pode ser
 * do responsável ou de um acompanhante. Achou por qualquer um: a mesma caixa
 * "Liberado", e um toque preenche o crachá. Não achou nada: "Sem liberação",
 * e a lista das que chegam hoje para o caso de outro carro ou outro documento.
 *
 * `onUsar(temporada, veiculo, pessoa)`: o veículo que casou com a placa e a
 * pessoa que casou com o CPF, cada um nulo quando não foi por ali.
 */
export default function AvisoDaTemporada({ temporadas, placa, cpf, rotuloUnidade, usada, onUsar }) {
  const hoje = hojeEmBrasilia();
  const digitada = soPlaca(placa);
  const cpfDigitado = soCpf(cpf);

  // Junta o que a placa e o CPF acharam, uma caixa por liberação.
  const porId = new Map();
  acharPorPlaca(temporadas, digitada, hoje).forEach(({ temporada, veiculo }) =>
    porId.set(temporada.id, { temporada, veiculo, pessoa: null }));
  acharPorCpf(temporadas, cpfDigitado, hoje).forEach(({ temporada, pessoa }) => {
    const ja = porId.get(temporada.id);
    porId.set(temporada.id, { temporada, veiculo: ja?.veiculo ?? null, pessoa });
  });
  const achadas = [...porId.values()];

  const procurou = digitada.length >= 7 || cpfDigitado.length === 11;
  const esperadas = esperadasHoje(temporadas, hoje).filter((t) => !porId.has(t.id));
  const oQueProcurou = [digitada.length >= 7 && `a placa ${digitada}`, cpfDigitado.length === 11 && "este CPF"]
    .filter(Boolean).join(" nem com ");

  const escolha = (t) => (
    <li key={t.id} className="tem-escolha">
      <span className="mud-quem">
        <b><span className="conf-dado__mono">{rotuloUnidade(t.id_unidade)}</span> · {nomeProprio(t.hospede)}</b>
        <small>
          {veiculosDa(t).length ? veiculosDa(t).map((v) => `${v.placa} ${descreverCarro(v)}`).join(", ") : "sem carro"} · {periodo(t)}
        </small>
      </span>
      <Button size="sm" variant={usada === t.id ? "primary" : "secondary"} onClick={() => onUsar(t, null, null)}>
        {usada === t.id ? "Em uso" : "É este"}
      </Button>
    </li>
  );

  return (
    <div className="tem-aviso" aria-live="polite">
      {achadas.map(({ temporada: t, veiculo: v, pessoa }) => (
        <div key={t.id} className="tem-aviso__caixa tem-aviso__caixa--ok">
          <p className="tem-aviso__titulo"><CheckCircle2 size={20} aria-hidden="true" /> Liberado para temporada</p>
          <dl className="tem-aviso__dados">
            <div><dt>Unidade</dt><dd className="conf-dado__mono">{rotuloUnidade(t.id_unidade)}</dd></div>
            <div><dt>Período</dt><dd>{periodo(t)}</dd></div>
            <div><dt>Liberado por</dt><dd>{t.proprietario ? nomeProprio(t.proprietario) : "Proprietário não informado"}</dd></div>
            <div>
              <dt>{pessoa && !pessoa.responsavel ? "Acompanhante" : "Hóspede"}</dt>
              <dd>
                {nomeProprio(pessoa?.nome ?? t.hospede)}
                {pessoa && !pessoa.responsavel ? ` · com ${nomeProprio(t.hospede)}` : ` · ${pessoasDa(t)} ${pessoasDa(t) === 1 ? "pessoa" : "pessoas"}`}
              </dd>
            </div>
            <div><dt>{veiculosDa(t).length > 1 && !v ? "Carros" : "Carro"}</dt><dd>{v ? `${v.placa} · ${descreverCarro(v)}`
              : veiculosDa(t).length ? veiculosDa(t).map((x) => `${x.placa} ${descreverCarro(x)}`).join(", ") : "Sem carro"}</dd></div>
          </dl>
          {t.observacao?.trim() && <p className="tem-aviso__obs">{t.observacao}</p>}
          <Button variant="primary" onClick={() => onUsar(t, v, pessoa)} disabled={usada === t.id}>
            {usada === t.id ? "Crachá preenchido com esta liberação" : "Usar e preencher o crachá"}
          </Button>
        </div>
      ))}

      {procurou && achadas.length === 0 && (
        <div className="tem-aviso__caixa tem-aviso__caixa--nao">
          <p className="tem-aviso__titulo">
            <AlertTriangle size={20} aria-hidden="true" />
            {digitada.length >= 7 && cpfDigitado.length !== 11 ? "Sem liberação para esta placa"
              : cpfDigitado.length === 11 && digitada.length < 7 ? "Sem liberação para este CPF"
              : "Sem liberação para esta placa nem este CPF"}
          </p>
          <p className="tem-aviso__texto">
            Nenhuma temporada liberada para hoje com {oQueProcurou}. Confirme com o proprietário antes de abrir.
            Se for o hóspede com outro carro ou outro documento, escolha a liberação abaixo.
          </p>
        </div>
      )}

      {esperadas.length > 0 ? (
        <div className="tem-aviso__lista">
          <p className="app-detalhe__legenda">{procurou ? "Chegam hoje" : "Temporadas que chegam hoje"}</p>
          <ul>{esperadas.map(escolha)}</ul>
        </div>
      ) : achadas.length === 0 && !procurou && (
        <p className="tem-aviso__vazio">Nenhuma temporada liberada para hoje. Digite a placa ou o CPF para conferir.</p>
      )}
    </div>
  );
}
