/*
# Habilita Realtime na tabela pedidos

## Motivo
Auto-impressão de pedidos do site do cliente (Adm.tsx) escuta INSERTs em
`pedidos` via Supabase Realtime (postgres_changes). Sem a tabela estar na
publicação `supabase_realtime`, nenhum evento chega no navegador — o listener
fica montado mas nunca dispara, e o pedido não imprime sozinho.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pedidos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
  END IF;
END $$;
