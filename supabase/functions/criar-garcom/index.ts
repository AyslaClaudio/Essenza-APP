import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resposta = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return resposta({ error: 'Sessão não informada.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const token = authorization.replace('Bearer ', '');
    const { data: authUser, error: authError } = await admin.auth.getUser(token);
    if (authError || !authUser.user) return resposta({ error: 'Sessão inválida.' }, 401);

    const { data: gerente } = await admin
      .from('usuarios')
      .select('role, ativo')
      .eq('user_id', authUser.user.id)
      .maybeSingle();
    if (!gerente || gerente.role !== 'gerente' || !gerente.ativo) {
      return resposta({ error: 'Somente um gerente pode criar garçons.' }, 403);
    }

    const { nome, email, password } = await req.json();
    if (!nome || !email || !password) return resposta({ error: 'Nome, e-mail e senha são obrigatórios.' }, 400);

    const { data: criado, error: createError } = await admin.auth.admin.createUser({
      email: String(email).trim(),
      password: String(password),
      email_confirm: true,
    });
    if (createError || !criado.user) return resposta({ error: createError?.message || 'Não foi possível criar a conta.' }, 400);

    const { error: profileError } = await admin.from('usuarios').insert({
      user_id: criado.user.id,
      nome: String(nome).trim(),
      role: 'garcom',
      ativo: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(criado.user.id);
      return resposta({ error: profileError.message }, 400);
    }

    return resposta({ ok: true, user_id: criado.user.id });
  } catch (error) {
    return resposta({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});
