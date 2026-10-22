-- Referência oficial fornecida em 22/10/2026. Não altera vendas históricas.
CREATE TABLE IF NOT EXISTS public.catalogo_backup_20261022 (id uuid PRIMARY KEY, registro jsonb NOT NULL);
ALTER TABLE public.catalogo_backup_20261022 ENABLE ROW LEVEL SECURITY;
INSERT INTO public.catalogo_backup_20261022 SELECT id, to_jsonb(p) FROM public.produtos p ON CONFLICT DO NOTHING;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS codigo_cardapio text;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS sabor_chave text;
CREATE UNIQUE INDEX IF NOT EXISTS produtos_codigo_cardapio_unique ON public.produtos(codigo_cardapio) WHERE codigo_cardapio IS NOT NULL;
DO $$
DECLARE r record; categoria uuid; produto uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('ca0afa2d-4d3c-4819-ab27-0a123fbc175f', 'Mussarela', 'Pizzas artesanais', 'G', 36.9, 'pizza-mussarela-g', 'mussarela'),
    ('fcd1562e-84c4-4733-b6f0-c5887879cd31', 'Mussarela', 'Pizzas artesanais', 'P', 24.9, 'pizza-mussarela-p', 'mussarela'),
    ('67c55e5c-b66e-4c77-a736-045c1459d482', 'Presunto', 'Pizzas artesanais', 'G', 37.9, 'pizza-presunto-g', 'presunto'),
    ('c9e1b252-6585-424b-97ed-8f13101b4173', 'Presunto', 'Pizzas artesanais', 'P', 25.9, 'pizza-presunto-p', 'presunto'),
    ('ae98e741-d937-453a-81db-d972fe57fb8c', 'Marguerita', 'Pizzas artesanais', 'G', 42.9, 'pizza-marguerita-g', 'marguerita'),
    ('f75cf79f-0295-4be4-bebb-de0ab44b0635', 'Marguerita', 'Pizzas artesanais', 'P', 28.6, 'pizza-marguerita-p', 'marguerita'),
    ('11149b52-753b-4b18-b515-b7e44056860e', 'Bacon', 'Pizzas artesanais', 'G', 44.9, 'pizza-bacon-g', 'bacon'),
    ('1f1bd904-73ef-4739-b4b2-922e8814af52', 'Bacon', 'Pizzas artesanais', 'P', 29.9, 'pizza-bacon-p', 'bacon'),
    ('33cc214d-03f6-4874-8331-8b205b636fd4', 'Frango', 'Pizzas artesanais', 'G', 46.9, 'pizza-frango-g', 'frango'),
    ('2ea860ab-e837-4a61-9de5-2e0e1b460f91', 'Frango', 'Pizzas artesanais', 'P', 31.9, 'pizza-frango-p', 'frango'),
    ('3253564d-9013-4646-b190-687effd53663', 'Calabresa', 'Pizzas artesanais', 'G', 43.9, 'pizza-calabresa-g', 'calabresa'),
    ('094d0187-4e2b-472b-8c55-38831341afee', 'Calabresa', 'Pizzas artesanais', 'P', 29.9, 'pizza-calabresa-p', 'calabresa'),
    ('6ad51cf1-3f3a-451e-8da9-0f1efa870731', 'Pepperoni', 'Pizzas artesanais', 'G', 50, 'pizza-pepperoni-g', 'pepperoni'),
    ('705a6e6e-3766-46d0-8b18-8b5de1507e90', 'Pepperoni', 'Pizzas artesanais', 'P', 33.9, 'pizza-pepperoni-p', 'pepperoni'),
    ('f9e0345e-2627-45b5-bf4d-55525f1e3e76', 'Frango com Catupiry', 'Pizzas artesanais', 'G', 49.9, 'pizza-frango-com-catupiry-g', 'frango-com-catupiry'),
    ('54f6bbf9-0f7e-4cc2-8132-61961512cb13', 'Frango com Catupiry', 'Pizzas artesanais', 'P', 33.9, 'pizza-frango-com-catupiry-p', 'frango-com-catupiry'),
    ('3fe07414-7762-4a88-bcc2-76c9e950f548', 'Calabresa Especial', 'Pizzas artesanais', 'G', 49.9, 'pizza-calabresa-especial-g', 'calabresa-especial'),
    ('db92b2b9-b510-4b6e-929b-e753c667cef4', 'Calabresa Especial', 'Pizzas artesanais', 'P', 32.6, 'pizza-calabresa-especial-p', 'calabresa-especial'),
    ('3231a447-d1c2-4a75-8902-ae624674b56d', 'Frango com Bacon', 'Pizzas artesanais', 'G', 49.9, 'pizza-frango-com-bacon-g', 'frango-com-bacon'),
    ('50452be3-477d-489a-9e24-b91a78ff5c4d', 'Frango com Bacon', 'Pizzas artesanais', 'P', 33.9, 'pizza-frango-com-bacon-p', 'frango-com-bacon'),
    ('b26a7d43-81d0-4f14-81e8-7b72491fbdf2', 'Três Queijos', 'Pizzas artesanais', 'G', 52.9, 'pizza-tres-queijos-g', 'tres-queijos'),
    ('cea3c817-6780-4b41-843b-8eaa02962442', 'Três Queijos', 'Pizzas artesanais', 'P', 35.9, 'pizza-tres-queijos-p', 'tres-queijos'),
    ('1d141b21-72a8-4195-a37b-38018d8490ae', 'Carne de Sol', 'Pizzas artesanais', 'G', 59.9, 'pizza-carne-de-sol-g', 'carne-de-sol'),
    ('523dd8ac-cd87-4135-ac1c-a1ca68430442', 'Carne de Sol', 'Pizzas artesanais', 'P', 39.9, 'pizza-carne-de-sol-p', 'carne-de-sol'),
    ('0aa544d4-1fa3-44fb-97ca-75d23e13444b', 'Carne de Sol Essenza', 'Pizzas Linha Essenza', 'G', 69.9, 'pizza-carne-de-sol-essenza-g', 'carne-de-sol-essenza'),
    ('1e9e1f38-501c-4a5c-b1ba-750feee57f8c', 'Carne de Sol Essenza', 'Pizzas Linha Essenza', 'P', 49.9, 'pizza-carne-de-sol-essenza-p', 'carne-de-sol-essenza'),
    ('33776fd9-287e-49ae-87fb-15b8d551e0ea', 'Pepperoni Essenza', 'Pizzas Linha Essenza', 'G', 71.9, 'pizza-pepperoni-essenza-g', 'pepperoni-essenza'),
    ('984906ac-7816-4913-97da-d6a774e623be', 'Pepperoni Essenza', 'Pizzas Linha Essenza', 'P', 49.9, 'pizza-pepperoni-essenza-p', 'pepperoni-essenza'),
    ('bfd87c81-889a-4545-8008-6e7b60e44de0', 'Pepperoni Tropical', 'Pizzas Linha Essenza', 'G', 65, 'pizza-pepperoni-tropical-g', 'pepperoni-tropical'),
    ('341bfa89-1922-4c00-bef3-738e9a4c4dfa', 'Pepperoni Tropical', 'Pizzas Linha Essenza', 'P', 43.9, 'pizza-pepperoni-tropical-p', 'pepperoni-tropical'),
    ('f9b27666-8024-4808-95f9-8ba4a76a1daa', 'Tropicana', 'Pizzas Linha Essenza', 'G', 54.9, 'pizza-tropicana-g', 'tropicana'),
    ('8c558914-646b-40ed-a7ee-13150953bb6e', 'Tropicana', 'Pizzas Linha Essenza', 'P', 36.9, 'pizza-tropicana-p', 'tropicana'),
    ('0d257061-121c-49e2-96af-7cd3f5ec50e0', 'Carne de Sol Picante', 'Pizzas Linha Essenza', 'G', 63.9, 'pizza-carne-de-sol-picante-g', 'carne-de-sol-picante'),
    (NULL, 'Carne de Sol Picante', 'Pizzas Linha Essenza', 'P', 42.9, 'pizza-carne-de-sol-picante-p', 'carne-de-sol-picante'),
    ('51ea8a1e-3f62-4aba-8dca-9eb800656999', 'Carne', 'Esfirras salgadas', '', 8, 'esfiha-carne', NULL),
    ('60ab86b1-6bbb-4260-a216-e6d589eaeebe', 'Carne com Queijo', 'Esfirras salgadas', '', 10, 'esfiha-carne-com-queijo', NULL),
    ('781c876d-c306-408d-b82b-dffc005811d6', 'Queijo', 'Esfirras salgadas', '', 8, 'esfiha-queijo', NULL),
    ('a2fbd720-ca44-493b-afb5-c6e8c21e7120', 'Três Queijos', 'Esfirras salgadas', '', 8, 'esfiha-tres-queijos', NULL),
    ('4e2b034f-02f1-4ac5-8197-14ea66a15979', 'Pizza', 'Esfirras salgadas', '', 8, 'esfiha-pizza', NULL),
    ('1a9d055d-7e99-4e6f-a28b-513779846696', 'Calabresa com Queijo', 'Esfirras salgadas', '', 8, 'esfiha-calabresa-com-queijo', NULL),
    ('973003eb-ca56-4304-8622-5219a944239c', 'Bacon com Queijo', 'Esfirras salgadas', '', 8, 'esfiha-bacon-com-queijo', NULL),
    ('9f0c2028-e0e9-4483-bb48-84c28cd6b32a', 'Frango com Queijo', 'Esfirras salgadas', '', 8, 'esfiha-frango-com-queijo', NULL),
    ('0d97ae89-8a79-4e7a-9b7e-b7a16b7d4526', 'Frango com Bacon', 'Esfirras salgadas', '', 8, 'esfiha-frango-com-bacon', NULL),
    ('646f19ad-66d2-47fd-aa56-e789537024a0', 'Carne de Sol com Queijo', 'Esfirras salgadas', '', 10, 'esfiha-carne-de-sol-com-queijo', NULL),
    ('41aa2e83-bc3c-4570-b585-c8696e1124c1', 'Doce de Leite', 'Esfirras doces', '', 8, 'esfiha-doce-de-leite', NULL),
    ('0dcea85a-b80b-49ae-9524-c70b5e3e78e3', 'Chocolate Cremoso', 'Esfirras doces', '', 8, 'esfiha-chocolate-cremoso', NULL),
    ('63036ba2-4e8d-468b-a3b9-b7e02cd7bb13', 'Combo Solo', 'Combos', '', 10, 'combo-solo', NULL),
    ('b6b579f0-68b3-4c19-92d4-b598e3f35a1c', 'Combo Duo', 'Combos', '', 19.9, 'combo-duo', NULL),
    ('71f52729-8667-4f53-bf46-a6007a6832a1', 'Salva Bordas 100ml', 'Adicionais', '100ml', 10, 'salva-bordas-100ml', NULL)
  ) AS oficial(id, nome, categoria, tamanho, preco, codigo, sabor)
  LOOP
    SELECT id INTO categoria FROM public.categorias WHERE nome = r.categoria ORDER BY id LIMIT 1;
    IF categoria IS NULL THEN
      INSERT INTO public.categorias(nome) VALUES (r.categoria) RETURNING id INTO categoria;
    END IF;
    SELECT id INTO produto FROM public.produtos WHERE codigo_cardapio = r.codigo;
    IF produto IS NULL AND r.id IS NOT NULL THEN
      SELECT id INTO produto FROM public.produtos WHERE id = r.id::uuid;
    END IF;
    IF produto IS NULL THEN
      -- Custo desconhecido fica 0 até a ficha técnica; não inventar custo.
      INSERT INTO public.produtos(nome, categoria_id, categoria_nome, tamanho, preco, codigo_cardapio, sabor_chave, ativo)
      VALUES(r.nome, categoria, r.categoria, r.tamanho, r.preco, r.codigo, r.sabor, true);
    ELSE
      UPDATE public.produtos SET nome=r.nome, categoria_id=categoria, categoria_nome=r.categoria, tamanho=r.tamanho,
        preco=r.preco, codigo_cardapio=r.codigo, sabor_chave=r.sabor, ativo=true WHERE id=produto;
    END IF;
  END LOOP;
  UPDATE public.produtos SET ativo=false WHERE codigo_cardapio IS NULL
    AND (categoria_nome ILIKE '%pizza%' OR categoria_nome ILIKE '%esfirra%' OR categoria_nome ILIKE '%esfiha%' OR categoria_nome ILIKE '%combo%' OR nome ILIKE '%salva%borda%');
  IF (SELECT count(*) FROM public.produtos WHERE codigo_cardapio IS NOT NULL AND ativo) <> 49 THEN
    RAISE EXCEPTION 'O cardápio oficial precisa conter exatamente 49 produtos ativos';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS produtos_ativos_nome_tamanho_categoria_unique
  ON public.produtos (lower(regexp_replace(trim(nome), '\s+', ' ', 'g')), categoria_id, upper(trim(tamanho)))
  WHERE ativo;

