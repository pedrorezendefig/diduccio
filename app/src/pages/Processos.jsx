import React, { useState } from "react";
import {
  Package, ChevronDown, MessageCircle, BookOpen, FileText,
  CheckCircle2, Camera, Bell, MapPin, PenLine, Hash, Truck, User, Phone,
  Search, ScanLine, Boxes, IdCard,
} from "lucide-react";
import { PageHeader } from "../ui";

// ============================================================
// CONTEÚDO DOS PROCESSOS
// Para adicionar um passo a passo novo, basta incluir um objeto
// em "guias" (ou uma categoria nova com suas guias).
//
// Não há cor por guia: o design system usa um acento só. A
// distinção entre guias é feita por ícone e título, não por cor.
// ============================================================
const CATEGORIAS = [
  {
    id: "encomendas",
    nome: "Encomendas",
    icon: Package,
    guias: [
      {
        id: "enc-com-numero",
        titulo: "Cadastrar: morador COM número no sistema",
        resumo: "Notificação por WhatsApp e retirada por código.",
        icon: MessageCircle,
        passos: [
          { icon: Package, titulo: "Abrir o cadastro", texto: "Clique em “Novo recebimento” e selecione a unidade. Você pode buscar por 5206, por 206 ou por “bloco 5”." },
          { icon: User, titulo: "Conferir o destinatário", texto: "Como o morador tem número confirmado, o nome e o telefone aparecem preenchidos automaticamente." },
          { icon: Boxes, titulo: "Preencher os dados", texto: "Informe a quantidade de volumes e, em cada item, o nº fiscal e a foto da etiqueta. Depois toque em “Registrar entrada”." },
          { icon: Bell, titulo: "Enviar a notificação", texto: "Abre a janela do WhatsApp: toque em “Sim, enviar WhatsApp”. O morador recebe a mensagem com o código de retirada." },
          { icon: IdCard, titulo: "Retirada na portaria", texto: "O morador chega com o código que recebeu. Na lista, abra a encomenda para dar baixa e informe o código de entrega que ele apresentar." },
          { icon: CheckCircle2, titulo: "Confirmar a baixa", texto: "Tire a foto de comprovação e confirme. A encomenda passa para “Entregue”." },
        ],
      },
      {
        id: "enc-sem-numero",
        titulo: "Cadastrar: morador SEM número no sistema",
        resumo: "Registro no livro do bloco e baixa com assinatura.",
        icon: BookOpen,
        passos: [
          { icon: Package, titulo: "Cadastrar a encomenda", texto: "Selecione a unidade e o morador. Como não há número confirmado, o telefone fica vazio e aparece um aviso." },
          { icon: Hash, titulo: "Anotar o nº da encomenda", texto: "Ao salvar, aparece o nº da encomenda gerado (por exemplo 8442W). Anote esse número no livro do bloco indicado." },
          { icon: PenLine, titulo: "Informar a linha do livro", texto: "Digite no app em qual linha do livro você anotou e toque em “Salvar”. Essa linha fica guardada na encomenda." },
          { icon: Search, titulo: "Morador localiza no app", texto: "Quando o morador chega, ele vê no app que tem encomenda e qual a linha do caderno onde está o código." },
          { icon: PenLine, titulo: "Assinatura no caderno", texto: "O morador escreve o nome e assina na linha correspondente do caderno." },
          { icon: Camera, titulo: "Dar baixa no app", texto: "Abra a baixa, informe o CPF e o nome de quem retirou, e tire uma foto da assinatura do caderno para anexar. Confirme." },
        ],
      },
      {
        id: "enc-campos",
        titulo: "Entenda cada campo do cadastro",
        resumo: "O que significa cada informação do formulário.",
        icon: FileText,
        campos: [
          { icon: MapPin, nome: "Unidade destinatária", texto: "Bloco e apartamento de destino. Busque por 5206, por 206 ou por “bloco 5”." },
          { icon: User, nome: "Morador", texto: "Quem vai receber. Vem preenchido se o morador tem número confirmado; senão, digite o nome." },
          { icon: Phone, nome: "Telefone", texto: "Número usado na notificação por WhatsApp. Só é preenchido quando o número foi confirmado." },
          { icon: Boxes, nome: "Quantidade de volumes", texto: "Quantos volumes chegaram, de 1 a 10. Cria um bloco de preenchimento por volume." },
          { icon: ScanLine, nome: "Nº fiscal", texto: "Número da nota ou etiqueta que identifica a encomenda. Obrigatório." },
          { icon: Truck, nome: "Transportadora", texto: "Quem entregou: Correios, Amazon, Mercado Livre. Opcional." },
          { icon: Camera, nome: "Foto da etiqueta", texto: "Foto da etiqueta de cada volume. Obrigatória, é o comprovante do recebimento." },
        ],
      },
    ],
  },
];

export default function Processos() {
  const [abertos, setAbertos] = useState(() => new Set());

  const alternar = (id) =>
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const totalGuias = CATEGORIAS.reduce((a, c) => a + c.guias.length, 0);

  return (
    <div>
      <PageHeader
        title="Processos"
        meta={`${totalGuias} guias · toque em um título para ver o passo a passo`}
      />

      {CATEGORIAS.map((cat) => {
        const IconeCategoria = cat.icon;
        return (
          <section key={cat.id} className="proc-categoria">
            <header className="proc-categoria__topo">
              <span className="proc-categoria__icone" aria-hidden="true">
                <IconeCategoria size={19} />
              </span>
              <span>
                <h2 className="proc-categoria__nome">{cat.nome}</h2>
                <p className="proc-categoria__contagem">
                  {cat.guias.length} {cat.guias.length === 1 ? "guia" : "guias"}
                </p>
              </span>
            </header>

            <div className="proc-lista">
              {cat.guias.map((g) => {
                const aberto = abertos.has(g.id);
                const IconeGuia = g.icon;
                return (
                  <article key={g.id} className="proc-guia">
                    <h3 style={{ margin: 0 }}>
                      <button
                        type="button"
                        className="proc-guia__botao"
                        aria-expanded={aberto}
                        aria-controls={`guia-${g.id}`}
                        onClick={() => alternar(g.id)}
                      >
                        <span className="proc-guia__icone" aria-hidden="true">
                          <IconeGuia size={19} />
                        </span>
                        <span className="proc-guia__texto">
                          <span className="proc-guia__titulo">{g.titulo}</span>
                          <span className="proc-guia__resumo">{g.resumo}</span>
                        </span>
                        <ChevronDown
                          size={19}
                          aria-hidden="true"
                          className={`proc-guia__seta${aberto ? " proc-guia__seta--aberta" : ""}`}
                        />
                      </button>
                    </h3>

                    {aberto && (
                      <div className="proc-guia__corpo" id={`guia-${g.id}`}>
                        {g.passos && <Passos passos={g.passos} />}
                        {g.campos && <Campos campos={g.campos} />}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Passos numerados, ligados por uma linha vertical. */
function Passos({ passos }) {
  return (
    <ol className="proc-passos">
      {passos.map((p, i) => {
        const IconePasso = p.icon;
        return (
          <li key={p.titulo} className="proc-passo">
            <span className="proc-passo__numero" aria-hidden="true">{i + 1}</span>
            <span className="proc-passo__conteudo">
              <span className="proc-passo__titulo">
                {IconePasso && <IconePasso size={15} aria-hidden="true" />}
                {p.titulo}
              </span>
              <span className="proc-passo__texto">{p.texto}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Glossário dos campos do formulário. */
function Campos({ campos }) {
  return (
    <dl className="proc-campos">
      {campos.map((c) => {
        const IconeCampo = c.icon;
        return (
          <div key={c.nome} className="proc-campo">
            <span className="proc-campo__icone" aria-hidden="true">
              {IconeCampo && <IconeCampo size={16} />}
            </span>
            <span style={{ minWidth: 0 }}>
              <dt className="proc-campo__nome">{c.nome}</dt>
              <dd className="proc-campo__texto">{c.texto}</dd>
            </span>
          </div>
        );
      })}
    </dl>
  );
}
