---
status: accepted
---

# O Manual mora dentro do app e os prints saem do modo demo por script

O app não tem ajuda, só a tela Processos, um guia estático de Encomendas que já envelheceu. Decidimos que o Manual é uma rota do próprio app (`/manual`), aberta a todo Cargo, que mostra só as páginas das telas que aquele Cargo usa. Os prints são gerados por um script Playwright que entra no modo demo com cada login de exemplo e fotografa cada tela; nunca se tira print à mão nem de dado real. A tela Processos vira a seção Portaria do Manual.

## Opções consideradas

- **Site de documentação separado:** mais um deploy e o Usuário sai do app para ler.
- **Prints à mão:** envelhecem a cada mudança de tela e arriscam mostrar CPF e telefone de morador de verdade.
- **Rota no app com prints do modo demo (escolhida):** o Manual acompanha o app no mesmo PR e o script refaz todos os prints com um comando.

## Consequências

- Os mesmos prints servem ao vídeo de apresentação para o síndico.
- Os prints só fazem sentido depois da troca da marca ViT por Diduccio (issue #8).
- As telas que são maquete (Aprovação, Calendário, Patrimônio) ficam fora do Manual até funcionarem.
