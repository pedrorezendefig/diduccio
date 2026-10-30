-- A portaria deixa de ser só de entregador.
--
-- A mesma tela passa a registrar quem entra por qualquer motivo: entregador de
-- aplicativo, motorista de app, visitante de morador, hóspede de temporada e
-- prestador de serviço com veículo. O que muda entre eles é quanto tempo se
-- espera que fiquem, e se há uma empresa por trás.
--
-- OS NOMES DAS TABELAS FICAM COMO ESTÃO. `entregadores` guarda hoje quem
-- entra, e `entregadores_chegadas`, as entradas. Renomear obrigaria a mexer no
-- backend falso, nos scripts de verificação e nas políticas do 0015, sem trocar
-- uma linha de comportamento. O nome ficou velho; trocá-lo é risco sem prêmio.

-- ---------------------------------------------------------------------------
-- O cadastro de quem entra
-- ---------------------------------------------------------------------------
-- Guardava só CPF e nome. Agora guarda também o veículo da última vez, porque é
-- disso que a tela precisa para preencher sozinha na próxima entrada — e para
-- perguntar se continua sendo o mesmo carro.
alter table public.entregadores
  add column if not exists veiculo text,
  add column if not exists placa   text,
  add column if not exists tipo    text,
  add column if not exists empresa text;

-- O CPF é a chave pela qual a tela reconhece quem já esteve aqui. Sem esta
-- restrição, dois cadastros do mesmo CPF fazem a busca devolver um deles ao
-- acaso — e o porteiro vê o veículo errado sugerido, que é pior que campo em
-- branco.
create unique index if not exists uniq_entregadores_cpf on public.entregadores (cpf);

-- ---------------------------------------------------------------------------
-- A entrada
-- ---------------------------------------------------------------------------
alter table public.entregadores_chegadas
  add column if not exists tipo    text not null default 'ENTREGADOR',
  add column if not exists empresa text,
  -- Nulo significa SEM LIMITE, e é o caso de quem fica: hóspede de temporada e
  -- prestador de serviço. Zero significaria "quinze segundos", e um número
  -- grande fingido — 4320 para três dias — encheria a tela de contagem que
  -- ninguém vai olhar.
  add column if not exists minutos_permitidos int;

-- `add constraint` não é idempotente: rodar de novo estouraria. Derruba antes.
alter table public.entregadores_chegadas
  drop constraint if exists chegadas_tipo_valido;
alter table public.entregadores_chegadas
  add constraint chegadas_tipo_valido
  check (tipo in ('ENTREGADOR', 'MOTORISTA_APP', 'VISITANTE', 'AIRBNB', 'SERVICO'));

-- O piso é o passo do botão. Um valor abaixo dele só chega aqui por defeito de
-- tela, e vale barrar: entrada com "0 minuto permitido" é registro que mente.
alter table public.entregadores_chegadas
  drop constraint if exists chegadas_minutos_sensatos;
alter table public.entregadores_chegadas
  add constraint chegadas_minutos_sensatos
  check (minutos_permitidos is null or minutos_permitidos >= 5);

-- QUAL TIPO TEM PRAZO fica na tela, e não aqui, de propósito. É regra de
-- operação da portaria — o síndico pode decidir amanhã que visitante também
-- entra sem prazo —, e presa num `check` isso viraria migração. O que o banco
-- protege é o que corrompe o registro: tipo inventado e prazo absurdo.

-- A consulta que a tela faz o tempo todo é "quem está dentro agora".
create index if not exists idx_chegadas_dentro
  on public.entregadores_chegadas (horario_entrada desc)
  where horario_saida is null;

create index if not exists idx_chegadas_tipo on public.entregadores_chegadas (tipo);
