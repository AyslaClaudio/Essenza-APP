import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#EFE6D0] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="ESSENZA Pizzaria" className="w-28 h-auto mx-auto rounded-2xl shadow-lg shadow-black/20" />
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-neutral-500 text-sm mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3.5 text-neutral-900 text-lg focus:border-[#B5652E] focus:outline-none transition-colors"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-neutral-500 text-sm mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3.5 text-neutral-900 text-lg focus:border-[#B5652E] focus:outline-none transition-colors"
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#B5652E] hover:bg-[#f6121d] text-white font-bold text-lg py-4 rounded-xl transition-colors disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? 'Entrando...' : 'ENTRAR'}
          </button>
        </form>

        <div className="mt-6 bg-neutral-100/60 border border-neutral-200 rounded-xl p-4 text-center">
          <p className="text-neutral-500 text-xs">
            Contas novas são criadas por um gerente já logado, em Config &gt; Usuários.
          </p>
        </div>
      </div>
    </div>
  );
}
