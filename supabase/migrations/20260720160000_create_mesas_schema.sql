/*
# Módulo Mesas (atendimento no salão)

## Overview
Adiciona o suporte a "Mesas" do salão: cada mesa acumula itens ao longo da refeição
(diferente do delivery/balcão, que fecha na hora) e só é fechada no final, quando a
conta vira um pedido normal (tipo = 'mesa') + entrada no caixa, reaproveitando todo o
pipeline financeiro/relatórios já existente.

## Tabelas criadas
1. `mesas`       — Uma linha por mesa física do salão (status por cor no painel).
2. `itens_mesa`  — Itens lançados numa mesa aberta (acumulativos até o fechamento).

## Segurança
- RLS habilitado nas duas tabelas.
- anon + authenticated podem ler/gravar (o painel administrativo é autenticado; mantemos
  o mesmo padrão flexível das demais tabelas operacionais como ia_conversas).

## Observação
`pedidos.tipo` é um text livre (sem CHECK), então o valor 'mesa' já é aceito sem ALTER.
*/

-- ===== MESAS =====
CREATE TABLE IF NOT EXISTS mesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'livre',      -- 'livre' | 'ocupada' | 'fechando'
  abertura_at timestamptz,                    -- quando a mesa foi aberta (primeiro item)
  garcom text DEFAULT '',
  observacao text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE mesas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_mesas" ON mesas;
CREATE POLICY "anon_all_mesas" ON mesas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mesas_status ON mesas(status);

-- ===== ITENS DA MESA =====
CREATE TABLE IF NOT EXISTS itens_mesa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mesa_id uuid REFERENCES mesas(id) ON DELETE CASCADE,
  produto_id uuid,
  produto_nome text NOT NULL DEFAULT '',
  quantidade integer NOT NULL DEFAULT 1,
  preco_unitario numeric NOT NULL DEFAULT 0,
  custo_unitario numeric NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  sabor1 text DEFAULT '',
  sabor2 text DEFAULT '',
  adicional text DEFAULT '',
  adicional_preco numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE itens_mesa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_itens_mesa" ON itens_mesa;
CREATE POLICY "anon_all_itens_mesa" ON itens_mesa FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_itens_mesa_mesa ON itens_mesa(mesa_id);

-- ===== SEED: cria as mesas 1..8 se ainda não existirem =====
INSERT INTO mesas (numero, status)
SELECT g, 'livre'
FROM generate_series(1, 8) AS g
WHERE NOT EXISTS (SELECT 1 FROM mesas WHERE mesas.numero = g);
