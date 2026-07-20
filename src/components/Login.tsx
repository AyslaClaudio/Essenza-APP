import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Flame } from 'lucide-react';

export function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'atendente' | 'caixa' | 'gerente'>('gerente');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase
        .from('usuarios')
        .insert({ user_id: data.user.id, nome, role });

      if (profileError) {
        setError('Conta criada mas erro ao vincular perfil: ' + profileError.message);
      } else {
        setSuccess('Conta criada! Faça login para acessar.');
        setMode('login');
        setNome('');
        setPassword('');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#E50914] mb-4 shadow-lg shadow-red-900/50">
            <Flame size={40} className="text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white">ESSENZA</h1>
          <p className="text-neutral-500 text-sm mt-1 tracking-widest uppercase">Pizzaria</p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6 bg-neutral-900 p-1 rounded-xl">
          <button
            onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
            className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors ${mode === 'login' ? 'bg-[#E50914] text-white' : 'text-neutral-400'}`}
          >Entrar</button>
          <button
            onClick={() => { setMode('signup'); setError(null); setSuccess(null); }}
            className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors ${mode === 'signup' ? 'bg-[#E50914] text-white' : 'text-neutral-400'}`}
          >Criar Conta</button>
        </div>

        {success && (
          <div className="bg-green-950/50 border border-green-900 rounded-xl px-4 py-3 text-green-400 text-sm mb-4">
            {success}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-neutral-400 text-sm mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3.5 text-white text-lg focus:border-[#E50914] focus:outline-none transition-colors"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-neutral-400 text-sm mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3.5 text-white text-lg focus:border-[#E50914] focus:outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <div className="bg-red-950/50 border border-red-900 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E50914] hover:bg-[#f6121d] text-white font-bold text-lg py-4 rounded-xl transition-colors disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? 'Entrando...' : 'ENTRAR'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-neutral-400 text-sm mb-1.5">Nome</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3.5 text-white text-lg focus:border-[#E50914] focus:outline-none transition-colors"
                placeholder="Seu nome"
                required
              />
            </div>
            <div>
              <label className="block text-neutral-400 text-sm mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3.5 text-white text-lg focus:border-[#E50914] focus:outline-none transition-colors"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-neutral-400 text-sm mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3.5 text-white text-lg focus:border-[#E50914] focus:outline-none transition-colors"
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
              />
            </div>
            <div>
              <label className="block text-neutral-400 text-sm mb-1.5">Nível de Acesso</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3.5 text-white text-lg focus:border-[#E50914] focus:outline-none transition-colors"
              >
                <option value="gerente">Gerente (acesso total)</option>
                <option value="caixa">Caixa</option>
                <option value="atendente">Atendente</option>
              </select>
            </div>
            {error && (
              <div className="bg-red-950/50 border border-red-900 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E50914] hover:bg-[#f6121d] text-white font-bold text-lg py-4 rounded-xl transition-colors disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? 'Criando...' : 'CRIAR CONTA'}
            </button>
          </form>
        )}

        <div className="mt-6 bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 text-center">
          <p className="text-neutral-500 text-xs">
            {mode === 'login' ? 'Primeiro acesso? Clique em "Criar Conta"' : 'Já tem conta? Clique em "Entrar"'}
          </p>
        </div>
      </div>
    </div>
  );
}
