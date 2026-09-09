import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import { Flame, LayoutDashboard, UtensilsCrossed, ShoppingCart, Wallet, Settings, Package, LogOut, Menu, X, TrendingUp, MessageSquare, MessageCircle, Radio, LayoutGrid, Users } from 'lucide-react';
import { Produtos } from './Produtos';
import { Balcao } from './Balcao';
import { Mesas } from './Mesas';
import { OfflineBanner } from '../OfflineBanner';
// Dashboard carrega o recharts (pesado); lazy-load para não onerar as demais telas.
const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })));
import { Pedidos } from './Pedidos';
import { Clientes } from './Clientes';
import { Financeiro } from './Financeiro';
import { Configuracoes } from './Configuracoes';
import { Estoque } from './Estoque';
import { IAWhatsApp } from './IAWhatsApp';
import { Monitoramento } from './Monitoramento';
import { WhatsAppPedidos } from './WhatsAppPedidos';
import { printReceipt } from '../../lib/print';
import type { Pedido, ItemPedido } from '../../types';

type Tab = 'dashboard' | 'produtos' | 'balcao' | 'mesas' | 'pedidos' | 'clientes' | 'financeiro' | 'estoque' | 'ia' | 'whatsapp' | 'monitoramento' | 'config';

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
    // "Pedidos" no topo conta só entregues — confirmado ainda não é uma venda finalizada.
    const numPedidos = valid.filter((p) => p.status === 'entregue').length;
    setDash({ lucro, faturamento, numPedidos });
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  // Auto-impressão central: qualquer pedido novo (Balcão, delivery ou site do
  // cliente) dispara a impressão sozinho em QUALQUER aba do Adm aberta com a
  // impressora Bluetooth conectada — geralmente o PC do caixa, mesmo que o
  // pedido tenha sido lançado de outro aparelho (ex: celular sem impressora).
  // Mesa fica de fora: ela já imprime comanda por comanda em MesaDetalhe.tsx
  // conforme os itens são lançados, e o pedido criado no fechamento da mesa
  // não deve gerar mais uma comanda de cozinha.
  useEffect(() => {
    if (!config) return;
    const channel = supabase
      .channel('auto-print-pedidos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        async (payload) => {
          const novoPedido = payload.new as Pedido;
          if (novoPedido.tipo === 'mesa') return;
          const { data: itensData } = await supabase.from('itens_pedido').select('*').eq('pedido_id', novoPedido.id);
          const pedidoCompleto = { ...novoPedido, itens: (itensData as ItemPedido[]) || [] };
          // Respeita a escolha de Cozinha/Caixa feita no Balcão ao criar o
          // pedido (colunas imprimir_cozinha/imprimir_caixa) — antes esse
          // listener sempre imprimia as duas juntas, ignorando o que a
          // usuária tinha marcado. Pedidos sem essas colunas (ex: site do
          // cliente, linhas antigas) mantêm o padrão de imprimir as duas.
          const querCozinha = novoPedido.imprimir_cozinha ?? true;
          const querCaixa = novoPedido.imprimir_caixa ?? true;
          // Aguarda uma impressão terminar antes de começar a outra — em
          // paralelo os dois envios de bytes se intercalariam no mesmo canal
          // Bluetooth e saem embaralhados na impressora.
          if (querCozinha) await printReceipt(pedidoCompleto, config, 'cozinha');
          if (querCaixa) await printReceipt(pedidoCompleto, config, 'caixa');
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [config]);

  // Agrupado por categoria (Visão Geral / Vendas / Gestão / Automação / Sistema)
  // — mesmos itens de sempre, só organizados em blocos em vez de lista solta.
  const navGroups: { titulo: string; itens: { id: Tab; label: string; icon: typeof LayoutDashboard }[] }[] = [
    {
      titulo: 'Visão Geral',
      itens: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      titulo: 'Vendas',
      itens: [
        { id: 'balcao', label: 'Balcão', icon: ShoppingCart },
        { id: 'mesas', label: 'Mesas', icon: LayoutGrid },
        { id: 'pedidos', label: 'Pedidos', icon: UtensilsCrossed },
        { id: 'clientes', label: 'Clientes', icon: Users },
        { id: 'produtos', label: 'Cardápio', icon: Flame },
      ],
    },
    {
      titulo: 'Gestão',
      itens: [
        { id: 'financeiro', label: 'Financeiro', icon: Wallet },
        { id: 'estoque', label: 'Estoque', icon: Package },
      ],
    },
    {
      titulo: 'Automação',
      itens: [
        { id: 'ia', label: 'Agente IA', icon: MessageSquare },
        { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
        { id: 'monitoramento', label: 'Monitoramento', icon: Radio },
      ],
    },
    {
      titulo: 'Sistema',
      itens: [{ id: 'config', label: 'Configurações', icon: Settings }],
    },
  ];

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <Dashboard meta={config?.meta_diaria || 2000} />;
      case 'produtos': return <Produtos />;
      case 'balcao': return <Balcao onOrderComplete={loadDashboard} />;
      case 'mesas': return <Mesas />;
      case 'pedidos': return <Pedidos />;
      case 'clientes': return <Clientes />;
      case 'financeiro': return <Financeiro />;
      case 'estoque': return <Estoque />;
      case 'ia': return <IAWhatsApp />;
      case 'whatsapp': return <WhatsAppPedidos />;
      case 'monitoramento': return <Monitoramento />;
      case 'config': return <Configuracoes />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col lg:flex-row">
      <OfflineBanner />
      {/* Mobile header with dashboard strip */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-neutral-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="ESSENZA" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-display font-bold text-neutral-900 text-lg">ESSENZA</span>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-neutral-900">
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
        w-64 bg-white border-r border-neutral-200 min-h-screen
      `}>
        <div className="p-6 hidden lg:block">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="ESSENZA" className="w-9 h-9 rounded-lg object-cover" />
            <div>
              <h1 className="font-display font-bold text-neutral-900 text-lg leading-none">ESSENZA</h1>
              <p className="text-neutral-500 text-[10px] tracking-[0.1em] uppercase mt-1">Pizza • Gestão</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
          {navGroups.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">{grupo.titulo}</p>
              <div className="space-y-0.5">
                {grupo.itens.map((item) => {
                  const ativo = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setTab(item.id); setSidebarOpen(false); }}
                      className={`relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg transition-colors text-left text-sm ${
                        ativo
                          ? 'bg-[#DCFCE7] text-[#16A34A] font-semibold'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 font-medium'
                      }`}
                    >
                      {ativo && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#16A34A]" />}
                      <item.icon size={18} className={ativo ? 'text-[#16A34A]' : 'text-neutral-400'} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-200">
          <div className="text-sm text-neutral-500 mb-2 px-2">
            {usuario?.nome}
            <span className="block text-xs text-neutral-400 capitalize">{usuario?.role}</span>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 transition-colors"
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden">
        {/* Desktop profit dashboard - always fixed at top */}
        <div className="hidden lg:block sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-neutral-200">
          <ProfitStrip dash={dash} />
        </div>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          <Suspense fallback={<div className="p-12 text-center text-neutral-500">Carregando...</div>}>
            {renderTab()}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function ProfitStrip({ dash }: { dash: DashboardData }) {
  // Lucro em verde quando positivo, vermelho quando negativo (prejuízo)
  const pos = dash.lucro >= 0;
  const tone = pos
    ? { bg: 'bg-green-500/10', icon: 'text-green-500', label: 'text-green-500/70', val: 'text-green-500' }
    : { bg: 'bg-red-500/10', icon: 'text-red-600', label: 'text-red-600/70', val: 'text-red-600' };
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 overflow-x-auto">
      <div className={`flex items-center gap-2 ${tone.bg} rounded-lg px-3 py-1.5 flex-shrink-0`}>
        <TrendingUp size={18} className={tone.icon} />
        <div>
          <p className={`text-[10px] ${tone.label} uppercase tracking-wide leading-none`}>Lucro do Dia</p>
          <p className={`${tone.val} font-bold text-base leading-tight`}>{brl(dash.lucro)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-neutral-200/50 rounded-lg px-3 py-1.5 flex-shrink-0">
        <div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wide leading-none">Faturamento</p>
          <p className="text-neutral-900 font-bold text-base leading-tight">{brl(dash.faturamento)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-neutral-200/50 rounded-lg px-3 py-1.5 flex-shrink-0">
        <div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wide leading-none">Pedidos</p>
          <p className="text-neutral-900 font-bold text-base leading-tight">{dash.numPedidos}</p>
        </div>
      </div>
    </div>
  );
}

