/*
# ESSENZA — Correção de vazamento de dados (RLS)

## Problema
As políticas originais deixavam `clientes`, `pedidos` e `itens_pedido` com
SELECT liberado para `anon` (a chave pública embutida no site). Isso permitia
que qualquer pessoa, sem login, lesse nome/telefone/endereço de TODOS os
clientes e o histórico completo de pedidos direto pela API do Supabase —
risco de vazamento de dados (LGPD) e de espionagem comercial (faturamento,
receitas de negócio).

`mesas`/`itens_mesa` também estavam liberadas para `anon`, apesar de só
serem usadas dentro do painel administrativo (sempre autenticado).

## Correção
- `clientes`, `pedidos`, `itens_pedido`: SELECT passa a ser SOMENTE para
  `authenticated` (equipe logada no painel). `anon` continua podendo
  INSERIR (necessário para o checkout do cliente e o robô de WhatsApp
  lançarem pedidos sem login), só não pode mais LER a lista inteira.
- `caixa`: mantém leitura só para `authenticated`; passa a aceitar INSERT
  de `anon` também (o robô de WhatsApp grava a entrada financeira do pedido
  com a chave pública e essa permissão estava faltando).
- `mesas`, `itens_mesa`: passam a ser 100% `authenticated` (uso exclusivo
  do painel administrativo, não há fluxo público).
- Duas funções SECURITY DEFINER substituem as leituras públicas que ainda
  são legítimas, sem reabrir a tabela inteira:
  - `get_active_pedidos_count()` — só o número de pedidos em preparo, para
    o cálculo do tempo de espera exibido ao cliente/IA.
  - `find_cliente_by_telefone(text)` — busca um cliente específico pelo
    telefone exato (evita duplicar cadastro), sem listar todos os clientes.
*/

-- ===== CLIENTES: remove leitura pública, mantém só para equipe logada =====
DROP POLICY IF EXISTS "anon_read_clientes" ON clientes;
DROP POLICY IF EXISTS "auth_read_clientes" ON clientes;
CREATE POLICY "auth_read_clientes" ON clientes FOR SELECT TO authenticated USING (true);
-- anon_insert_clientes é mantida (checkout do cliente e robô de WhatsApp continuam cadastrando)

-- ===== PEDIDOS: remove leitura pública, mantém só para equipe logada =====
DROP POLICY IF EXISTS "anon_read_pedidos" ON pedidos;
DROP POLICY IF EXISTS "auth_read_pedidos" ON pedidos;
CREATE POLICY "auth_read_pedidos" ON pedidos FOR SELECT TO authenticated USING (true);
-- anon_insert_pedidos é mantida (checkout do cliente e robô de WhatsApp continuam lançando pedidos)

-- ===== ITENS_PEDIDO: remove leitura pública, mantém só para equipe logada =====
DROP POLICY IF EXISTS "anon_read_itens" ON itens_pedido;
DROP POLICY IF EXISTS "auth_read_itens" ON itens_pedido;
CREATE POLICY "auth_read_itens" ON itens_pedido FOR SELECT TO authenticated USING (true);
-- anon_insert_itens é mantida

-- ===== CAIXA: adiciona INSERT para anon (robô de WhatsApp grava a entrada financeira) =====
DROP POLICY IF EXISTS "auth_insert_caixa" ON caixa;
DROP POLICY IF EXISTS "anon_insert_caixa" ON caixa;
CREATE POLICY "anon_insert_caixa" ON caixa FOR INSERT TO anon, authenticated WITH CHECK (true);
-- auth_read_caixa (SELECT só para authenticated) já existia e continua assim

-- ===== MESAS / ITENS_MESA: uso exclusivo do painel — remove acesso público =====
DROP POLICY IF EXISTS "anon_all_mesas" ON mesas;
DROP POLICY IF EXISTS "auth_all_mesas" ON mesas;
CREATE POLICY "auth_all_mesas" ON mesas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_itens_mesa" ON itens_mesa;
DROP POLICY IF EXISTS "auth_all_itens_mesa" ON itens_mesa;
CREATE POLICY "auth_all_itens_mesa" ON itens_mesa FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== RPC: contagem de pedidos ativos (substitui a leitura pública de `pedidos`) =====
CREATE OR REPLACE FUNCTION get_active_pedidos_count()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM pedidos
  WHERE status IN ('recebido', 'preparo', 'forno', 'saiu');
$$;
GRANT EXECUTE ON FUNCTION get_active_pedidos_count() TO anon, authenticated;

-- ===== RPC: busca cliente por telefone exato (substitui a leitura pública de `clientes`) =====
CREATE OR REPLACE FUNCTION find_cliente_by_telefone(p_telefone text)
RETURNS TABLE (
  id uuid,
  nome text,
  telefone text,
  endereco text,
  bairro text,
  cep text,
  referencia text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nome, telefone, endereco, bairro, cep, referencia
  FROM clientes
  WHERE telefone = p_telefone
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION find_cliente_by_telefone(text) TO anon, authenticated;
