import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import React, { useCallback, useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Unidades from "./pages/Unidades";
import Moradores from "./pages/Moradores"; 
import Vagas from "./pages/Vagas"; 
import Festas from "./pages/Festas";
import Churrasqueira from "./pages/Churrasqueira";
import SelecaoUsuario from "./pages/SelecaoUsuario";
import Mudancas from "./pages/Mudancas";
import Calendario from "./pages/Calendario";
import Aprovacao from "./pages/Aprovacao";
import Piscina from "./pages/Piscina";
import Comunicado from "./pages/Comunicado";
import Tarefas from "./pages/Tarefas";
import Patrimonio from "./pages/Patrimonio";
import Encomendas from "./pages/Encomendas";
import Entregas from "./pages/Entregas";
import Confirmacao from "./pages/Confirmacao";
import Processos from "./pages/Processos";
import Assembleia from "./pages/Assembleia";
import Agendamento from "./pages/Agendamento";
import Usuarios from "./pages/Usuarios";
import Vitrine from "./pages/Vitrine";
import TrocarSenhaObrigatoria from "./components/TrocarSenhaObrigatoria";
import GuardaDeSessao from "./components/GuardaDeSessao";
import { precisaTrocarSenha } from "./api/auth";
import { SESSAO_EXPIRADA } from "./api/db";
import { clearSessionToken } from "./auth/session";

export default function App() {

  // O tema vive em src/theme/ThemeProvider.jsx, montado no main.jsx.
  // O App não precisa mais ler cores: fundo e texto vêm de base.css e
  // das classes .vit-layout / .vit-main em shell.css.

  // ================= USUÁRIO LOGADO =================
const [usuarioLogado, setUsuarioLogado] = useState(() => {
  // Alterado de localStorage para sessionStorage
  const salvo = sessionStorage.getItem("usuarioLogado"); 
  return salvo ? JSON.parse(salvo) : null;
});

  // ================= ABA ATIVA =================
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("activeTab") || "Dashboard";
  });

  // Sai daqui, e não de baixo do arquivo, porque o efeito da troca de senha
  // precisa dele: quando a sessão acabou de verdade, o certo é mandar entrar de
  // novo. `useCallback` com lista vazia porque as três coisas que ele usa são
  // estáveis — sem isso, ele mudaria de identidade a cada render e o efeito
  // abaixo voltaria a perguntar ao banco sem parar.
  const handleLogout = useCallback(() => {
    setUsuarioLogado(null);
    setActiveTab("Dashboard");
    sessionStorage.clear(); // limpa tudo do usuário ao deslogar
    clearSessionToken();
  }, []);

  // ================= TROCA DE SENHA OBRIGATÓRIA =================
  //
  // `null` enquanto não perguntamos ao banco. Não é o mesmo que `false`: tratar
  // "ainda não sei" como "não precisa" deixaria o dashboard aparecer por um
  // instante antes do redirecionamento, e é justamente esse instante que a tela
  // de troca obrigatória existe para não ter.
  const [trocaPendente, setTrocaPendente] = useState(null);

  useEffect(() => {
    // O `set-state-in-effect` aqui é falso positivo, e o silêncio é pontual de
    // propósito: o arquivo inteiro estava calado por um `eslint-disable` no
    // topo, herdado do temporizador que saiu daqui, e isso escondia qualquer
    // problema novo em todo o App.
    //
    // O estado nasce `null` — "ainda não perguntei ao banco" —, e esta linha é
    // o único jeito de sair dele quando não há ninguém logado. Sem ela, quem
    // sai do sistema deixaria a exigência de troca pendurada para o próximo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!usuarioLogado) { setTrocaPendente(null); return; }

    // Perguntamos a cada sessão restaurada, e não só no login: recarregar a
    // página ou reabrir a aba não passa pelo formulário, e antes disso quem
    // tinha a senha resetada seguia usando o sistema sem nunca trocá-la.
    let valeAinda = true;
    precisaTrocarSenha()
      .then((precisa) => { if (valeAinda) setTrocaPendente(precisa); })
      .catch((erro) => {
        if (!valeAinda) return;
        // Sessão vencida NÃO é senha por trocar, e essa confusão é o defeito
        // que trazia a tela de troca do nada para quem deixava a aba aberta
        // dez minutos. Aqui a pessoa entra de novo, que é o que falta mesmo.
        if (erro?.message === SESSAO_EXPIRADA) { handleLogout(); return; }
        // Qualquer outra falha continua fechando a porta: uma senha que veio
        // de um arquivo em texto puro não passa por causa de um tropeço.
        setTrocaPendente(true);
      });
    return () => { valeAinda = false; };
  }, [usuarioLogado, handleLogout]);

  // ================= SALVAR PREFERÊNCIAS =================
  // darkMode é persistido pelo ThemeProvider.
  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  // ================= SALVAR USUÁRIO =================
  useEffect(() => {
  if (usuarioLogado) {
    // Agora salvando no sessionStorage
    sessionStorage.setItem("usuarioLogado", JSON.stringify(usuarioLogado));
    sessionStorage.setItem("user", JSON.stringify(usuarioLogado));
    sessionStorage.setItem("ultimoAcesso", Date.now());
  } else {
    // Removendo do sessionStorage
    sessionStorage.removeItem("usuarioLogado");
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("ultimoAcesso");
  }
}, [usuarioLogado]);

  // ================= SESSÃO PARADA =================
  //
  // A contagem, o aviso e a queda moram no <GuardaDeSessao>, dentro do Router:
  // o prazo depende da tela aberta — a portaria tem prazo mais curto, porque a
  // tela dela fica num lugar de passagem, aberta o turno inteiro — e só lá
  // dentro dá para saber qual é a tela.
  //
  // O que havia aqui era um `alert()`, que trava a aba e não diz quanto tempo
  // resta. Agora o sistema PERGUNTA antes de derrubar.

// ================= APP PRINCIPAL COM ROTAS =================
  return (
      <Router>
        <GuardaDeSessao ativo={Boolean(usuarioLogado)} onExpirar={handleLogout} />
        {!usuarioLogado ? (
          <Routes>
            <Route path="/login" element={<SelecaoUsuario onSelectUser={setUsuarioLogado} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <>
            {/* A pessoa entra no sistema normalmente e o pedido de troca vem
                por cima, com o painel visível atrás. O modal não fecha: não
                tem X, não fecha no Esc nem clicando fora — a exigência não é
                um lembrete.

                `trocaPendente` vem do banco a cada sessão restaurada, e não do
                retorno do login, que acontecia uma vez só e deixava passar
                quem recarregava a página com a sessão viva. */}
            {trocaPendente === true && (
              <TrocarSenhaObrigatoria
                email={usuarioLogado.email}
                onTrocada={() => setTrocaPendente(false)}
              />
            )}
            <Routes>
            <Route
              path="*"
              element={
                <div className="vit-layout">
                  {/* Primeiro elemento focável da página, exigência de acessibilidade
                      para quem navega por teclado não precisar tabular a sidebar toda. */}
                  <a href="#conteudo" className="pular-para-conteudo">
                    Pular para o conteúdo
                  </a>

                  <Sidebar active={activeTab} setActive={setActiveTab} user={usuarioLogado} onLogout={handleLogout} />

                  <main id="conteudo" className="vit-main">
                    <Routes>
                      <Route path="/dashboard" element={<Dashboard user={usuarioLogado} />} />

                      {["Porteiro", "Sindico", "Auxiliar Administrativo", "Desenvolvedor"].includes(usuarioLogado.cargo) && (
                        <Route path="/entregas" element={<Entregas user={usuarioLogado} />} />
                      )}

                      {/* Assembleia: Sindico, Auxiliar, Dev e Conselheiro (read-only); oculta para Porteiro */}
                      {["Sindico", "Auxiliar Administrativo", "Desenvolvedor", "Conselheiro"].includes(usuarioLogado.cargo) && (
                        <Route path="/assembleia" element={<Assembleia user={usuarioLogado} />} />
                      )}

                      {/* Rotas restritas */}
                      {usuarioLogado.cargo !== "Conselheiro" && (
                        <>
                          {/* user por prop: a página lia localStorage("user"), mas o
                              login grava em sessionStorage, então o log de auditoria
                              registrava "Sistema" no lugar do responsável real. */}
                          <Route path="/unidades" element={<Unidades user={usuarioLogado} />} />
                          <Route path="/moradores" element={<Moradores user={usuarioLogado} />} />
                          <Route path="/vagas" element={<Vagas user={usuarioLogado} />} />
                          <Route path="/festas" element={<Festas user={usuarioLogado} />} />
                          <Route path="/churrasqueira" element={<Churrasqueira user={usuarioLogado} />} />
                          <Route path="/mudancas" element={<Mudancas user={usuarioLogado} />} />
                          <Route path="/calendario" element={<Calendario user={usuarioLogado} />} />
                          <Route path="/aprovacao" element={<Aprovacao user={usuarioLogado} />} />
                          <Route path="/piscina" element={<Piscina user={usuarioLogado} />} />
                          <Route path="/comunicado" element={<Comunicado user={usuarioLogado} />} />
                          <Route path="/patrimonio" element={<Patrimonio user={usuarioLogado} />} />
                          <Route path="/encomendas" element={<Encomendas user={usuarioLogado} />} />
                          <Route path="/processos" element={<Processos user={usuarioLogado} />} />
                          <Route path="/agendamento" element={<Agendamento user={usuarioLogado} />} />
                        </>
                      )}

                      {/* Tarefas: o quadro da administração. Bloco próprio, e não o
                          `cargo !== "Conselheiro"` acima, que deixaria o porteiro
                          abrir /tarefas pela barra de endereço. */}
                      {["Sindico", "Auxiliar Administrativo", "Desenvolvedor"].includes(usuarioLogado.cargo) && (
                        <Route path="/tarefas" element={<Tarefas user={usuarioLogado} />} />
                      )}

                      {/* Confirmação de números: oculta para Porteiro e Conselheiro */}
                      {["Sindico", "Auxiliar Administrativo", "Desenvolvedor"].includes(usuarioLogado.cargo) && (
                        <Route path="/confirmacao" element={<Confirmacao user={usuarioLogado} />} />
                      )}

                      {usuarioLogado.cargo === "Desenvolvedor" && (
                        <Route path="/usuarios" element={<Usuarios user={usuarioLogado} onLogout={handleLogout} />} />
                      )}

                      {/* Vitrine do design system. Só Desenvolvedor. Guia vivo dos
                          primitivos: se um deles quebrar, quebra aqui primeiro. */}
                      {usuarioLogado.cargo === "Desenvolvedor" && (
                        <Route path="/vitrine" element={<Vitrine />} />
                      )}

                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </main>
                </div>
              }
            />
            </Routes>
          </>
        )}
      </Router>
  );
}