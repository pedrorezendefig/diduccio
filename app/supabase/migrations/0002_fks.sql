-- Integridade verificada em 2026-08-05: zero órfãos nas 7 tabelas.
ALTER TABLE public.moradores      ADD CONSTRAINT fk_moradores_unidade      FOREIGN KEY (id_unidade) REFERENCES public.unidades(id);
ALTER TABLE public.vagas          ADD CONSTRAINT fk_vagas_unidade          FOREIGN KEY (id_unidade) REFERENCES public.unidades(id);
ALTER TABLE public.piscina        ADD CONSTRAINT fk_piscina_unidade        FOREIGN KEY (id_unidade) REFERENCES public.unidades(id);
ALTER TABLE public.mudancas       ADD CONSTRAINT fk_mudancas_unidade       FOREIGN KEY (id_unidade) REFERENCES public.unidades(id);
ALTER TABLE public.confirmacao    ADD CONSTRAINT fk_confirmacao_unidade    FOREIGN KEY (id_unidade) REFERENCES public.unidades(id);
ALTER TABLE public.churrasqueira  ADD CONSTRAINT fk_churrasqueira_unidade  FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);
ALTER TABLE public.festas         ADD CONSTRAINT fk_festas_unidade         FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);

-- piscina.id_morador NÃO ganha FK: 203 de 204 linhas contêm o texto "AVULSO".
-- mudancas.id_morador NÃO ganha FK: coluna inteiramente vazia na origem.
