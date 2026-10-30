# ViT — gestão de condomínio

Sistema de administração de condomínio: cadastro de unidades, moradores e vagas,
reservas de áreas comuns, portaria e encomendas, compras, comunicados, atas de
assembleia e um painel com os indicadores do mês.

ViT é o software; **VITTA** é a empresa por trás dele.

---

## Rodando

```bash
npm install
npm run dev:demo     # modo demonstração — não precisa de backend
```

Abra o endereço que o Vite imprimir. Todos os perfis entram com a senha **`demo`**:

| Perfil | E-mail | O que enxerga |
|---|---|---|
| Síndico | `sindico@exemplo.com.br` | tudo |
| Auxiliar Administrativo | `administrativo@exemplo.com.br` | tudo, menos gestão de usuários |
| Porteiro | `portaria@exemplo.com.br` | portaria, encomendas e o painel |
| Conselheiro | `conselho@exemplo.com.br` | só as atas de assembleia |
| Desenvolvedor | `dev@exemplo.com.br` | tudo + usuários e a vitrine do design system |

### Abrir no celular

O dev server já escuta na rede local. Rode `npm run dev:demo`, pegue a linha
`Network:` que o Vite imprime e abra esse endereço no celular — mesmo Wi‑Fi.
Se não carregar, libere a porta 5173 no firewall.

---

## Modo demonstração

Sem `VITE_API_URL` configurado, o app sobe em modo demo:

- **Nenhuma requisição sai da máquina.** O `fetch` é envelopado em
  [src/demo/index.js](src/demo/index.js) e toda chamada ao backend é desviada
  para um servidor falso em memória ([src/demo/servidor.js](src/demo/servidor.js)).
- **Os dados são fictícios** ([src/demo/dados.js](src/demo/dados.js)): 64 unidades,
  137 moradores, 58 vagas, além de reservas, encomendas, compras e atas. Nomes,
  CPFs, placas e telefones são inventados — a geração é determinística, então a
  apresentação mostra sempre os mesmos dados.
- **A escrita funciona e é volátil.** Criar, editar e apagar tem efeito na tela;
  recarregar a página devolve tudo ao estado inicial.
- **A IA responde com texto fixo.** Resumo de ata, chat das atas e geração de
  comunicado devolvem exemplos plausíveis, sem chamar modelo nenhum.

As páginas não sabem que estão em demo: é o mesmo código que roda em produção.

## Rodando contra o backend real

O backend é um Apps Script sobre Google Sheets, fora deste repositório.

```bash
cp .env.example .env.local   # preencha VITE_API_URL e VITE_SHEETS_TOKEN
npm run dev
```

A URL do deployment e o token **não ficam no código** — juntos, dão leitura e
escrita na planilha inteira. Ficam só no seu `.env.local`, que é ignorado pelo git.

## Testes

```bash
npm test         # suíte completa
npm run lint
```

## Estrutura

| Caminho | O que é |
|---|---|
| [src/pages/](src/pages/) | uma tela por assunto (moradores, vagas, festas, encomendas…) |
| [src/ui/](src/ui/) | design system: Button, Input, Table, Modal, Toast… |
| [src/styles/](src/styles/) | tokens e folhas de estilo, com tema claro e escuro |
| [src/brand/](src/brand/) | identidade visual — logo, skyline, marcas |
| [src/demo/](src/demo/) | backend falso e dados fictícios do modo demonstração |
| [src/api/config.js](src/api/config.js) | endereço do backend e chave do modo demo |
