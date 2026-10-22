ALTER TABLE public.itens_mesa ADD COLUMN IF NOT EXISTS lancamento_id uuid;
CREATE INDEX IF NOT EXISTS itens_mesa_lancamento_idx ON public.itens_mesa(lancamento_id);
