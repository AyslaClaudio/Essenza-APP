-- Permite receber qualquer pedido em várias partes sem duplicar a venda.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pedido_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  identificacao text NOT NULL DEFAULT '',
  forma_pagamento text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL CHECK (valor > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedido_pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_pedido_pagamentos" ON public.pedido_pagamentos;
CREATE POLICY "auth_read_pedido_pagamentos" ON public.pedido_pagamentos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_pedido_pagamentos" ON public.pedido_pagamentos;
CREATE POLICY "auth_insert_pedido_pagamentos" ON public.pedido_pagamentos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_pedido_pagamentos" ON public.pedido_pagamentos;
CREATE POLICY "auth_delete_pedido_pagamentos" ON public.pedido_pagamentos FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.registrar_pagamentos_pedido(p_pedido_id uuid, p_pagamentos jsonb)
RETURNS TABLE(total numeric, forma_pagamento text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total numeric(10,2);
  v_soma numeric(10,2);
  v_forma text;
  v_parte jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário entrar no sistema para registrar pagamentos';
  END IF;

  SELECT p.total INTO STRICT v_total FROM public.pedidos p WHERE p.id = p_pedido_id;
  IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos uma forma de pagamento';
  END IF;

  SELECT round(COALESCE(sum((parte->>'valor')::numeric), 0), 2)
    INTO v_soma
  FROM jsonb_array_elements(p_pagamentos) AS parte;

  IF abs(v_soma - v_total) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pagamentos (%) precisa ser igual ao total (%)', v_soma, v_total;
  END IF;

  FOREACH v_parte IN ARRAY ARRAY(SELECT jsonb_array_elements(p_pagamentos)) LOOP
    IF COALESCE(trim(v_parte->>'forma_pagamento'), '') = '' OR (v_parte->>'valor')::numeric <= 0 THEN
      RAISE EXCEPTION 'Cada pagamento precisa ter forma e valor maior que zero';
    END IF;
  END LOOP;

  DELETE FROM public.pedido_pagamentos WHERE pedido_id = p_pedido_id;
  DELETE FROM public.caixa WHERE pedido_id = p_pedido_id AND tipo = 'entrada';

  INSERT INTO public.pedido_pagamentos (pedido_id, identificacao, forma_pagamento, valor)
  SELECT p_pedido_id,
    COALESCE(NULLIF(trim(parte->>'identificacao'), ''), 'Pagamento'),
    trim(parte->>'forma_pagamento'),
    round((parte->>'valor')::numeric, 2)
  FROM jsonb_array_elements(p_pagamentos) AS parte;

  INSERT INTO public.caixa (tipo, descricao, valor, forma_pagamento, pedido_id, data)
  SELECT 'entrada', 'Pedido #' || p.numero || ' - ' || COALESCE(NULLIF(trim(parte->>'identificacao'), ''), 'Pagamento'),
    round((parte->>'valor')::numeric, 2), trim(parte->>'forma_pagamento'), p.id, CURRENT_DATE
  FROM public.pedidos p, jsonb_array_elements(p_pagamentos) AS parte
  WHERE p.id = p_pedido_id;

  SELECT CASE WHEN count(*) = 1 THEN max(pp.forma_pagamento) ELSE 'Dividido' END
    INTO v_forma FROM public.pedido_pagamentos pp WHERE pp.pedido_id = p_pedido_id;
  UPDATE public.pedidos SET forma_pagamento = v_forma, updated_at = now() WHERE id = p_pedido_id;
  RETURN QUERY SELECT v_total, v_forma;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamentos_pedido(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamentos_pedido(uuid, jsonb) TO authenticated;
COMMIT;
