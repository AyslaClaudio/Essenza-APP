import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './components/Login';
import { Adm } from './components/adm/Adm';
import { Cliente } from './components/Cliente';
import { Flame } from 'lucide-react';

function AppInner() {
  const { usuario, loading } = useAuth();
  const [mode, setMode] = useState<'select' | 'adm' | 'cliente'>('select');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="animate-pulse">
          <Flame size={48} className="text-[#E50914]" />
        </div>
      </div>
    );
  }

  // If logged in, show ADM
  if (usuario) {
    return <Adm />;
  }

  // Mode selection screen (not logged in)
  if (mode === 'adm') {
    return <Login />;
  }

  if (mode === 'cliente') {
    return <Cliente />;
  }

  // Selection screen
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-[#E50914] mb-4 shadow-2xl shadow-red-900/50">
          <Flame size={48} className="text-white" />
        </div>
        <h1 className="text-5xl font-black tracking-tight text-white">ESSENZA</h1>
        <p className="text-neutral-500 text-sm mt-2 tracking-[0.3em] uppercase">Pizzaria Artesanal</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => setMode('cliente')}
          className="w-full bg-[#E50914] hover:bg-[#f6121d] text-white font-bold text-xl py-6 rounded-2xl transition-all active:scale-95 flex flex-col items-center gap-2"
        >
          <Flame size={28} />
          <span>FAZER PEDIDO</span>
          <span className="text-xs font-normal opacity-70">Cardápio e entrega</span>
        </button>

        <button
          onClick={() => setMode('adm')}
          className="w-full bg-neutral-900 hover:bg-neutral-800 border border-essenza-dark-border text-white font-bold text-xl py-6 rounded-2xl transition-all active:scale-95 flex flex-col items-center gap-2"
        >
          <span>Painel Administrativo</span>
          <span className="text-xs font-normal text-neutral-500">Acesso restrito - funcionários</span>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ConfigProvider>
          <AppInner />
        </ConfigProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
