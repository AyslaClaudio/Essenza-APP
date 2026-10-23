import { createClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import { buscarConfiguracaoLoja } from './configuracaoLoja';

it('carrega a configuração mais recente mesmo com dois cadastros na loja', async () => {
  const atual = { id: 'config-atual', nome_loja: 'ESSENZA', updated_at: '2026-10-18T21:01:05Z' };
  const fetch = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = new URL(String(entrada));
    // Reprodução da API: solicitar uma linha única sem limitar os dois
    // registros causa erro; o limite ordenado deve retornar o cadastro atual.
    if (url.searchParams.get('limit') !== '1' || !url.searchParams.get('order')?.startsWith('updated_at.desc')) {
      return new Response(JSON.stringify({ code: 'PGRST116', message: 'Multiple rows returned' }), { status: 406, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify([atual]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const cliente = createClient('https://teste.supabase.co', 'chave-teste', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch } });
  const resultado = await buscarConfiguracaoLoja(cliente);
  expect(resultado.error).toBeNull();
  expect(resultado.data).toEqual(atual);
});
