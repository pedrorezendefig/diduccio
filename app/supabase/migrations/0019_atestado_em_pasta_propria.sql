-- Atestado médico ganha pasta própria: `piscina-atestados/`.
--
-- Hoje a regra é a MESMA de `piscina/` — administrativo lê e escreve, ninguém
-- mais. O ramo explícito no CASE não muda comportamento nenhum: o `else` já
-- cobria. Ele existe para marcar a costura.
--
-- O porquê: a permissão do bucket é decidida pela primeira pasta do caminho
-- (`modulo_do_anexo`). Com foto e atestado no mesmo `piscina/`, os dois ficam
-- presos à mesma regra para sempre. Separados, o dia em que o atestado precisar
-- ser mais fechado que a foto — e ele é dado de saúde, então esse dia é
-- provável — é uma linha aqui. Juntos, seria mover 193 arquivos.
--
-- Separar depois custa caro; separar agora, enquanto a pasta está vazia, é de
-- graça. Por isso vem antes da migração dos arquivos do Drive, e não depois.

create or replace function public.pode_ler_anexo(nome text)
returns boolean language sql stable
set search_path = public as $$
  select case public.modulo_do_anexo(nome)
    when 'encomendas'        then public.eh_administrativo() or public.eh_porteiro()
    when 'assembleias'       then public.eh_administrativo() or public.eh_conselheiro()
    -- Dado de saúde. Hoje igual ao resto; é aqui que se aperta quando precisar.
    when 'piscina-atestados' then public.eh_administrativo()
    else public.eh_administrativo()
  end;
$$;

create or replace function public.pode_escrever_anexo(nome text)
returns boolean language sql stable
set search_path = public as $$
  select case public.modulo_do_anexo(nome)
    when 'encomendas'        then public.eh_administrativo() or public.eh_porteiro()
    when 'piscina-atestados' then public.eh_administrativo()
    else public.eh_administrativo()
  end;
$$;

-- `create or replace` mantém os grants, mas repetimos porque um replace que
-- mude a assinatura recriaria a função com o EXECUTE aberto a PUBLIC — que
-- inclui `anon`. Barato de garantir, caro de descobrir depois.
revoke execute on function public.pode_ler_anexo(text)      from public;
revoke execute on function public.pode_escrever_anexo(text) from public;
grant  execute on function public.pode_ler_anexo(text)      to authenticated;
grant  execute on function public.pode_escrever_anexo(text) to authenticated;
