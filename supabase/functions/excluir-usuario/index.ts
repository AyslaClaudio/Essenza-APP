import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resposta = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return resposta({ error: 'Sessão não informada.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const token = authorization.replace('Bearer ', '');
    const { data: authUser, error: authError } = await admin.auth.getUser(token);
    if (authError || !authUser.user) return resposta({ error: 'Sessão inválida.' }, 401);
    const { data: gerente } = await admin.from('usuarios').select('role, ativo').eq('user_id', authUser.user.id).maybeSingle();
    if (!gerente || gerente.role !== 'gerente' || !gerente.ativo) return resposta({ error: 'Somente um gerente pode excluir usuários.' }, 403);
    const { usuario_id } = await req.json();
    const { data: perfil } = await admin.from('usuarios').select('id, user_id').eq('id', usuario_id).maybeSingle();
    if (!perfil) return resposta({ error: 'Usuário não encontrado.' }, 404);
    if (perfil.user_id === authUser.user.id) return resposta({ error: 'A conta do gerente logado não pode ser excluída.' }, 400);
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(perfil.user_id);
    if (authDeleteError) return resposta({ error: authDeleteError.message }, 400);
    const { error: profileDeleteError } = await admin.from('usuarios').delete().eq('id', perfil.id);
    if (profileDeleteError) return resposta({ error: profileDeleteError.message }, 400);
    return resposta({ ok: true });
  } catch (error) {
    return resposta({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});
