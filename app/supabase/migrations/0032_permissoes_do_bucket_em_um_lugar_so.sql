-- As permissões do bucket, inteiras, num lugar só.
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- `pode_ler_anexo` e `pode_escrever_anexo` foram reescritas com
-- `create or replace` em quatro migrações diferentes (0017, 0019, 0027, 0031).
-- Cada uma copiou o corpo da versão que o autor tinha em mãos e acrescentou o
-- seu ramo. O 0031 copiou o texto do 0019 — que é anterior ao 0027 — e com isso
-- APAGOU o ramo `retiradas`, sem tocar em nenhuma linha que falasse de
-- retirada.
--
-- O efeito em produção: o porteiro deixou de conseguir subir a assinatura da
-- baixa de encomenda, e a tela mostrou "row level security". Nada no 0031
-- mencionava retirada; o estrago veio de copiar uma versão velha.
--
-- `create or replace` de função compartilhada não é acréscimo: é substituição
-- total. Partir da versão errada apaga o trabalho de quem veio no meio.
--
-- Daqui em diante existe UM arquivo com o mapa completo. Quem for acrescentar
-- uma pasta acrescenta o ramo aqui, com as outras à vista.

-- ---------------------------------------------------------------------------
-- Ler
-- ---------------------------------------------------------------------------
create or replace function public.pode_ler_anexo(nome text)
returns boolean language sql stable
set search_path = public as $$
  select case public.modulo_do_anexo(nome)
    -- Etiqueta e nota fiscal: o porteiro trabalha nelas o dia inteiro. (0017)
    when 'encomendas'        then public.eh_administrativo() or public.eh_porteiro()
    -- Assinatura da baixa: quem colhe é o porteiro, e ele precisa reler. (0027)
    when 'retiradas'         then public.eh_administrativo() or public.eh_porteiro()
    -- Ata: o conselho fiscal lê, e não escreve em lugar nenhum. (0017)
    when 'assembleias'       then public.eh_administrativo() or public.eh_conselheiro()
    -- Dado de saúde. Hoje igual ao resto; é aqui que se aperta. (0019)
    when 'piscina-atestados' then public.eh_administrativo()
    -- Carta assinada: nome, conduta e assinatura do morador. (0031)
    when 'notificacoes'      then public.eh_administrativo()
    else public.eh_administrativo()
  end;
$$;

-- ---------------------------------------------------------------------------
-- Escrever
-- ---------------------------------------------------------------------------
create or replace function public.pode_escrever_anexo(nome text)
returns boolean language sql stable
set search_path = public as $$
  select case public.modulo_do_anexo(nome)
    when 'encomendas'        then public.eh_administrativo() or public.eh_porteiro()
    when 'retiradas'         then public.eh_administrativo() or public.eh_porteiro()
    -- O conselheiro NÃO entra aqui: lê ata e não age em lugar nenhum. (0017)
    when 'piscina-atestados' then public.eh_administrativo()
    when 'notificacoes'      then public.eh_administrativo()
    else public.eh_administrativo()
  end;
$$;

-- ---------------------------------------------------------------------------
-- Apagar
-- ---------------------------------------------------------------------------
-- O 0018 fez apagar seguir escrever, e a razão continua boa: ao TROCAR a foto
-- de um cadastro, o arquivo velho é lixo por definição — ninguém aponta para
-- ele, ele não aparece em tela nenhuma, e deixá-lo no bucket é atestado médico
-- de alguém seguindo alcançável por URL assinada.
--
-- Duas pastas fogem disso porque ali o arquivo não é versão antiga de nada: é
-- prova. A assinatura da baixa (0027) e a carta assinada da notificação. Quem
-- operou não desfaz o comprovante do que operou.
--
-- Vira função própria em vez de `case` dentro da política: assim a regra de
-- apagar é legível de fora e pode ser testada isoladamente, como as outras
-- duas.
create or replace function public.pode_apagar_anexo(nome text)
returns boolean language sql stable
set search_path = public as $$
  select case public.modulo_do_anexo(nome)
    when 'retiradas'    then public.eh_sindico()
    when 'notificacoes' then public.eh_sindico()
    -- Delegate deliberado: mudar `pode_escrever_anexo` amanhã não pode deixar
    -- esta função para trás, apontando para uma regra que já não existe.
    else public.pode_escrever_anexo(nome)
  end;
$$;

-- `create or replace` mantém os grants, mas repetimos: um replace que mude a
-- assinatura recria a função com EXECUTE aberto a PUBLIC — que inclui `anon`.
-- Barato de garantir, caro de descobrir depois.
do $$
declare f text;
begin
  foreach f in array array['pode_ler_anexo', 'pode_escrever_anexo', 'pode_apagar_anexo'] loop
    execute format('revoke execute on function public.%I(text) from public', f);
    execute format('revoke execute on function public.%I(text) from anon', f);
    execute format('grant  execute on function public.%I(text) to authenticated', f);
  end loop;
end $$;

drop policy if exists anexos_apagar on storage.objects;

create policy anexos_apagar on storage.objects
  for delete to authenticated
  using (bucket_id = 'anexos' and public.pode_apagar_anexo(name));
