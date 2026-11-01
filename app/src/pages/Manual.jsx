import React from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState } from "../ui";
import { paginasDoCargo } from "../manual/paginas";

/**
 * O Manual: a ajuda de cada tela, dentro do app (ADR 0003).
 *
 * Todo Cargo abre o Manual, e cada um vê só as páginas das telas que vê no
 * menu. Quem decide é `paginasDoCargo`; esta tela só desenha.
 */
export default function Manual({ user }) {
  const paginas = paginasDoCargo(user?.cargo);

  return (
    <Routes>
      <Route index element={<Inicio paginas={paginas} />} />
      <Route path=":id" element={<Pagina paginas={paginas} />} />
      <Route path="*" element={<Navigate to="/manual" replace />} />
    </Routes>
  );
}

/** As páginas que o Cargo vê, agrupadas por área, na ordem do conteúdo. */
function Inicio({ paginas }) {
  const areas = [...new Set(paginas.map((p) => p.area))];

  return (
    <div>
      <PageHeader title="Manual" meta="Como usar cada tela do sistema" />

      {paginas.length === 0 && (
        <EmptyState
          icon={<BookOpen size={22} />}
          title="Ainda não há páginas para as suas telas"
          description="As páginas das suas telas aparecem aqui assim que ficarem prontas."
        />
      )}

      {areas.map((area) => {
        const daArea = paginas.filter((p) => p.area === area);
        return (
          <section key={area} className="proc-categoria">
            <header className="proc-categoria__topo">
              <span className="proc-categoria__icone" aria-hidden="true">
                <BookOpen size={19} />
              </span>
              <span>
                <h2 className="proc-categoria__nome">{area}</h2>
                <p className="proc-categoria__contagem">
                  {daArea.length} {daArea.length === 1 ? "página" : "páginas"}
                </p>
              </span>
            </header>

            <ul className="proc-lista manual-lista">
              {daArea.map((p) => (
                <li key={p.id} className="proc-guia">
                  <Link to={`/manual/${p.id}`} className="proc-guia__botao manual-link">
                    <span className="proc-guia__texto">
                      <span className="proc-guia__titulo">{p.titulo}</span>
                      <span className="proc-guia__resumo">{p.resumo}</span>
                    </span>
                    <ChevronRight size={19} aria-hidden="true" className="proc-guia__seta" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** A página de uma tela. Página que o Cargo não vê volta para o início. */
function Pagina({ paginas }) {
  const { id } = useParams();
  const pagina = paginas.find((p) => p.id === id);
  if (!pagina) return <Navigate to="/manual" replace />;

  return (
    <div>
      <Link to="/manual" className="manual-voltar">
        <ArrowLeft size={16} aria-hidden="true" />
        Manual
      </Link>
      <PageHeader title={pagina.titulo} meta={pagina.resumo} />

      <div className="proc-lista">
        {pagina.tarefas.map((t) => (
          <section key={t.id} className="proc-guia" aria-labelledby={`tarefa-${t.id}`}>
            <h2 id={`tarefa-${t.id}`} className="manual-tarefa__titulo">{t.titulo}</h2>
            <div className="proc-guia__corpo">
              <ol className="proc-passos">
                {t.passos.map((passo, i) => (
                  <li key={passo.titulo} className="proc-passo">
                    <span className="proc-passo__numero" aria-hidden="true">{i + 1}</span>
                    <span className="proc-passo__conteudo">
                      <span className="proc-passo__titulo">{passo.titulo}</span>
                      <span className="proc-passo__texto">{passo.texto}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
