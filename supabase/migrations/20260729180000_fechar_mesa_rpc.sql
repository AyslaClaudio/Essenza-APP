/*
# Fechamento de mesa atômico (RPC)

## Problema
O fechamento de mesa no cliente fazia 6 chamadas Supabase sequenciais (criar pedido,
copiar itens, lançar caixa, apagar itens_mesa, resetar mesa) sem transação: se a conexão
caísse no meio, a mesa podia ficar num estado inconsistente (ex: pedido criado mas itens
da mesa não apagados, ou caixa sem lançamento).

## Solução
Uma função Postgres (`fechar_mesa`) executa tudo dentro de uma única transação atômica —
ou tudo confirma, ou nada é alterado. Também recalcula subtotal/custo a partir dos itens
salvos no servidor (não confia em totais calculados no cliente).
*/

CREATE OR REPLACE FUNCTION fechar_mesa(p_mesa_id uuid, p_forma_pagamento text)
RETURNS TABLE(pedido_id uuid, numero int, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_numero int;
  v_subtotal numeric := 0;
  v_custo numeric := 0;
  v_lucro numeric;
  v_mesa_numero int;
  v_pedido_id uuid;
BEGIN
  SELECT m.numero INTO v_mesa_numero FROM mesas m WHERE m.id = p_mesa_id FOR UPDATE;
  IF v_mesa_numero IS NULL THEN
    RAISE EXCEPTION 'Mesa não encontrada';
  END IF;

  SELECT COALESCE(SUM(quantidade * (preco_unitario + adicional_preco)), 0),
         COALESCE(SUM(quantidade * custo_unitario), 0)
    INTO v_subtotal, v_custo
    FROM itens_mesa WHERE mesa_id = p_mesa_id;

  IF v_subtotal = 0 THEN
    RAISE EXCEPTION 'A mesa não tem itens para fechar';
  END IF;

  v_lucro := v_subtotal - v_custo;
  v_numero := nextval('pedido_numero_seq');

  INSERT INTO pedidos (
    numero, cliente_nome, cliente_telefone, cliente_endereco, cliente_bairro,
    tipo, status, subtotal, taxa_entrega, desconto, total, custo_total, lucro,
    forma_pagamento, observacao, cupom
  ) VALUES (
    v_numero, 'Mesa ' || v_mesa_numero, '', '', '',
    'mesa', 'entregue', v_subtotal, 0, 0, v_subtotal, v_custo, v_lucro,
    p_forma_pagamento, 'Fechamento da Mesa ' || v_mesa_numero, ''
  ) RETURNING id INTO v_pedido_id;

  INSERT INTO itens_pedido (
    pedido_id, produto_id, produto_nome, quantidade, preco_unitario,
    custo_unitario, observacao, sabor1, sabor2, adicional, adicional_preco
  )
  SELECT v_pedido_id, produto_id, produto_nome, quantidade, preco_unitario,
         custo_unitario, observacao, sabor1, sabor2, adicional, adicional_preco
  FROM itens_mesa WHERE mesa_id = p_mesa_id;

  INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, pedido_id, data)
  VALUES ('entrada', 'Mesa ' || v_mesa_numero || ' - Pedido #' || v_numero, v_subtotal, p_forma_pagamento, v_pedido_id, CURRENT_DATE);

  DELETE FROM itens_mesa WHERE mesa_id = p_mesa_id;

  UPDATE mesas SET status = 'livre', abertura_at = NULL, observacao = '', garcom = ''
  WHERE id = p_mesa_id;

  RETURN QUERY SELECT v_pedido_id, v_numero, v_subtotal;
END;
$$;

GRANT EXECUTE ON FUNCTION fechar_mesa(uuid, text) TO anon, authenticated;
