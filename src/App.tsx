import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './components/Login';
import { Adm } from './components/adm/Adm';
import { Cliente } from './components/Cliente';
import { UpdateBanner } from './components/UpdateBanner';
import { Flame, Lock } from 'lucide-react';

function AppInner() {
  const { usuario, loading } = useAuth();
  const [mode, setMode] = useState<'select' | 'adm' | 'cliente'>('select');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F1] flex items-center justify-center">
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

  // Selection screen — foco no cliente (é a tela que ele vê ao escanear o QR
  // code da mesa ou abrir o link); o acesso da equipe fica discreto no canto.
  return (
    <div className="min-h-screen bg-[#FAF7F1] flex flex-col items-center justify-center px-4 relative">
      <button
        onClick={() => setMode('adm')}
        className="absolute top-4 right-4 flex items-center gap-1.5 text-neutral-400 hover:text-neutral-700 text-xs font-medium px-3 py-2 rounded-lg hover:bg-neutral-100 transition-colors"
      >
        <Lock size={12} /> Equipe
      </button>

      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E50914] to-essenza-terracotta mb-4 shadow-lg shadow-red-900/20">
          <Flame size={28} className="text-white" />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-neutral-900">ESSENZA</h1>
        <p className="text-neutral-500 text-xs mt-2 tracking-[0.3em] uppercase">Pizza Napoletana</p>
        <div className="flex items-center justify-center gap-1 mt-3">
          <span className="w-5 h-1 rounded-full bg-essenza-italia-green" />
          <span className="w-5 h-1 rounded-full bg-neutral-300" />
          <span className="w-5 h-1 rounded-full bg-essenza-italia-red" />
        </div>
      </div>

      <div className="w-full max-w-sm">
        <button
          onClick={() => setMode('cliente')}
          className="group w-full bg-[#E50914] hover:bg-[#f6121d] text-white font-bold text-lg py-6 rounded-2xl transition-all hover:shadow-lg hover:shadow-red-900/20 hover:-translate-y-0.5 active:scale-95 flex flex-col items-center gap-1.5"
        >
          <Flame size={26} />
          <span>FAZER PEDIDO</span>
          <span className="text-xs font-normal opacity-80">Cardápio e entrega</span>
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
          <UpdateBanner />
        </ConfigProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
