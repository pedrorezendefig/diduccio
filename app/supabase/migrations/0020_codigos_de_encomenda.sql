-- O código de retirada e o número da encomenda passam a nascer no banco.
--
-- No Apps Script eles nasciam no servidor: a planilha lia a coluna inteira,
-- sorteava até achar um valor livre e gravava. Com o backend saindo de cena,
-- havia dois destinos possíveis — o navegador do porteiro ou o Postgres. Vai
-- para o Postgres, por dois motivos:
--
-- 1. O sorteio "leia tudo, veja se está livre, grave" tem corrida. Dois
--    porteiros cadastrando ao mesmo tempo podiam receber o MESMO código, e a
--    planilha não tinha como recusar. O código de retirada é o que autoriza
--    entregar o pacote a alguém: dois pacotes com o mesmo código é entregar o
--    pacote errado para a pessoa errada, e ninguém descobriria como.
--    Aqui quem arbitra é um índice único — não uma leitura otimista.
--
-- 2. Gerado na tela, o código seria escolhido pelo cliente. Hoje o porteiro é
--    quem cadastra, então não é um poder novo; mas é uma porta aberta de graça,
--    e fechá-la custa este arquivo.
--
-- Formatos idênticos aos do Apps Script, de propósito: quem trabalha na
-- portaria já lê esses códigos em voz alta pelo telefone.

-- ---------------------------------------------------------------------------
-- Unicidade: a garantia de verdade
-- ---------------------------------------------------------------------------
-- Parcial (`where ... is not null and <> ''`) porque encomenda sem telefone não
-- ganha código de retirada, e um índice único comum trataria todos os vazios
-- como iguais — o segundo cadastro sem telefone seria recusado.
create unique index if not exists uq_entregas_cod
  on public.entregas (cod)
  where cod is not null and cod <> '';

create unique index if not exists uq_entregas_numero_encomenda
  on public.entregas (numero_encomenda)
  where numero_encomenda is not null and numero_encomenda <> '';

-- ---------------------------------------------------------------------------
-- Sorteio
-- ---------------------------------------------------------------------------

-- Alfabeto sem 0/O e sem 1 — são códigos ditados por telefone.
create or replace function public.sortear_cod_entrega()
returns text language sql volatile
set search_path = public as $$
  select string_agg(
    substr('ABCDEFGHIJKLMNPQRSTUVWXYZ23456789',
           floor(random() * 33 + 1)::int, 1), '')
  from generate_series(1, 5);
$$;

-- 4 dígitos + 1 letra (sem I/O), ex.: "2128K". Vai para o livro da portaria.
create or replace function public.sortear_numero_encomenda()
returns text language sql volatile
set search_path = public as $$
  select (floor(random() * 9000) + 1000)::int::text
      || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 24 + 1)::int, 1);
$$;

-- ---------------------------------------------------------------------------
-- Preenchimento automático
-- ---------------------------------------------------------------------------
-- Roda antes de inserir e só preenche o que veio vazio. O laço evita a colisão
-- previsível (valor já usado); o índice único acima cobre a colisão simultânea,
-- que nenhum laço consegue evitar sozinho — nesse caso o insert falha e a tela
-- tenta de novo, com valores novos.
create or replace function public.preencher_codigos_entrega()
returns trigger language plpgsql
set search_path = public as $$
declare
  tentativa int;
  candidato text;
begin
  -- Código de retirada só existe quando há telefone: sem número não há
  -- WhatsApp para mandar, e o combinado da portaria é anotar no livro.
  if (new.cod is null or new.cod = '')
     and new.telefone is not null and btrim(new.telefone) <> '' then
    for tentativa in 1..20 loop
      candidato := public.sortear_cod_entrega();
      exit when not exists (select 1 from public.entregas where cod = candidato);
    end loop;
    new.cod := candidato;
  end if;

  if new.numero_encomenda is null or new.numero_encomenda = '' then
    for tentativa in 1..20 loop
      candidato := public.sortear_numero_encomenda();
      exit when not exists (select 1 from public.entregas where numero_encomenda = candidato);
    end loop;
    new.numero_encomenda := candidato;
  end if;

  return new;
end $$;

drop trigger if exists trg_entregas_codigos on public.entregas;
create trigger trg_entregas_codigos
  before insert on public.entregas
  for each row execute function public.preencher_codigos_entrega();

-- O EXECUTE nasce aberto a PUBLIC, e PUBLIC inclui `anon` — o visitante não
-- autenticado. Nenhuma destas devolve dado de ninguém, mas sortear códigos à
-- vontade permite mapear o espaço, e o `exists` do gatilho diria quais já estão
-- em uso. Fecha-se para PUBLIC.
--
-- E devolve-se explicitamente para `authenticated`: as funções de sorteio são
-- chamadas de dentro do gatilho, na sessão de quem está inserindo, e aí o
-- EXECUTE é conferido em tempo de execução. Revogar sem devolver deixaria o
-- porteiro sem conseguir cadastrar encomenda — e a mensagem de erro falaria de
-- privilégio de função, não de nada que ele pudesse entender.
revoke execute on function public.sortear_cod_entrega()        from public;
revoke execute on function public.sortear_numero_encomenda()   from public;
revoke execute on function public.preencher_codigos_entrega()  from public;
grant  execute on function public.sortear_cod_entrega()        to authenticated;
grant  execute on function public.sortear_numero_encomenda()   to authenticated;
grant  execute on function public.preencher_codigos_entrega()  to authenticated;
