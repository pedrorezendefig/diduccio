import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// ---- APIs que o jsdom não implementa e que as páginas usam ao montar ----

// Nem todo teste roda em jsdom: os que verificam as Edge Functions rodam em
// node, porque o esbuild não funciona sob jsdom. Sem esta guarda, este setup
// derrubava o arquivo inteiro no `window.matchMedia` antes de o primeiro teste
// existir — e o vitest relatava "no tests", que não parece um erro.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  }

  window.scrollTo = vi.fn();

  // O sistema tem 113 alert()/confirm(). Enquanto existirem, silenciamos no teste.
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
}

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ---- Bibliotecas que não funcionam em jsdom e não são o objeto do teste ----

// pdfjs-dist registra um web worker no import.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0 }) })),
  version: "6.1.200",
}));

// @google/generative-ai lê chave de API no construtor.
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: vi.fn(async () => ({ response: { text: () => "" } })),
        startChat: vi.fn(() => ({
          sendMessage: vi.fn(async () => ({ response: { text: () => "" } })),
        })),
      };
    }
  },
}));

// react-signature-canvas usa signature_pad, que precisa de um contexto 2D real.
// O jsdom devolve null em HTMLCanvasElement.getContext sem o pacote `canvas`,
// e a biblioteca quebra em cima disso. Incompatibilidade da lib com jsdom,
// não da nossa página: por isso mockamos aqui e não alteramos Aprovacao.jsx.
vi.mock("react-signature-canvas", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const SignatureCanvas = forwardRef(function SignatureCanvasMock(props, ref) {
    useImperativeHandle(ref, () => ({
      clear: vi.fn(),
      isEmpty: vi.fn(() => true),
      toDataURL: vi.fn(() => "data:image/png;base64,"),
      getTrimmedCanvas: vi.fn(() => ({ toDataURL: () => "data:image/png;base64," })),
      getCanvas: vi.fn(() => document.createElement("canvas")),
      fromDataURL: vi.fn(),
    }));
    return null;
  });
  return { default: SignatureCanvas };
});

// html2canvas e html-to-image dependem de layout real.
vi.mock("html2canvas", () => ({
  default: vi.fn(async () => ({ toDataURL: () => "data:image/png;base64," })),
}));
vi.mock("html-to-image", () => ({
  toPng: vi.fn(async () => "data:image/png;base64,"),
  toJpeg: vi.fn(async () => "data:image/jpeg;base64,"),
}));

// ---- A base de senhas vazadas (lib/senhaVazada.js) ----
// Nenhum teste fala com a internet: a consulta responde "não vazou". O teste
// que quer o caso "vazou" simula o módulo (vi.mock) no próprio arquivo.
{
  const fetchDeVerdade = globalThis.fetch;
  globalThis.fetch = (url, init) =>
    String(url).startsWith("https://api.pwnedpasswords.com/")
      ? Promise.resolve(new Response("AAAAA:0"))
      : fetchDeVerdade(url, init);
}
