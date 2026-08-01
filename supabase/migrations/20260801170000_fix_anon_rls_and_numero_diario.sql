/*
# Corrige RLS de anon (pedido do site quebrado) + numeração de pedido diária

## Problema 1 — checkout do site não salva nada
Testado direto na API: INSERT como `anon` em pedidos, clientes, itens_pedido
e caixa retorna 401 "new row violates row-level security policy". As
migrations anteriores (20260713174732, 20260720170000) já criavam essas
políticas de INSERT para anon, mas o banco em produção não reflete isso —
por algum motivo essas policies não existem mais (ou nunca foram criadas)
ali. Resultado: cliente faz pedido pelo site, a tela mostra "Pedido
Recebido!" (Cliente.tsx não checava erro dos inserts), mas nada é salvo —
nem o pedido, nem os itens, nem o caixa.

Corrige recriando (DROP + CREATE, idempotente) as políticas de INSERT.

## Problema 2 — numeração deve resetar por dia
O número do pedido (#1, #2...) vem de uma sequence global que nunca reseta.
A dona quer que a numeração exibida recomece em 1 a cada dia (como comanda
de balcão), mas sem perder a contagem de pedidos por mês — isso já é
possível contando linhas de `pedidos` por período (created_at), não depende
do número. Substitui `get_next_pedido_numero()` por um contador por dia
(tabela pedido_numero_diario) e atualiza fechar_mesa() pra usar a mesma
função em vez de puxar a sequence antiga direto (senão os números do
fechamento de mesa continuariam globais, colidindo com os do dia).
*/

-- ===== Problema 1: recria INSERT para anon nas 4 tabelas do checkout =====
DROP POLICY IF EXISTS "anon_insert_pedidos" ON pedidos;
CREATE POLICY "anon_insert_pedidos" ON pedidos FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_clientes" ON clientes;
CREATE POLICY "anon_insert_clientes" ON clientes FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_itens" ON itens_pedido;
CREATE POLICY "anon_insert_itens" ON itens_pedido FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_caixa" ON caixa;
CREATE POLICY "anon_insert_caixa" ON caixa FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ===== Problema 2: numeração diária =====
CREATE TABLE IF NOT EXISTS pedido_numero_diario (
  dia date PRIMARY KEY,
  ultimo_numero int NOT NULL DEFAULT 0
);
ALTER TABLE pedido_numero_diario ENABLE ROW LEVEL SECURITY;
-- Sem policies de propósito: só a função SECURITY DEFINER abaixo toca essa tabela.

CREATE OR REPLACE FUNCTION get_next_pedido_numero()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num int;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  INSERT INTO pedido_numero_diario (dia, ultimo_numero) VALUES (hoje, 1)
  ON CONFLICT (dia) DO UPDATE SET ultimo_numero = pedido_numero_diario.ultimo_numero + 1
  RETURNING ultimo_numero INTO next_num;
  RETURN next_num;
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_pedido_numero() TO anon, authenticated;

-- fechar_mesa puxava a sequence antiga direto — troca pra usar a mesma
-- numeração diária, senão os pedidos de fechamento de mesa ficam com uma
-- numeração paralela que nunca reseta.
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
  v_numero := get_next_pedido_numero();

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
