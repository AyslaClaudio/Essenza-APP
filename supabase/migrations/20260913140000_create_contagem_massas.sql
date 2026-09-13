/*
# Contagem diária de massas (pizza / esfirra)

## Motivo
A pizzaria trabalha com massa limitada por dia (discos de pizza e massa de
esfirra são preparados de véspera/de manhã, em quantidade fixa). Antes não
havia controle nenhum no sistema — dava pra vender mais pizza/esfirra do que
massa pronta existia. Esta tabela guarda a contagem de massas do dia,
lançada pelo Dashboard; o consumo é calculado em tempo real no app somando os
itens já vendidos (Balcão/Mesa/Site) sem precisar de outra tabela de baixa.

## Tabela
`contagem_massas`: uma linha por dia por tipo ('pizza' ou 'esfiha') com a
quantidade inicial informada. UNIQUE(data, tipo) permite upsert direto do
Dashboard ao editar a contagem do dia.

## Segurança
Tabela interna (só staff mexe nisso) — RLS só para `authenticated`, igual
`ingredientes`/`ficha_tecnica`.
*/

CREATE TABLE IF NOT EXISTS contagem_massas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL CHECK (tipo IN ('pizza', 'esfiha')),
  quantidade int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (data, tipo)
);

ALTER TABLE contagem_massas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_contagem_massas" ON contagem_massas;
CREATE POLICY "auth_read_contagem_massas" ON contagem_massas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_contagem_massas" ON contagem_massas;
CREATE POLICY "auth_insert_contagem_massas" ON contagem_massas FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_contagem_massas" ON contagem_massas;
CREATE POLICY "auth_update_contagem_massas" ON contagem_massas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_contagem_massas" ON contagem_massas;
CREATE POLICY "auth_delete_contagem_massas" ON contagem_massas FOR DELETE TO authenticated USING (true);

-- Realtime: outros terminais veem a contagem lançada no Dashboard na hora,
-- sem precisar recarregar a página (mesmo padrão de `pedidos`/`mesas`).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contagem_massas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contagem_massas;
  END IF;
END $$;
