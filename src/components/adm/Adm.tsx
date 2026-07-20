import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import { Flame, LayoutDashboard, UtensilsCrossed, ShoppingCart, Wallet, Settings, Package, LogOut, Menu, X, TrendingUp, MessageSquare, Radio } from 'lucide-react';
import { Produtos } from './Produtos';
import { Balcao } from './Balcao';
import { Pedidos } from './Pedidos';
import { Financeiro } from './Financeiro';
import { Configuracoes } from './Configuracoes';
import { Estoque } from './Estoque';
import { IAWhatsApp } from './IAWhatsApp';
import { Monitoramento } from './Monitoramento';

type Tab = 'dashboard' | 'produtos' | 'balcao' | 'pedidos' | 'financeiro' | 'estoque' | 'ia' | 'monitoramento' | 'config';

interface DashboardData {
  lucro: number;
  faturamento: number;
  numPedidos: number;
}

export function Adm() {
  const { usuario, signOut } = useAuth();
  const { config } = useConfig();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dash, setDash] = useState<DashboardData>({ lucro: 0, faturamento: 0, numPedidos: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from('pedidos')
      .select('total, lucro, status, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .neq('status', 'cancelado');

    const valid = data || [];
    const faturamento = valid.reduce((s, p) => s + Number(p.total), 0);
    const lucro = valid.reduce((s, p) => s + Number(p.lucro), 0);
    setDash({ lucro, faturamento, numPedidos: valid.length });
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'balcao', label: 'Balcão', icon: ShoppingCart },
    { id: 'pedidos', label: 'Pedidos', icon: UtensilsCrossed },
    { id: 'produtos', label: 'Cardápio', icon: Flame },
    { id: 'financeiro', label: 'Financeiro', icon: Wallet },
    { id: 'estoque', label: 'Estoque', icon: Package },
    { id: 'ia', label: 'Agente de IA', icon: MessageSquare },
    { id: 'monitoramento', label: 'Monitoramento', icon: Radio },
    { id: 'config', label: 'Config', icon: Settings },
  ];

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <Dashboard data={dash} meta={config?.meta_diaria || 2000} onNavigate={setTab} />;
      case 'produtos': return <Produtos />;
      case 'balcao': return <Balcao onOrderComplete={loadDashboard} />;
      case 'pedidos': return <Pedidos />;
      case 'financeiro': return <Financeiro />;
      case 'estoque': return <Estoque />;
      case 'ia': return <IAWhatsApp />;
      case 'monitoramento': return <Monitoramento />;
      case 'config': return <Configuracoes />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col lg:flex-row">
      {/* Mobile header with dashboard strip */}
      <div className="lg:hidden sticky top-0 z-40 bg-[#141414] border-b border-essenza-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Flame size={24} className="text-[#E50914]" />
            <span className="font-black text-white text-lg">ESSENZA</span>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-white">
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {/* Profit strip always visible */}
        <ProfitStrip dash={dash} />
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`
        ${sidebarOpen ? 'fixed left-0 top-0 bottom-0 z-40' : 'hidden'} lg:relative lg:flex lg:flex-col
        w-64 bg-[#141414] border-r border-essenza-dark-border min-h-screen
      `}>
        <div className="p-6 hidden lg:block">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E50914] flex items-center justify-center">
              <Flame size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-white text-xl leading-none">ESSENZA</h1>
              <p className="text-neutral-500 text-xs tracking-widest uppercase mt-0.5">Pizzaria</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setTab(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left ${
                tab === item.id
                  ? 'bg-[#E50914] text-white font-semibold'
                  : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-white'
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-essenza-dark-border">
          <div className="text-sm text-neutral-400 mb-2 px-2">
            {usuario?.nome}
            <span className="block text-xs text-neutral-600 capitalize">{usuario?.role}</span>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden">
        {/* Desktop profit dashboard - always fixed at top */}
        <div className="hidden lg:block sticky top-0 z-20 bg-[#141414]/95 backdrop-blur border-b border-essenza-dark-border">
          <ProfitStrip dash={dash} />
        </div>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {renderTab()}
        </div>
      </main>
    </div>
  );
}

function ProfitStrip({ dash }: { dash: DashboardData }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 overflow-x-auto">
      <div className="flex items-center gap-2 bg-[#FFD700]/10 rounded-lg px-3 py-1.5 flex-shrink-0">
        <TrendingUp size={18} className="text-[#FFD700]" />
        <div>
          <p className="text-[10px] text-[#FFD700]/70 uppercase tracking-wide leading-none">Lucro do Dia</p>
          <p className="text-[#FFD700] font-bold text-base leading-tight">{brl(dash.lucro)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-neutral-800/50 rounded-lg px-3 py-1.5 flex-shrink-0">
        <div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wide leading-none">Faturamento</p>
          <p className="text-white font-bold text-base leading-tight">{brl(dash.faturamento)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-neutral-800/50 rounded-lg px-3 py-1.5 flex-shrink-0">
        <div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wide leading-none">Pedidos</p>
          <p className="text-white font-bold text-base leading-tight">{dash.numPedidos}</p>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ data, meta, onNavigate }: { data: DashboardData; meta: number; onNavigate: (t: Tab) => void }) {
  const pct = meta > 0 ? Math.min((data.faturamento / meta) * 100, 100) : 0;
  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-2xl font-bold text-white">Visão Geral</h2>

      {/* Big cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-[#FFD700]/20 to-[#FFD700]/5 border border-[#FFD700]/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="text-[#FFD700]" size={24} />
            <span className="text-[#FFD700]/70 text-sm uppercase tracking-wide">Lucro do Dia</span>
          </div>
          <p className="text-[#FFD700] font-black text-4xl">{brl(data.lucro)}</p>
        </div>
        <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6">
          <span className="text-neutral-500 text-sm uppercase tracking-wide">Faturamento</span>
          <p className="text-white font-black text-4xl mt-2">{brl(data.faturamento)}</p>
        </div>
        <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6">
          <span className="text-neutral-500 text-sm uppercase tracking-wide">Pedidos Hoje</span>
          <p className="text-white font-black text-4xl mt-2">{data.numPedidos}</p>
        </div>
      </div>

      {/* Meta progress */}
      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-neutral-400 text-sm">Meta do Dia</span>
          <span className="text-white font-semibold">{brl(data.faturamento)} / {brl(meta)}</span>
        </div>
        <div className="h-4 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#E50914] to-[#FFD700] rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-neutral-500 text-sm mt-2">
          {pct < 100 ? `Faltam ${brl(meta - data.faturamento)}` : 'Meta atingida!'}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickAction icon={ShoppingCart} label="Novo Pedido" onClick={() => onNavigate('balcao')} />
        <QuickAction icon={UtensilsCrossed} label="Ver Pedidos" onClick={() => onNavigate('pedidos')} />
        <QuickAction icon={Flame} label="Cardápio" onClick={() => onNavigate('produtos')} />
        <QuickAction icon={Wallet} label="Financeiro" onClick={() => onNavigate('financeiro')} />
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof LayoutDashboard; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6 hover:border-[#E50914] transition-colors active:scale-95"
    >
      <Icon size={28} className="text-[#E50914]" />
      <span className="text-white font-medium text-sm">{label}</span>
    </button>
  );
}
