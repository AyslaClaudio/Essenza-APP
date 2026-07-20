/*
# ESSENZA Pizzeria POS — Core Schema

## Overview
Creates the complete database schema for the ESSENZA pizzeria management system.
Single-tenant restaurant app: staff log in (Atendente/Caixa/Gerente), customers access menu without login.

## Tables created
1. `usuarios` — Staff profiles linked to auth.users, with role (atendente/caixa/gerente)
2. `produtos` — Products with category, cost, price, photo, active flag
3. `categorias` — Product categories
4. `adicionais` — Add-ons/borders
5. `ingredientes` — Ingredients with cost per kg/l and stock
6. `ficha_tecnica` — Links ingredients to products
7. `clientes` — Customer registry
8. `pedidos` — Orders with status, payment, totals
9. `itens_pedido` — Order line items
10. `caixa` — Cash register entries
11. `configuracoes` — Store settings
12. `impressoras` — Printer config (80mm, kitchen/cash/delivery)
13. `taxa_entrega` — Delivery fees by bairro/CEP
14. `promocoes` — Promotions/combos
15. `metas` — Daily revenue goals
16. `avaliacoes` — Customer ratings

## Security
- RLS enabled on ALL tables.
- Customer-facing tables: TO anon, authenticated (read catalog, place orders without login).
- Internal tables: TO authenticated only (staff must be logged in).
*/

-- ===== CATEGORIAS =====
CREATE TABLE IF NOT EXISTS categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ordem int DEFAULT 0,
  base_custo numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_categorias" ON categorias;
CREATE POLICY "anon_read_categorias" ON categorias FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_categorias" ON categorias;
CREATE POLICY "auth_insert_categorias" ON categorias FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_categorias" ON categorias;
CREATE POLICY "auth_update_categorias" ON categorias FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_categorias" ON categorias;
CREATE POLICY "auth_delete_categorias" ON categorias FOR DELETE TO authenticated USING (true);

-- ===== PRODUTOS =====
CREATE TABLE IF NOT EXISTS produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria_id uuid REFERENCES categorias(id) ON DELETE SET NULL,
  categoria_nome text NOT NULL DEFAULT '',
  custo numeric(10,2) NOT NULL DEFAULT 0,
  preco numeric(10,2) NOT NULL DEFAULT 0,
  foto text,
  ativo boolean DEFAULT true,
  destaque boolean DEFAULT false,
  tamanho text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_produtos" ON produtos;
CREATE POLICY "anon_read_produtos" ON produtos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_produtos" ON produtos;
CREATE POLICY "auth_insert_produtos" ON produtos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_produtos" ON produtos;
CREATE POLICY "auth_update_produtos" ON produtos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_produtos" ON produtos;
CREATE POLICY "auth_delete_produtos" ON produtos FOR DELETE TO authenticated USING (true);

-- ===== ADICIONAIS =====
CREATE TABLE IF NOT EXISTS adicionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  preco numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE adicionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_adicionais" ON adicionais;
CREATE POLICY "anon_read_adicionais" ON adicionais FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_adicionais" ON adicionais;
CREATE POLICY "auth_insert_adicionais" ON adicionais FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_adicionais" ON adicionais;
CREATE POLICY "auth_update_adicionais" ON adicionais FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_adicionais" ON adicionais;
CREATE POLICY "auth_delete_adicionais" ON adicionais FOR DELETE TO authenticated USING (true);

-- ===== INGREDIENTES =====
CREATE TABLE IF NOT EXISTS ingredientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  unidade text NOT NULL DEFAULT 'kg',
  custo_por_unidade numeric(10,2) NOT NULL DEFAULT 0,
  estoque_atual numeric(10,3) DEFAULT 0,
  estoque_minimo numeric(10,3) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ingredientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_ingredientes" ON ingredientes;
CREATE POLICY "auth_read_ingredientes" ON ingredientes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_ingredientes" ON ingredientes;
CREATE POLICY "auth_insert_ingredientes" ON ingredientes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_ingredientes" ON ingredientes;
CREATE POLICY "auth_update_ingredientes" ON ingredientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_ingredientes" ON ingredientes;
CREATE POLICY "auth_delete_ingredientes" ON ingredientes FOR DELETE TO authenticated USING (true);

-- ===== FICHA TECNICA =====
CREATE TABLE IF NOT EXISTS ficha_tecnica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid REFERENCES produtos(id) ON DELETE CASCADE,
  ingrediente_id uuid REFERENCES ingredientes(id) ON DELETE CASCADE,
  quantidade numeric(10,3) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ficha_tecnica ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_ficha" ON ficha_tecnica;
CREATE POLICY "auth_read_ficha" ON ficha_tecnica FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_ficha" ON ficha_tecnica;
CREATE POLICY "auth_insert_ficha" ON ficha_tecnica FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_ficha" ON ficha_tecnica;
CREATE POLICY "auth_update_ficha" ON ficha_tecnica FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_ficha" ON ficha_tecnica;
CREATE POLICY "auth_delete_ficha" ON ficha_tecnica FOR DELETE TO authenticated USING (true);

-- ===== CLIENTES =====
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text NOT NULL DEFAULT '',
  endereco text DEFAULT '',
  bairro text DEFAULT '',
  cep text DEFAULT '',
  referencia text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_clientes" ON clientes;
CREATE POLICY "anon_read_clientes" ON clientes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_clientes" ON clientes;
CREATE POLICY "anon_insert_clientes" ON clientes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_clientes" ON clientes;
CREATE POLICY "auth_update_clientes" ON clientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_clientes" ON clientes;
CREATE POLICY "auth_delete_clientes" ON clientes FOR DELETE TO authenticated USING (true);

-- ===== PEDIDOS =====
CREATE TABLE IF NOT EXISTS pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero int NOT NULL DEFAULT 1,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL DEFAULT '',
  cliente_telefone text DEFAULT '',
  cliente_endereco text DEFAULT '',
  cliente_bairro text DEFAULT '',
  tipo text NOT NULL DEFAULT 'balcao',
  status text NOT NULL DEFAULT 'recebido',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0,
  desconto numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  custo_total numeric(10,2) NOT NULL DEFAULT 0,
  lucro numeric(10,2) NOT NULL DEFAULT 0,
  forma_pagamento text DEFAULT '',
  observacao text DEFAULT '',
  cupom text DEFAULT '',
  avaliacao int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_pedidos" ON pedidos;
CREATE POLICY "anon_read_pedidos" ON pedidos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pedidos" ON pedidos;
CREATE POLICY "anon_insert_pedidos" ON pedidos FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_pedidos" ON pedidos;
CREATE POLICY "auth_update_pedidos" ON pedidos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_pedidos" ON pedidos;
CREATE POLICY "auth_delete_pedidos" ON pedidos FOR DELETE TO authenticated USING (true);

-- ===== ITENS PEDIDO =====
CREATE TABLE IF NOT EXISTS itens_pedido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES produtos(id) ON DELETE SET NULL,
  produto_nome text NOT NULL DEFAULT '',
  quantidade int NOT NULL DEFAULT 1,
  preco_unitario numeric(10,2) NOT NULL DEFAULT 0,
  custo_unitario numeric(10,2) NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  sabor1 text DEFAULT '',
  sabor2 text DEFAULT '',
  adicional text DEFAULT '',
  adicional_preco numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE itens_pedido ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_itens" ON itens_pedido;
CREATE POLICY "anon_read_itens" ON itens_pedido FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_itens" ON itens_pedido;
CREATE POLICY "anon_insert_itens" ON itens_pedido FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_itens" ON itens_pedido;
CREATE POLICY "auth_update_itens" ON itens_pedido FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_itens" ON itens_pedido;
CREATE POLICY "auth_delete_itens" ON itens_pedido FOR DELETE TO authenticated USING (true);

-- ===== CAIXA =====
CREATE TABLE IF NOT EXISTS caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'entrada',
  descricao text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL DEFAULT 0,
  forma_pagamento text DEFAULT '',
  pedido_id uuid REFERENCES pedidos(id) ON DELETE SET NULL,
  data date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE caixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_caixa" ON caixa;
CREATE POLICY "auth_read_caixa" ON caixa FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_caixa" ON caixa;
CREATE POLICY "auth_insert_caixa" ON caixa FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_caixa" ON caixa;
CREATE POLICY "auth_update_caixa" ON caixa FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_caixa" ON caixa;
CREATE POLICY "auth_delete_caixa" ON caixa FOR DELETE TO authenticated USING (true);

-- ===== CONFIGURACOES =====
CREATE TABLE IF NOT EXISTS configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_loja text NOT NULL DEFAULT 'ESSENZA',
  logo text DEFAULT '',
  cor_primaria text DEFAULT '#E50914',
  cor_fundo text DEFAULT '#0A0A0A',
  cor_lucro text DEFAULT '#FFD700',
  horario_abertura text DEFAULT '18:00',
  horario_fechamento text DEFAULT '23:59',
  telefone_loja text DEFAULT '',
  endereco_loja text DEFAULT '',
  taxa_fixa_entrega numeric(10,2) DEFAULT 5,
  despesas_fixas_diaria numeric(10,2) DEFAULT 0,
  meta_diaria numeric(10,2) DEFAULT 2000,
  fidelidade_ativo boolean DEFAULT false,
  fidelidade_regras text DEFAULT 'A cada 10 pizzas ganhe 1 Broto',
  tabela_bloqueada boolean DEFAULT false,
  senha_tabela text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_config" ON configuracoes;
CREATE POLICY "anon_read_config" ON configuracoes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_config" ON configuracoes;
CREATE POLICY "auth_insert_config" ON configuracoes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_config" ON configuracoes;
CREATE POLICY "auth_update_config" ON configuracoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_config" ON configuracoes;
CREATE POLICY "auth_delete_config" ON configuracoes FOR DELETE TO authenticated USING (true);

-- ===== IMPRESSORAS =====
CREATE TABLE IF NOT EXISTS impressoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'usb',
  modelo text DEFAULT '',
  funcao text NOT NULL DEFAULT 'cozinha',
  ativa boolean DEFAULT true,
  ip text DEFAULT '',
  porta text DEFAULT '9100',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE impressoras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_impressoras" ON impressoras;
CREATE POLICY "auth_read_impressoras" ON impressoras FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_impressoras" ON impressoras;
CREATE POLICY "auth_insert_impressoras" ON impressoras FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_impressoras" ON impressoras;
CREATE POLICY "auth_update_impressoras" ON impressoras FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_impressoras" ON impressoras;
CREATE POLICY "auth_delete_impressoras" ON impressoras FOR DELETE TO authenticated USING (true);

-- ===== TAXA ENTREGA =====
CREATE TABLE IF NOT EXISTS taxa_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bairro text NOT NULL,
  cep text DEFAULT '',
  taxa numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE taxa_entrega ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_taxa" ON taxa_entrega;
CREATE POLICY "anon_read_taxa" ON taxa_entrega FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_taxa" ON taxa_entrega;
CREATE POLICY "auth_insert_taxa" ON taxa_entrega FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_taxa" ON taxa_entrega;
CREATE POLICY "auth_update_taxa" ON taxa_entrega FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_taxa" ON taxa_entrega;
CREATE POLICY "auth_delete_taxa" ON taxa_entrega FOR DELETE TO authenticated USING (true);

-- ===== PROMOCOES =====
CREATE TABLE IF NOT EXISTS promocoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  itens text NOT NULL DEFAULT '',
  preco numeric(10,2) NOT NULL DEFAULT 0,
  custo numeric(10,2) DEFAULT 0,
  data_inicio date DEFAULT CURRENT_DATE,
  data_fim date DEFAULT CURRENT_DATE + interval '30 days',
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE promocoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_promocoes" ON promocoes;
CREATE POLICY "anon_read_promocoes" ON promocoes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_promocoes" ON promocoes;
CREATE POLICY "auth_insert_promocoes" ON promocoes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_promocoes" ON promocoes;
CREATE POLICY "auth_update_promocoes" ON promocoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_promocoes" ON promocoes;
CREATE POLICY "auth_delete_promocoes" ON promocoes FOR DELETE TO authenticated USING (true);

-- ===== METAS =====
CREATE TABLE IF NOT EXISTS metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'diaria',
  valor numeric(10,2) NOT NULL DEFAULT 0,
  periodo text DEFAULT 'dia',
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_metas" ON metas;
CREATE POLICY "auth_read_metas" ON metas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_metas" ON metas;
CREATE POLICY "auth_insert_metas" ON metas FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_metas" ON metas;
CREATE POLICY "auth_update_metas" ON metas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_metas" ON metas;
CREATE POLICY "auth_delete_metas" ON metas FOR DELETE TO authenticated USING (true);

-- ===== AVALIACOES =====
CREATE TABLE IF NOT EXISTS avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid REFERENCES pedidos(id) ON DELETE CASCADE,
  cliente_nome text DEFAULT '',
  nota int NOT NULL DEFAULT 5,
  comentario text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_avaliacoes" ON avaliacoes;
CREATE POLICY "anon_read_avaliacoes" ON avaliacoes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_avaliacoes" ON avaliacoes;
CREATE POLICY "anon_insert_avaliacoes" ON avaliacoes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_avaliacoes" ON avaliacoes;
CREATE POLICY "auth_update_avaliacoes" ON avaliacoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_avaliacoes" ON avaliacoes;
CREATE POLICY "auth_delete_avaliacoes" ON avaliacoes FOR DELETE TO authenticated USING (true);

-- ===== USUARIOS (Staff profiles) =====
CREATE TABLE IF NOT EXISTS usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  role text NOT NULL DEFAULT 'atendente',
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_usuarios" ON usuarios;
CREATE POLICY "auth_read_usuarios" ON usuarios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_usuarios" ON usuarios;
CREATE POLICY "auth_insert_usuarios" ON usuarios FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_usuarios" ON usuarios;
CREATE POLICY "auth_update_usuarios" ON usuarios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_usuarios" ON usuarios;
CREATE POLICY "auth_delete_usuarios" ON usuarios FOR DELETE TO authenticated USING (true);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria_nome);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos(created_at);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_id ON itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_caixa_data ON caixa(data);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone);

CREATE SEQUENCE IF NOT EXISTS pedido_numero_seq START 1;
