/*
# ESSENZA — Seed v12 Product Table + Default Config

## Overview
Seeds the database with the official v12 product table on first installation.
All products have cost and price so the system can calculate profit and margin.
The ADM can edit everything afterwards.

## What gets inserted
- 4 categories: Pizzas P 25cm, Pizzas G 35cm, Esfirras, Combos Esfirra
- 30 products with official cost/price from v12 table
- Default store configuration (ESSENZA brand colors, hours, meta)
- Sample delivery fees
- Default daily goal

## Notes
- Uses ON CONFLICT DO NOTHING guard via a check to avoid duplicate inserts on re-run
- Prices and costs are exact from the v12 specification
*/

-- ===== CATEGORIES =====
INSERT INTO categorias (nome, ordem, base_custo) VALUES
  ('Pizzas P 25cm', 1, 9.97),
  ('Pizzas G 35cm', 2, 10.66),
  ('Esfirras', 3, 8.00),
  ('Combos Esfirra', 4, 0)
ON CONFLICT DO NOTHING;

-- ===== PIZZAS P 25cm =====
INSERT INTO produtos (nome, categoria_nome, custo, preco, tamanho) VALUES
  ('Mussarela', 'Pizzas P 25cm', 9.97, 28.90, 'P'),
  ('Presunto', 'Pizzas P 25cm', 10.44, 31.90, 'P'),
  ('Frango', 'Pizzas P 25cm', 9.56, 31.90, 'P'),
  ('Calabresa', 'Pizzas P 25cm', 9.87, 31.90, 'P'),
  ('Bacon', 'Pizzas P 25cm', 10.38, 31.90, 'P'),
  ('Carne de Sol', 'Pizzas P 25cm', 10.48, 31.90, 'P'),
  ('Pepperoni', 'Pizzas P 25cm', 13.03, 31.90, 'P'),
  ('Pepperoni Essenza', 'Pizzas P 25cm', 14.05, 36.90, 'P')
ON CONFLICT DO NOTHING;

-- ===== PIZZAS G 35cm =====
INSERT INTO produtos (nome, categoria_nome, custo, preco, tamanho) VALUES
  ('Mussarela', 'Pizzas G 35cm', 10.66, 39.90, 'G'),
  ('Presunto', 'Pizzas G 35cm', 11.58, 43.90, 'G'),
  ('Frango', 'Pizzas G 35cm', 9.86, 43.90, 'G'),
  ('Calabresa', 'Pizzas G 35cm', 10.46, 43.90, 'G'),
  ('Bacon', 'Pizzas G 35cm', 11.46, 43.90, 'G'),
  ('Carne de Sol', 'Pizzas G 35cm', 11.66, 43.90, 'G'),
  ('Pepperoni', 'Pizzas G 35cm', 16.66, 43.90, 'G'),
  ('Pepperoni Essenza', 'Pizzas G 35cm', 18.66, 71.90, 'G'),
  ('3 Queijos', 'Pizzas G 35cm', 15.31, 52.90, 'G'),
  ('Frango com Bacon', 'Pizzas G 35cm', 13.54, 49.90, 'G')
ON CONFLICT DO NOTHING;

-- ===== ESFIRRAS =====
INSERT INTO produtos (nome, categoria_nome, custo, preco, tamanho) VALUES
  ('Frango+Bacon', 'Esfirras', 1.98, 8.00, 'Esfirra'),
  ('Carne s/ Queijo', 'Esfirras', 2.15, 8.00, 'Esfirra'),
  ('Calabresa+Queijo', 'Esfirras', 2.23, 8.00, 'Esfirra'),
  ('Pizza', 'Esfirras', 2.44, 8.00, 'Esfirra'),
  ('Bacon+Queijo', 'Esfirras', 2.51, 8.00, 'Esfirra'),
  ('Frango+Queijo', 'Esfirras', 2.52, 8.00, 'Esfirra'),
  ('Mussarela', 'Esfirras', 2.82, 8.00, 'Esfirra'),
  ('Doce de Leite', 'Esfirras', 2.64, 8.00, 'Esfirra'),
  ('Chocolate Cremoso', 'Esfirras', 2.64, 8.00, 'Esfirra'),
  ('Carne+Queijo', 'Esfirras', 3.25, 10.00, 'Esfirra')
ON CONFLICT DO NOTHING;

-- ===== COMBOS ESFIRRA (exceto Carne+Queijo) =====
INSERT INTO produtos (nome, categoria_nome, custo, preco, tamanho) VALUES
  ('Combo Solo', 'Combos Esfirra', 4.82, 10.00, 'Combo'),
  ('Combo Duo', 'Combos Esfirra', 9.64, 19.90, 'Combo')
ON CONFLICT DO NOTHING;

-- ===== DEFAULT CONFIG =====
INSERT INTO configuracoes (nome_loja, cor_primaria, cor_fundo, cor_lucro, meta_diaria, despesas_fixas_diaria, tabela_bloqueada, senha_tabela)
VALUES ('ESSENZA', '#E50914', '#0A0A0A', '#FFD700', 2000, 0, false, '1234')
ON CONFLICT DO NOTHING;

-- ===== DEFAULT ADICIONAIS =====
INSERT INTO adicionais (nome, preco) VALUES
  ('Borda Catupiry', 8.00),
  ('Borda Cheddar', 7.00),
  ('Borda Chocolate', 6.00),
  ('Extra Mussarela', 5.00),
  ('Refri 200ml', 2.00),
  ('Refri 350ml', 4.00)
ON CONFLICT DO NOTHING;

-- ===== SAMPLE DELIVERY FEES =====
INSERT INTO taxa_entrega (bairro, taxa) VALUES
  ('Centro', 5.00),
  ('Bairro A', 7.00),
  ('Bairro B', 8.00),
  ('Retirada no Balcão', 0.00)
ON CONFLICT DO NOTHING;

-- ===== DEFAULT META =====
INSERT INTO metas (tipo, valor, periodo) VALUES
  ('diaria', 2000, 'dia')
ON CONFLICT DO NOTHING;
