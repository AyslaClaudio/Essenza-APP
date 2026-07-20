/*
# Reservas de Mesa

## Overview
Adds table reservation tracking for the ESSENZA dining room (salão), collected via the
WhatsApp AI assistant when a customer asks to reserve a table instead of placing a food order.

## Tables created
1. `reservas` — Table reservation requests (name, phone, date, time, party size, status)

## Security
- RLS enabled.
- anon can insert (WhatsApp bot creates reservations without staff login).
- authenticated (staff) can read/update/delete to manage reservations.
*/

CREATE TABLE IF NOT EXISTS reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome text NOT NULL DEFAULT '',
  cliente_telefone text DEFAULT '',
  data date NOT NULL,
  horario text NOT NULL DEFAULT '',
  numero_pessoas int NOT NULL DEFAULT 1,
  observacao text DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_reservas" ON reservas;
CREATE POLICY "anon_insert_reservas" ON reservas FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_read_reservas" ON reservas;
CREATE POLICY "auth_read_reservas" ON reservas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_update_reservas" ON reservas;
CREATE POLICY "auth_update_reservas" ON reservas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_reservas" ON reservas;
CREATE POLICY "auth_delete_reservas" ON reservas FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_reservas_data ON reservas(data);
