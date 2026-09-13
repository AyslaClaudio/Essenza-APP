/*
# Corrige o cálculo de "lucro" pra incluir a taxa de entrega

## Causa raiz do bug (Relatórios: Lucro Bruto não batia com Faturamento - Custo)
Em dois lugares o `lucro` gravado no pedido era calculado como
`subtotal - custo_total`, ignorando a taxa de entrega:

  - `criar_pedido_cliente()` (checkout do site do cliente), linha do INSERT
    em `pedidos`: `v_subtotal - v_custo`.
  - `Balcao.tsx` (checkout do balcão/PDV), no código da aplicação — já
    corrigido separadamente nesse arquivo.

Só que `total` (usado como Faturamento em todo o app) é
`subtotal + taxa_entrega`. Então, pra pedidos de delivery, a taxa de
entrega entrava no Faturamento mas nunca em lugar nenhum do Lucro — o
dinheiro da taxa "sumia" da conta. Isso fazia:

  - Financeiro > Relatórios: "Lucro Bruto" (soma de `pedidos.lucro`) ficar
    menor que "Faturamento - Custo dos Produtos" exatamente pela soma das
    taxas de entrega do período.
  - Dashboard: mesmo efeito na margem de lucro exibida.

`fechar_mesa()` não tem esse problema (taxa_entrega sempre 0 pra mesa).

## Solução
1. Recria `criar_pedido_cliente()` calculando `lucro` a partir de
   `v_total` (que já inclui a taxa de entrega), não de `v_subtotal`.
2. Corrige os pedidos já gravados no banco com a fórmula antiga, recalculando
   `lucro = total - custo_total` — mesma fórmula, aplicada retroativamente.
   Só afeta pedidos com taxa_entrega > 0 (delivery); balcão/mesa não mudam,
   porque taxa_entrega é 0 e a fórmula dá o mesmo resultado.
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
    'cliente', 'confirmado', v_subtotal, p_taxa_entrega, 0, v_total, v_custo, v_total - v_custo,
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

-- Recalcula o histórico: só mexe em pedidos onde a fórmula antiga (sem
-- taxa_entrega) deixou o lucro gravado errado.
UPDATE pedidos
SET lucro = total - custo_total
WHERE taxa_entrega > 0
  AND lucro IS DISTINCT FROM (total - custo_total);
