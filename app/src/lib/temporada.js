/**
 * Temporada na portaria (0091): a liberação prévia do hóspede.
 *
 * A administração registra antes — unidade, período, hóspede, veículos — e a
 * portaria confere pela placa na chegada. Tudo aqui é regra pura, sem tela:
 * as datas chegam em "AAAA-MM-DD" (a coluna `date`) e "hoje" é o dia de
 * Brasília (`hojeEmBrasilia`), comparados como texto, que é a mesma ordem.
 */

/** "abc-1d23" -> "ABC1D23": a placa sem traço nem espaço, para comparar. */
export const soPlaca = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

/** Os veículos da liberação, sempre lista (a coluna é jsonb). */
export const veiculosDa = (t) => (Array.isArray(t?.veiculos) ? t.veiculos.filter((v) => v && soPlaca(v.placa)) : []);

/**
 * Como a liberação aparece hoje.
 *
 * `situacao` é o que está gravado; a tela precisa de mais: a agendada que
 * chega hoje, a hospedada que sai hoje, a que já passou da saída sem ninguém
 * encerrar.
 */
export function situacaoNaTela(t, hoje) {
  if (!t) return "encerrada";
  if (t.situacao === "cancelada") return "cancelada";
  if (t.situacao === "encerrada" || String(t.saida) < hoje) return "encerrada";
  if (t.situacao === "hospedado") return String(t.saida) === hoje ? "sai_hoje" : "hospedado";
  if (String(t.entrada) > hoje) return "proxima";
  // Agendada e dentro do período: chega hoje, ou já devia ter chegado.
  return String(t.entrada) === hoje ? "chega_hoje" : "liberada";
}

export const ROTULO_SITUACAO = {
  chega_hoje: "Chega hoje",
  liberada: "Liberada",
  hospedado: "Hospedado",
  sai_hoje: "Sai hoje",
  proxima: "Próxima",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
};

export const TOM_SITUACAO = {
  chega_hoje: "positive",
  liberada: "positive",
  hospedado: "neutral",
  sai_hoje: "brand",
  proxima: "muted",
  encerrada: "muted",
  cancelada: "danger",
};

/** As pílulas da janela e o que cada uma junta. */
export const GRUPOS = {
  todas: (s) => s !== "encerrada" && s !== "cancelada",
  chega_hoje: (s) => s === "chega_hoje" || s === "liberada",
  hospedados: (s) => s === "hospedado" || s === "sai_hoje",
  proximas: (s) => s === "proxima",
  antigas: (s) => s === "encerrada" || s === "cancelada",
};

/** Vale para hoje: entra a liberada que ainda não chegou e a hospedada. */
export const vigente = (t, hoje) => ["chega_hoje", "liberada", "hospedado", "sai_hoje"].includes(situacaoNaTela(t, hoje));

/** A(s) liberação(ões) de hoje com esta placa, com o veículo que casou. */
export function acharPorPlaca(lista, placa, hoje) {
  const alvo = soPlaca(placa);
  if (alvo.length < 7) return [];
  return (lista ?? [])
    .filter((t) => vigente(t, hoje))
    .map((t) => ({ temporada: t, veiculo: veiculosDa(t).find((v) => soPlaca(v.placa) === alvo) }))
    .filter((x) => x.veiculo);
}

/** "123.456.789-01" -> "12345678901". */
export const soCpf = (v) => String(v ?? "").replace(/\D/g, "").slice(0, 11);

/** Os acompanhantes da liberação, sempre lista (a coluna é jsonb, 0093). */
export const acompanhantesDa = (t) =>
  (Array.isArray(t?.acompanhantes) ? t.acompanhantes : []).filter((a) => a && String(a.nome ?? "").trim());

/** Quantas pessoas: o responsável e os acompanhantes (ou o número antigo, de antes da 0093). */
export const pessoasDa = (t) => (acompanhantesDa(t).length ? 1 + acompanhantesDa(t).length : (t?.pessoas ?? 1));

/**
 * A liberação de hoje deste CPF — do responsável ou de um acompanhante. O
 * hóspede mostra o documento no portão e o porteiro digita: aparece o mesmo
 * "Liberado" da placa. `pessoa` é quem casou; o veículo vem nulo.
 */
export function acharPorCpf(lista, cpf, hoje) {
  const alvo = soCpf(cpf);
  if (alvo.length !== 11) return [];
  const achadas = [];
  (lista ?? []).filter((t) => vigente(t, hoje)).forEach((t) => {
    if (soCpf(t.cpf) === alvo) achadas.push({ temporada: t, veiculo: null, pessoa: { nome: t.hospede, cpf: t.cpf, responsavel: true } });
    else {
      const a = acompanhantesDa(t).find((x) => soCpf(x.cpf) === alvo);
      if (a) achadas.push({ temporada: t, veiculo: null, pessoa: { nome: a.nome, cpf: a.cpf, responsavel: false } });
    }
  });
  return achadas;
}

/** As de hoje que ainda não chegaram: a lista que o porteiro escolhe quando a placa não casa. */
export const esperadasHoje = (lista, hoje) =>
  (lista ?? []).filter((t) => ["chega_hoje", "liberada"].includes(situacaoNaTela(t, hoje)));

/** O que falta para salvar uma liberação; vazio = pode salvar. */
export function problemasDaTemporada(f) {
  const e = {};
  if (!f.id_unidade) e.id_unidade = "Escolha a unidade.";
  if (!f.entrada) e.entrada = "Informe a data de entrada.";
  if (!f.saida) e.saida = "Informe a data de saída.";
  else if (f.entrada && f.saida < f.entrada) e.saida = "A saída não pode ser antes da entrada.";
  if (!String(f.hospede ?? "").trim()) e.hospede = "Informe o nome do hóspede responsável.";
  if (!String(f.proprietario ?? "").trim()) e.proprietario = "Informe o nome do proprietário que autorizou.";
  const cpf = soCpf(f.cpf);
  if (!cpf) e.cpf = "Informe o CPF do hóspede responsável.";
  else if (cpf.length !== 11) e.cpf = "O CPF precisa ter 11 dígitos.";
  const acomp = f.acompanhantes ?? [];
  if (acomp.some((a) => !String(a.nome ?? "").trim())) e.acompanhantes = "Dê o nome de cada acompanhante, ou tire a linha vazia.";
  else if (acomp.some((a) => soCpf(a.cpf) && soCpf(a.cpf).length !== 11)) e.acompanhantes = "O CPF de acompanhante, quando informado, tem 11 dígitos.";
  if (f.comCarro) {
    const v = f.veiculos ?? [];
    if (!v.length || !soPlaca(v[0].placa)) e.veiculos = "Informe a placa do veículo, ou desligue \"Vem de veículo\".";
    else if (soPlaca(v[0].placa).length < 7) e.veiculos = "A placa precisa ter 7 letras e números.";
  }
  return e;
}

/** Os campos que vão para o banco. */
export function paraGravar(f) {
  return {
    id_unidade: Number(f.id_unidade),
    entrada: f.entrada,
    saida: f.saida,
    hospede: String(f.hospede).trim(),
    cpf: soCpf(f.cpf) || null,
    telefone: String(f.telefone ?? "").trim() || null,
    acompanhantes: (f.acompanhantes ?? []).map((a) => ({ nome: String(a.nome).trim(), cpf: soCpf(a.cpf) || null })),
    // O número sai da lista: o responsável e quem vem com ele.
    pessoas: 1 + (f.acompanhantes ?? []).length,
    // Um veículo só por temporada (13/11/2026).
    veiculos: f.comCarro
      ? (f.veiculos ?? []).slice(0, 1).map((v) => ({
          placa: soPlaca(v.placa),
          modelo: String(v.modelo ?? "").trim() || null,
          cor: String(v.cor ?? "").trim() || null,
        }))
      : [],
    observacao: String(f.observacao ?? "").trim() || null,
    proprietario: String(f.proprietario ?? "").trim() || null,
    // A hora (0111) só vai quando preenchida: sem o 0111 aplicado, a coluna
    // não existe e a gravação falharia.
    ...(f.horaEntrada ? { hora_entrada: f.horaEntrada } : {}),
    ...(f.horaSaida ? { hora_saida: f.horaSaida } : {}),
  };
}

/** "20/11 às 14h" ou só o dia, quando não há hora. */
export const comHora = (diaBR, hora) => {
  const h = String(hora ?? "").slice(0, 5);
  return h ? `${diaBR} às ${h.replace(":00", "h").replace(":", "h")}` : diaBR;
};

/** "Gol · prata", ou o tipo quando não há modelo. */
export const descreverCarro = (v) => [v?.modelo, v?.cor].filter(Boolean).join(" · ") || "Carro";
