/*
# Adicionar categoria Bebidas ao cardápio

1. New Data
- Insere a categoria "Bebidas" na tabela `categorias` com ordem 5.
- Insere produtos padrão de bebidas (Refrigerantes, Sucos, Águas) na tabela `produtos`.
- Todos os produtos usam a categoria "Bebidas" com o categoria_id correspondente.
- Fotos de produtos usam URLs do Pexels.
2. Security
- Sem mudanças de segurança. As tabelas `categorias` e `produtos` já possuem RLS e políticas configuradas.
3. Important Notes
- A migração é idempotente: usa `WHERE NOT EXISTS` para não duplicar a categoria ou produtos.
- Produtos padrão: Coca-Cola Lata, Guaraná Lata, Suco Natural Laranja, Água Mineral, Água com Gás.
*/

-- Adiciona categoria Bebidas se não existir
INSERT INTO categorias (nome, ordem)
SELECT 'Bebidas', 5
WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nome = 'Bebidas');

-- Insere produtos padrão de bebidas
DO $$
DECLARE
  bebidas_id uuid;
BEGIN
  SELECT id INTO bebidas_id FROM categorias WHERE nome = 'Bebidas';
  IF bebidas_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO produtos (nome, categoria_id, categoria_nome, custo, preco, foto, tamanho, ativo, destaque)
  SELECT 'Coca-Cola Lata 350ml', bebidas_id, 'Bebidas', 3.50, 7.00, 'https://images.pexels.com/photos/2983100/pexels-photo-2983100.jpeg?auto=compress&cs=tinysrgb&w=400', '350ml', true, false
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE nome = 'Coca-Cola Lata 350ml');

  INSERT INTO produtos (nome, categoria_id, categoria_nome, custo, preco, foto, tamanho, ativo, destaque)
  SELECT 'Guaraná Antarctica Lata 350ml', bebidas_id, 'Bebidas', 3.00, 6.50, 'https://images.pexels.com/photos/12920214/pexels-photo-12920214.jpeg?auto=compress&cs=tinysrgb&w=400', '350ml', true, false
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE nome = 'Guaraná Antarctica Lata 350ml');

  INSERT INTO produtos (nome, categoria_id, categoria_nome, custo, preco, foto, tamanho, ativo, destaque)
  SELECT 'Suco Natural Laranja 500ml', bebidas_id, 'Bebidas', 4.00, 9.00, 'https://images.pexels.com/photos/1337825/pexels-photo-1337825.jpeg?auto=compress&cs=tinysrgb&w=400', '500ml', true, false
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE nome = 'Suco Natural Laranja 500ml');

  INSERT INTO produtos (nome, categoria_id, categoria_nome, custo, preco, foto, tamanho, ativo, destaque)
  SELECT 'Água Mineral 500ml', bebidas_id, 'Bebidas', 1.50, 4.00, 'https://images.pexels.com/photos/327090/pexels-photo-327090.jpeg?auto=compress&cs=tinysrgb&w=400', '500ml', true, false
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE nome = 'Água Mineral 500ml');

  INSERT INTO produtos (nome, categoria_id, categoria_nome, custo, preco, foto, tamanho, ativo, destaque)
  SELECT 'Água com Gás 500ml', bebidas_id, 'Bebidas', 2.00, 5.00, 'https://images.pexels.com/photos/327090/pexels-photo-327090.jpeg?auto=compress&cs=tinysrgb&w=400', '500ml', true, false
  WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE nome = 'Água com Gás 500ml');
END $$;
