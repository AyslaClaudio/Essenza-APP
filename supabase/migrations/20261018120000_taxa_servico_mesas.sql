-- Mantém o fechamento antigo disponível para terminais ainda não atualizados.
BEGIN;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS taxa_servico numeric(10,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fechar_mesa(
  p_mesa_id uuid, p_forma_pagamento text, p_cobrar_servico boolean
)
RETURNS TABLE(pedido_id uuid, numero int, total numeric, taxa_servico numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fechamento record;
  v_servico numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário entrar no sistema para fechar a mesa';
  END IF;

  -- A função existente fecha a mesa; qualquer falha abaixo reverte tudo.
  SELECT * INTO STRICT v_fechamento
  FROM public.fechar_mesa(p_mesa_id, p_forma_pagamento);
  v_servico := CASE WHEN p_cobrar_servico IS TRUE
    THEN round(v_fechamento.total * 0.10, 2) ELSE 0 END;

  UPDATE public.pedidos p
  SET taxa_servico = v_servico, total = v_fechamento.total + v_servico
  WHERE p.id = v_fechamento.pedido_id;
  -- Serviço é registrado separadamente, sem aumentar o lucro dos produtos.
  UPDATE public.caixa c SET valor = v_fechamento.total + v_servico
  WHERE c.pedido_id = v_fechamento.pedido_id AND c.tipo = 'entrada';

  RETURN QUERY SELECT v_fechamento.pedido_id, v_fechamento.numero,
    v_fechamento.total + v_servico, v_servico;
END;
$$;
REVOKE ALL ON FUNCTION public.fechar_mesa(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_mesa(uuid, text, boolean) TO authenticated;
COMMIT;
