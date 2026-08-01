/*
# RPC atômica pro checkout do site do cliente

## Causa raiz do bug (achada testando direto no banco)
Não era a policy de INSERT (essa sempre esteve correta, `WITH CHECK (true)`
pra anon). O problema é `supabase.from('pedidos').insert(x).select()` —
o `.select()` faz o Postgres tentar devolver a linha inserida
(`RETURNING`), e como `anon` não pode LER pedidos (correto, por
privacidade — ver 20260720170000_fix_rls_data_leak), o Postgres recusa a
transação INTEIRA com "new row violates row-level security policy",
mesmo o INSERT em si sendo permitido. Testado isolado: INSERT sem
RETURNING funciona; com RETURNING falha e desfaz tudo. Isso explica por
que pedido nenhum do site estava sendo salvo (nem o pedido, nem itens,
nem caixa) e a tela mostrava "Pedido Recebido!" mesmo assim (Cliente.tsx
não checava erro).

## Solução
Uma função SECURITY DEFINER faz cliente + pedido + itens + caixa numa
transação só (mesmo padrão de fechar_mesa) e devolve só id/numero pela
RETURN QUERY da função — isso não passa pela RLS de SELECT da tabela
pedidos, então funciona pra anon. Client-side (Cliente.tsx) passa a
chamar só essa RPC em vez de 3 inserts separados.
*/

CREATE OR REPLACE FUNCTION criar_pedido_cliente(
  p_cliente_nome text,
  p_cliente_telefone text,
  p_cliente_endereco text,
  p_cliente_bairro text,
  p_taxa_entrega numeric,
  p_forma_pagamento text,
  p_observacao text,
  p_itens jsonb
) RETURNS TABLE(pedido_id uuid, numero int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_numero int;
  v_cliente_id uuid;
  v_pedido_id uuid;
  v_subtotal numeric := 0;
  v_custo numeric := 0;
  v_total numeric;
BEGIN
  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens';
  END IF;

  INSERT INTO clientes (nome, telefone, endereco, bairro)
  VALUES (p_cliente_nome, p_cliente_telefone, p_cliente_endereco, p_cliente_bairro)
  RETURNING id INTO v_cliente_id;

  SELECT
    COALESCE(SUM((i->>'quantidade')::int * ((i->>'preco_unitario')::numeric + COALESCE((i->>'adicional_preco')::numeric, 0))), 0),
    COALESCE(SUM((i->>'quantidade')::int * (i->>'custo_unitario')::numeric), 0)
  INTO v_subtotal, v_custo
  FROM jsonb_array_elements(p_itens) i;

  v_total := v_subtotal + p_taxa_entrega;
  v_numero := get_next_pedido_numero();

  INSERT INTO pedidos (
    numero, cliente_id, cliente_nome, cliente_telefone, cliente_endereco, cliente_bairro,
    tipo, status, subtotal, taxa_entrega, desconto, total, custo_total, lucro,
    forma_pagamento, observacao, cupom
  ) VALUES (
    v_numero, v_cliente_id, p_cliente_nome, p_cliente_telefone, p_cliente_endereco, p_cliente_bairro,
    'cliente', 'confirmado', v_subtotal, p_taxa_entrega, 0, v_total, v_custo, v_subtotal - v_custo,
    p_forma_pagamento, p_observacao, ''
  ) RETURNING id INTO v_pedido_id;

  INSERT INTO itens_pedido (
    pedido_id, produto_id, produto_nome, quantidade, preco_unitario,
    custo_unitario, observacao, sabor1, sabor2, adicional, adicional_preco
  )
  SELECT
    v_pedido_id,
    (i->>'produto_id')::uuid,
    i->>'produto_nome',
    (i->>'quantidade')::int,
    (i->>'preco_unitario')::numeric,
    (i->>'custo_unitario')::numeric,
    COALESCE(i->>'observacao', ''),
    COALESCE(i->>'sabor1', ''),
    COALESCE(i->>'sabor2', ''),
    COALESCE(i->>'adicional', ''),
    COALESCE((i->>'adicional_preco')::numeric, 0)
  FROM jsonb_array_elements(p_itens) i;

  INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, pedido_id, data)
  VALUES ('entrada', 'Pedido #' || v_numero || ' - ' || p_cliente_nome, v_total, p_forma_pagamento, v_pedido_id, CURRENT_DATE);

  RETURN QUERY SELECT v_pedido_id, v_numero;
END;
$$;

GRANT EXECUTE ON FUNCTION criar_pedido_cliente(text, text, text, text, numeric, text, text, jsonb) TO anon, authenticated;
