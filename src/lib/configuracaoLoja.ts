import type { SupabaseClient } from '@supabase/supabase-js';

export function buscarConfiguracaoLoja(cliente: SupabaseClient) {
  return cliente.from('configuracoes').select('*')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true }).limit(1).maybeSingle();
}
