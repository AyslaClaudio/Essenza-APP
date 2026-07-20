/*
# Monitoramento do Agente de IA (WhatsApp)

## Overview
Adds persistence and monitoring infrastructure for the AI WhatsApp assistant, so staff
can watch conversations in real time, take over a chat from the AI, leave feedback on
individual AI replies, and maintain a small dynamic knowledge base that gets fed into
every AI request (rules/answers staff want the assistant to always follow).

## Tables created
1. `ia_conversas` — One row per customer conversation (simulator or real WhatsApp)
2. `ia_mensagens` — Every message exchanged in a conversation (customer/ia/humano/sistema)
3. `ia_conhecimento` — Small staff-curated knowledge base injected into the AI prompt

## Security
- RLS enabled on all tables.
- anon can insert/update conversas+mensagens (the bot/simulator writes without staff login).
- authenticated (staff) can read everything and manage ia_conhecimento.
*/

-- ===== IA CONVERSAS =====
CREATE TABLE IF NOT EXISTS ia_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  cliente_nome text DEFAULT '',
  canal text NOT NULL DEFAULT 'simulador',
  status text NOT NULL DEFAULT 'ia',
  precisa_atencao boolean DEFAULT false,
  motivo_atencao text DEFAULT '',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ia_conversas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_ia_conversas" ON ia_conversas;
CREATE POLICY "anon_all_ia_conversas" ON ia_conversas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ia_conversas_telefone ON ia_conversas(telefone);
CREATE INDEX IF NOT EXISTS idx_ia_conversas_status ON ia_conversas(status);
CREATE INDEX IF NOT EXISTS idx_ia_conversas_atencao ON ia_conversas(precisa_atencao);

-- ===== IA MENSAGENS =====
CREATE TABLE IF NOT EXISTS ia_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid REFERENCES ia_conversas(id) ON DELETE CASCADE,
  remetente text NOT NULL DEFAULT 'cliente',
  texto text NOT NULL DEFAULT '',
  feedback text DEFAULT '',
  enviado boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ia_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_ia_mensagens" ON ia_mensagens;
CREATE POLICY "anon_all_ia_mensagens" ON ia_mensagens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ia_mensagens_conversa ON ia_mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_ia_mensagens_pendentes ON ia_mensagens(enviado) WHERE enviado = false;

-- ===== IA CONHECIMENTO (base de conhecimento dinâmica) =====
CREATE TABLE IF NOT EXISTS ia_conhecimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topico text NOT NULL DEFAULT '',
  conteudo text NOT NULL DEFAULT '',
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ia_conhecimento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_ia_conhecimento" ON ia_conhecimento;
CREATE POLICY "anon_read_ia_conhecimento" ON ia_conhecimento FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_ia_conhecimento" ON ia_conhecimento;
CREATE POLICY "auth_insert_ia_conhecimento" ON ia_conhecimento FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_ia_conhecimento" ON ia_conhecimento;
CREATE POLICY "auth_update_ia_conhecimento" ON ia_conhecimento FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_ia_conhecimento" ON ia_conhecimento;
CREATE POLICY "auth_delete_ia_conhecimento" ON ia_conhecimento FOR DELETE TO authenticated USING (true);
