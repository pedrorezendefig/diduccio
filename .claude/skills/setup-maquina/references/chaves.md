# Acessos: de onde vem cada um

O IAE ainda não tem deploy nem chave de serviço externo. Por isso não existe `tokens/.env` nem `.env` do app para preencher. Quando a plataforma for escolhida, as chaves dela entram nesta tabela, com o nível, se a chave é por pessoa ou compartilhada e o cofre onde mora.

## Serviços

| Serviço | Para quê | O que você precisa | Como conseguir |
|---|---|---|---|
| **GitHub** (`pedrorezendefig/iae`) | Issues, PRs, CI, merge | Permissão WRITE e `gh auth login` | O Pedro adiciona você como colaborador; depois `gh auth login` |
| **Claude Code** | Skills e agentes do fluxo | A sua conta | Instale com `curl -fsSL https://claude.ai/install.sh \| bash` |

Issue e PR não levam senha nem token (regra do `CLAUDE.md`).
