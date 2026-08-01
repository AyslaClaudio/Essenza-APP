import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Sem isso, a conexão Realtime (usada pra auto-impressão e pro módulo Mesas)
// fica autenticada como "anon" mesmo com o usuário logado — confirmado
// direto no banco (`select role from realtime.subscription`) mostrando
// role=anon nas inscrições do painel, mesmo com staff autenticado. As
// policies de leitura de pedidos/mesas são só pra `authenticated`, então o
// evento chegava e era barrado silenciosamente, sem erro nenhum em lugar
// nenhum. `onAuthStateChange` cobre login/logout/refresh; a sessão inicial
// (usuário já logado ao abrir o app) é sincronizada explicitamente abaixo,
// que é justamente o caso que não estava sendo propagado sozinho.
supabase.auth.onAuthStateChange((_event, session) => {
  supabase.realtime.setAuth(session?.access_token ?? supabaseAnonKey);
});
supabase.auth.getSession().then(({ data: { session } }) => {
  supabase.realtime.setAuth(session?.access_token ?? supabaseAnonKey);
});
