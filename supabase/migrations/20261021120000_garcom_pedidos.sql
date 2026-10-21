-- Registra quem lançou e quem fechou cada conta para prestação de contas.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS garcom_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS garcom_nome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fechado_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fechado_por_nome text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS pedidos_garcom_id_idx ON public.pedidos(garcom_id);
