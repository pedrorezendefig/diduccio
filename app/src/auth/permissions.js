// permissions.js
export const ROLES = {
  PORTEIRO: "Porteiro",
  SINDICO: "Sindico",
  AUX: "Auxiliar Administrativo",
  DEV: "Desenvolvedor",
  CONSELHEIRO: "Conselheiro",
};

export const can = (user, action) => {
  const rules = {
    verDashboard: [
      ROLES.PORTEIRO,
      ROLES.SINDICO,
      ROLES.AUX,
      ROLES.DEV,
      ROLES.CONSELHEIRO,
    ],
    verDetalhesFesta: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
    verDetalhesChurrasqueira: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
    verDetalhesMudanca: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

    // Na portaria, o porteiro registra a visita do entregador e a encerra —
    // nada além. Editar o cadastro ou apagar uma chegada é da administração.
    //
    // Isto governa só o que APARECE na tela. Quem nega de verdade é o banco: o
    // 0026 tirou o UPDATE do porteiro em `entregadores` e pôs um gatilho em
    // `entregadores_chegadas` que recusa qualquer alteração fora do horário de
    // saída. Esconder botão não protege nada sozinho — com o próprio token, a
    // pessoa chama a API pelo DevTools.
    // O histórico da portaria: todas as entradas e saídas, com filtro por dia.
    //
    // O porteiro passou a ver: é ele quem responde "esse hóspede já saiu?" e
    // "quem veio ontem no 305?". Vê com o CPF coberto (`verCpfNoHistorico`) —
    // e isso é só de TELA: o 0015 lhe dá SELECT em `entregadores_chegadas`, e
    // com o próprio token ele lê o número inteiro pela API. Cobrir o CPF tira o
    // dado do caminho, não o tranca.
    verHistoricoPortaria: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
    verCpfNoHistorico: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

    // Vagas e TAGs. As quatro listas abaixo são as do BANCO, não uma escolha
    // de tela — cada uma casa com uma política do 0015 ou do 0037. Botão que
    // aparece sem o banco por trás vira erro de RLS na cara de quem clicou.
    //
    // O porteiro entra aqui pelo 0037 e só até um ponto: ele VÊ a vaga — de
    // quem é, que placa mora nela — e CORRIGE a TAG. Não cria vaga, não edita
    // vaga, não cria TAG. Cadastro é da administração.
    editarVaga: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
    editarTag: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

    // O porteiro PEDE a TAG: ele cria a linha, e ela nasce "Solicitado".
    // Quem decide o status é a administração, e essa separação é do banco —
    // o 0038 recusa o insert com outro status e tem um gatilho que impede o
    // porteiro de mudar o status depois. As duas chaves abaixo só fazem a
    // tela contar a mesma história.
    criarTag: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
    definirStatusTag: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

    // Apagar é o único que não inclui o auxiliar, e não é descuido: DELETE em
    // `vagas` e `tags` é `eh_sindico()` desde o 0015, e `eh_sindico()` não
    // alcança o auxiliar. O botão que ele via ali nunca funcionou — dava erro
    // de RLS traduzido em "você não tem permissão". Agora ele não aparece.
    excluirVaga: [ROLES.SINDICO, ROLES.DEV],

    editarEntregador: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
    excluirEntregador: [ROLES.SINDICO, ROLES.DEV],
    excluirChegada: [ROLES.SINDICO, ROLES.DEV],

    // Encomenda: corrigir e apagar o cadastro.
    //
    // Os dois ficam no mesmo grupo porque editar já implica apagar: reduzir a
    // quantidade de volumes remove notas fiscais, e DELETE em `entregas_nf` é
    // do síndico (0015). Abrir a edição ao auxiliar daria um botão que funciona
    // até a hora em que ele tira um item, e falha ali — pior que não ter.
    //
    // O dev entra porque `eh_dev()` está dentro de `eh_sindico()` no banco.
    editarEncomenda: [ROLES.SINDICO, ROLES.DEV],
    excluirEncomenda: [ROLES.SINDICO, ROLES.DEV],

    // Ler na tela o codigo de retirada que o morador recebeu no WhatsApp.
    //
    // O porteiro fica de fora, e nao por desconfianca: o codigo e a unica coisa
    // que a retirada exige que so o morador tem. Quem da a baixa lendo o codigo
    // na propria tela nao confere nada — assina um comprovante que afirma uma
    // conferencia que nao houve. Auxiliar tambem registra retirada (0027), pelo
    // mesmo motivo fica de fora.
    //
    // Sindico e dev veem porque sao a saida para o morador que perdeu o codigo:
    // sem isso a encomenda notificada trava e ninguem no condominio consegue
    // destravar. E o mesmo grupo que ja pode apagar o cadastro inteiro.
    //
    // Isto governa so o que APARECE. O codigo continua vindo do banco em
    // `entregas`, que o porteiro le — esconder na tela nao e cofre, e o
    // controle real de quem retira e a assinatura.
    verCodigoRetirada: [ROLES.SINDICO, ROLES.DEV],

    // O quadro de tarefas da administração. Ver serve também para criar e
    // mover: são os mesmos cargos.
    //
    // Desde o 0045 o quadro não é mais um só: o síndico e o dev veem todas as
    // tarefas (`verTodasTarefas`); o auxiliar, só as que têm ele como
    // responsável — e apaga as dele. Quem recorta de verdade é o banco; estas
    // chaves só fazem a tela contar a mesma história (sem filtro "Minhas" e sem
    // oferecer outro responsável a quem só vê as próprias).
    verTarefas:      [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
    verTodasTarefas: [ROLES.SINDICO, ROLES.DEV],
    excluirTarefa:   [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  };

  // Garante que não quebre se o cargo não existir ou a action for inválida
  return rules[action]?.includes(user?.cargo) ?? false;
};