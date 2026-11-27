import { describe, it, expect } from "vitest";
import {
  maskCPF, maskRG, maskPhone,
  maskCPFPrivacy, maskRGPrivacy, formatCurrency,
  dataBR, dataHoraBR, dataHoraInput, horaBR,
} from "../lib/format";
import {
  extrairIdDrive, converterUrlDrive, sanitizarCelula, validarAnexo,
} from "../lib/drive";

/* ======================= MÁSCARAS ======================= */

describe("maskCPF", () => {
  it("formata 11 dígitos", () => {
    expect(maskCPF("12345678901")).toBe("123.456.789-01");
  });
  it("aceita entrada já formatada sem duplicar pontuação", () => {
    expect(maskCPF("123.456.789-01")).toBe("123.456.789-01");
  });
  it("corta o que passa de 11 dígitos", () => {
    expect(maskCPF("123456789012345")).toBe("123.456.789-01");
  });
  it("formata enquanto o usuário digita", () => {
    // Mudou de propósito: antes o regex exigia os 11 dígitos, então quem
    // preenchia via texto cru até o último número e a máscara aparecia de uma
    // vez. Campo com máscara formata a cada tecla — e o resultado com 11
    // dígitos continua idêntico, que é o que já está gravado por aí.
    expect(maskCPF("123456")).toBe("123.456");
    expect(maskCPF("1234")).toBe("123.4");
  });
  it("não quebra com vazio, null ou número", () => {
    expect(maskCPF("")).toBe("");
    expect(maskCPF(null)).toBe("");
    expect(maskCPF(12345678901)).toBe("123.456.789-01");
  });
});

describe("maskRG", () => {
  it("formata no padrão 12.123.123-4", () => {
    expect(maskRG("121231234")).toBe("12.123.123-4");
  });
  it("não quebra com vazio", () => {
    expect(maskRG("")).toBe("");
  });
});

describe("maskPhone", () => {
  it("formata celular com 11 dígitos", () => {
    expect(maskPhone("11987654321")).toBe("(11) 98765-4321");
  });
  it("devolve parcial enquanto digita", () => {
    expect(maskPhone("1198")).toBe("1198");
  });
});

describe("máscaras de privacidade", () => {
  it("CPF mostra só os 6 do meio, o mesmo padrão do banco e do app", () => {
    expect(maskCPFPrivacy("12345678901")).toBe("***.456.789-**");
    expect(maskCPFPrivacy("123.456.789-01")).toBe("***.456.789-**");
  });
  it("as máscaras de CPF das telas não se completam (teste e2e 12/11)", async () => {
    // Juntas, 123.***.***-01 e ***.456.789-** davam o CPF inteiro.
    const { readFileSync, readdirSync } = await import("node:fs");
    const arquivos = ["src/pages", "src/components", "src/lib"].flatMap(function lista(dir) {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? lista(`${dir}/${e.name}`) : /\.jsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    });
    // O padrão antigo do CPF: 3 dígitos na frente (o RG, 12.***.***-4, é outro).
    const outroPadrao = arquivos.filter((f) => /(\d{3}|\(0, ?3\)\})\.\*\*\*\.\*\*\*-/.test(readFileSync(f, "utf8")));
    expect(outroPadrao).toEqual([]);
  });
  it("CPF fora do padrão volta inalterado", () => {
    expect(maskCPFPrivacy("123")).toBe("123");
  });
  it("CPF vazio vira string vazia", () => {
    expect(maskCPFPrivacy("")).toBe("");
    expect(maskCPFPrivacy(null)).toBe("");
  });
  it("RG esconde o miolo", () => {
    expect(maskRGPrivacy("121231234")).toBe("12.***.***-4");
  });
  it("RG curto demais volta inalterado", () => {
    expect(maskRGPrivacy("123")).toBe("123");
  });
});

/* ======================= DATAS ======================= */

describe("dataBR", () => {
  it("mostra o `date` do Postgres no padrão brasileiro", () => {
    expect(dataBR("2026-03-22")).toBe("22/03/2026");
    expect(dataBR("2025-01-01")).toBe("01/01/2025");
  });

  it("não perde um dia ao formatar", () => {
    // Esta é a razão de a função recortar a string em vez de usar `new Date`:
    // `new Date("2026-03-22")` é meia-noite UTC, e exibido em Brasília (-03:00)
    // viraria 21/03/2026 — um dia a menos em toda data do sistema.
    expect(dataBR("2026-01-01")).toBe("01/01/2026");
    expect(dataBR("2026-12-31")).toBe("31/12/2026");
  });

  it("aceita timestamp completo, usando só a parte da data", () => {
    expect(dataBR("2026-06-02T11:00:00-03:00")).toBe("02/06/2026");
  });

  it("devolve vazio para nulo e não inventa data", () => {
    expect(dataBR(null)).toBe("");
    expect(dataBR("")).toBe("");
    expect(dataBR(undefined)).toBe("");
    expect(dataBR("em aberto")).toBe("em aberto");
  });
});

describe("dataHoraBR", () => {
  it("mostra o `timestamptz` com hora, sem a vírgula do pt-BR", () => {
    expect(dataHoraBR("2026-06-02T11:00:00-03:00")).toBe("02/06/2026 11:00:00");
  });

  it("converte para o horário de São Paulo, venha em que fuso vier", () => {
    // CONFIRMACAO.data_envio veio do Apps Script em UTC ("...Z"). Exibir sem
    // converter mostraria 19h para um envio que aconteceu às 16h.
    expect(dataHoraBR("2026-08-05T19:21:23.198Z")).toBe("05/08/2026 16:21:23");
  });

  it("aceita esconder os segundos", () => {
    expect(dataHoraBR("2026-06-02T11:00:00-03:00", { comSegundos: false }))
      .toBe("02/06/2026 11:00");
  });

  it("devolve vazio para nulo e não quebra com lixo", () => {
    expect(dataHoraBR(null)).toBe("");
    expect(dataHoraBR("qualquer coisa")).toBe("qualquer coisa");
  });
});

describe("dataHoraInput", () => {
  it("põe no input a hora de São Paulo, não a UTC que a API devolve", () => {
    // A mudança das 8h chega como 11:00 UTC. Com o recorte antigo o input
    // mostrava 11:00, e salvar com "-03:00" gravava 14:00 UTC — 3h a mais por edição.
    expect(dataHoraInput("2027-04-01T11:00:00+00:00")).toBe("2027-04-01T08:00");
    expect(dataHoraInput("2027-04-01T20:00:00+00:00")).toBe("2027-04-01T17:00");
  });

  it("vira o dia quando o UTC já está no dia seguinte", () => {
    expect(dataHoraInput("2027-04-02T01:30:00Z")).toBe("2027-04-01T22:30");
  });

  it("ida e volta pelo salvar não desloca o horário", () => {
    const salvo = new Date(`${dataHoraInput("2027-04-01T11:00:00+00:00")}-03:00`);
    expect(salvo.toISOString()).toBe("2027-04-01T11:00:00.000Z");
  });

  it("aceita o formato da planilha e valor sem fuso", () => {
    expect(dataHoraInput("18/02/2026 15:15:59")).toBe("2026-02-18T15:15");
    expect(dataHoraInput("2026-02-18 15:15:59")).toBe("2026-02-18T15:15");
  });

  it("devolve vazio para nulo", () => {
    expect(dataHoraInput(null)).toBe("");
    expect(dataHoraInput("")).toBe("");
  });
});

describe("horaBR", () => {
  it("corta os segundos do `time`", () => {
    expect(horaBR("17:00:00")).toBe("17:00");
    expect(horaBR("09:30:00")).toBe("09:30");
  });

  it("devolve vazio para nulo", () => {
    expect(horaBR(null)).toBe("");
  });
});

describe("formatCurrency", () => {
  // O Intl usa espaço não separável (U+00A0) entre "R$" e o número em pt-BR.
  // Normalizamos qualquer espaço em branco antes de comparar, em vez de colar
  // o caractere invisível no arquivo de teste.
  const normalizar = (t) => t.replace(/\s/g, " ");

  it("formata em real", () => {
    expect(normalizar(formatCurrency(1250.5))).toBe("R$ 1.250,50");
  });
  it("null, undefined e vazio viram zero", () => {
    for (const v of [null, undefined, ""]) {
      expect(normalizar(formatCurrency(v))).toBe("R$ 0,00");
    }
  });
});

/* ======================= DRIVE ======================= */

describe("extrairIdDrive", () => {
  it("acha o id em URL de compartilhamento", () => {
    expect(extrairIdDrive("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view"))
      .toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz123456");
  });
  it("devolve null quando não há id", () => {
    expect(extrairIdDrive("https://exemplo.com/foto.png")).toBeNull();
    expect(extrairIdDrive("")).toBeNull();
  });
});

describe("converterUrlDrive", () => {
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz123456";

  it("imagem vira miniatura no endpoint oficial", () => {
    expect(converterUrlDrive(`https://drive.google.com/file/d/${ID}/view`))
      .toBe(`https://drive.google.com/thumbnail?id=${ID}&sz=w300`);
  });

  it("PDF abre no visualizador, não na miniatura", () => {
    // Este é o comportamento que a Piscina NÃO tinha antes da extração.
    expect(converterUrlDrive(`https://drive.google.com/file/d/${ID}/contrato.pdf`))
      .toBe(`https://drive.google.com/file/d/${ID}/view`);
  });

  it("data URI passa direto, sem tocar", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    expect(converterUrlDrive(dataUri)).toBe(dataUri);
  });

  it("URL sem id do Drive volta inalterada", () => {
    expect(converterUrlDrive("https://exemplo.com/foto.png")).toBe("https://exemplo.com/foto.png");
  });

  it("vazio vira string vazia", () => {
    expect(converterUrlDrive("")).toBe("");
    expect(converterUrlDrive(null)).toBe("");
  });
});

describe("sanitizarCelula", () => {
  it("neutraliza fórmula para o Excel não executar", () => {
    expect(sanitizarCelula("=CMD()")).toBe("'=CMD()");
    expect(sanitizarCelula("+1+1")).toBe("'+1+1");
    expect(sanitizarCelula("-cmd")).toBe("'-cmd");
    expect(sanitizarCelula("@SUM")).toBe("'@SUM");
  });
  it("texto comum passa intacto", () => {
    expect(sanitizarCelula("Renata Vasconcelos")).toBe("Renata Vasconcelos");
  });
  it("null e undefined passam sem virar string", () => {
    expect(sanitizarCelula(null)).toBeNull();
    expect(sanitizarCelula(undefined)).toBeUndefined();
  });
});

describe("validarAnexo", () => {
  const arquivo = (type, size) => ({ type, size, name: "x" });

  it("aceita imagem dentro do limite", () => {
    expect(validarAnexo(arquivo("image/jpeg", 1024)).ok).toBe(true);
  });
  it("aceita PDF", () => {
    expect(validarAnexo(arquivo("application/pdf", 1024)).ok).toBe(true);
  });
  it("recusa outro tipo, com motivo legível", () => {
    const r = validarAnexo(arquivo("text/plain", 10));
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/imagem ou PDF/);
  });
  it("recusa acima de 10 MB", () => {
    const r = validarAnexo(arquivo("image/png", 11 * 1024 * 1024));
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/10 MB/);
  });
  it("recusa arquivo ausente", () => {
    expect(validarAnexo(null).ok).toBe(false);
  });
  it("devolve motivo em vez de chamar alert", () => {
    // A versão antiga chamava alert() direto. Agora quem chama decide.
    const r = validarAnexo(arquivo("text/plain", 10));
    expect(typeof r.motivo).toBe("string");
  });
});
