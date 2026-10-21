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

    const { nome, login, password } = await req.json();
    if (!nome || !login || !password) return resposta({ error: 'Nome, login e senha são obrigatórios.' }, 400);

    const loginNormalizado = String(login).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9._-]{3,30}$/.test(loginNormalizado)) return resposta({ error: 'O login deve ter de 3 a 30 caracteres, sem espaços.' }, 400);
    const emailInterno = `${loginNormalizado}@garcom.essenza.local`;
    const { data: perfilPorLogin } = await admin.from('usuarios').select('id, user_id').eq('login', loginNormalizado).maybeSingle();
    const { data: perfilPorNome } = perfilPorLogin ? { data: null } : await admin.from('usuarios').select('id, user_id').ilike('nome', String(nome).trim()).maybeSingle();
    const { data: usuariosAuth } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const perfilLegado = perfilPorLogin || perfilPorNome;
    const existente = perfilLegado
      ? usuariosAuth?.users.find((u) => u.id === perfilLegado.user_id)
      : usuariosAuth?.users.find((u) => (u.email || '').toLowerCase() === emailInterno);
    let userId: string;

    if (existente) {
      const { data: atualizado, error: updateError } = await admin.auth.admin.updateUserById(existente.id, {
        email: emailInterno,
        password: String(password),
        email_confirm: true,
      });
      if (updateError || !atualizado.user) return resposta({ error: updateError?.message || 'Não foi possível atualizar a conta.' }, 400);
      userId = atualizado.user.id;
    } else {
      const { data: criado, error: createError } = await admin.auth.admin.createUser({
        email: emailInterno,
        password: String(password),
        email_confirm: true,
      });
      if (createError || !criado.user) return resposta({ error: createError?.message || 'Não foi possível criar a conta.' }, 400);
      userId = criado.user.id;
    }

    const { data: perfilExistente } = await admin.from('usuarios').select('id').eq('user_id', userId).maybeSingle();
    const profileQuery = perfilExistente
      ? admin.from('usuarios').update({ nome: String(nome).trim(), login: loginNormalizado, role: 'garcom', ativo: true }).eq('user_id', userId)
      : admin.from('usuarios').insert({ user_id: userId, nome: String(nome).trim(), login: loginNormalizado, role: 'garcom', ativo: true });
    const { error: profileError } = await profileQuery;
    if (profileError) {
      if (!existente) await admin.auth.admin.deleteUser(userId);
      return resposta({ error: profileError.message }, 400);
    }

    return resposta({ ok: true, user_id: userId });
  } catch (error) {
    return resposta({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});
