---
status: accepted
---

# O Aviso de encomenda chega por Web Push no App do morador, não por app de loja nem pela API do WhatsApp

O Morador hoje não entra no sistema e o Aviso é um link de WhatsApp que o Porteiro clica, uma Encomenda por vez. Decidimos dar ao Morador o Cargo Morador, com login pelo CPF como os outros Usuários, e mandar o Aviso como notificação Web Push do PWA que o app já é (manifest e service worker existem). O link de WhatsApp continua como reserva para quem não ativou a notificação.

## Opções consideradas

- **App de loja (App Store e Google Play):** notificação garantida, mas conta de desenvolvedor, revisão das lojas e um segundo código para manter. Caro para um prédio só.
- **API oficial do WhatsApp (Business):** chega em todo mundo, mas cobra por mensagem, exige número verificado e template aprovado, e prende o Aviso a um fornecedor.
- **Web Push no PWA (escolhida):** grátis, o mesmo código do app, sem loja. O custo é que no iPhone o Morador precisa adicionar o app à tela de início (iOS 16.4 ou mais novo) antes de ativar a notificação.

## Consequências

- O Manual precisa de uma página para o Morador: instalar o app na tela de início e ativar a notificação, no iPhone e no Android.
- O Morador vê no app as Encomendas pendentes da própria Unidade e o Código de retirada. O Porteiro continua sem ver o código.
- Todo Morador da Unidade com conta e notificação ativa recebe o Aviso, não só o Titular.
