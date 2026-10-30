import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/shell.css'
import './styles/login.css'
import './styles/dashboard.css'
import './styles/cadastro.css'
import './styles/fila.css'
import './styles/documento.css'
import './styles/retirada.css'
import './styles/tarefas.css'
import './styles/mapa.css'
import './index.css'
import App from './App.jsx'
import { instalarModoDemo } from './demo'
import { ThemeProvider } from './theme/ThemeProvider.jsx'
import { ToastProvider } from './ui/Toast.jsx'
import { ConfirmProvider } from './ui/Confirm.jsx'

// Sem backend configurado, desvia o fetch para o servidor falso. Precisa vir
// antes do render: a tela de login já busca os perfis na montagem.
instalarModoDemo()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)

/*
 * Instalar o ViT na tela inicial do celular.
 *
 * O service worker é o que faz o Chrome oferecer "Instalar app" — sem ele o
 * menu só dá o atalho comum, que abre com a barra de endereço por cima e come
 * altura de tela que a portaria não tem de sobra.
 *
 * Só em produção: em desenvolvimento ele guardaria a casca antiga e faria
 * parecer que a alteração não subiu. E `import.meta.env.PROD` é do Vite, então
 * o bloco inteiro some do bundle de desenvolvimento.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Depois do `load`: registrar durante o carregamento disputa banda com o
  // próprio app na primeira visita, que é a mais lenta.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registro pode falhar sem HTTPS ou com o navegador em modo restrito.
      // Não é caso de avisar ninguém: o sistema funciona igual, só não instala.
    });
  });
}
