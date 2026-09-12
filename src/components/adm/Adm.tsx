import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import { Flame, LayoutDashboard, UtensilsCrossed, ShoppingCart, Wallet, Settings, Package, LogOut, Menu, X, TrendingUp, MessageSquare, MessageCircle, Radio, LayoutGrid, Users, Search } from 'lucide-react';
import { OfflineBanner } from '../OfflineBanner';
// Cada aba carrega sob demanda, só quando é aberta pela primeira vez — antes
// tudo (Financeiro, Estoque, WhatsApp, IA, etc.) ia num bundle único carregado
// de cara no login, mesmo que a pessoa só use o Balcão o dia inteiro. Isso
// deixava a primeira tela lenta pra abrir e pesava no celular/tablet do caixa.
const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })));
const Produtos = lazy(() => import('./Produtos').then((m) => ({ default: m.Produtos })));
const Balcao = lazy(() => import('./Balcao').then((m) => ({ default: m.Balcao })));
const Mesas = lazy(() => import('./Mesas').then((m) => ({ default: m.Mesas })));
const Pedidos = lazy(() => import('./Pedidos').then((m) => ({ default: m.Pedidos })));
const Clientes = lazy(() => import('./Clientes').then((m) => ({ default: m.Clientes })));
const Financeiro = lazy(() => import('./Financeiro').then((m) => ({ default: m.Financeiro })));
const Configuracoes = lazy(() => import('./Configuracoes').then((m) => ({ default: m.Configuracoes })));
const Estoque = lazy(() => import('./Estoque').then((m) => ({ default: m.Estoque })));
const IAWhatsApp = lazy(() => import('./IAWhatsApp').then((m) => ({ default: m.IAWhatsApp })));
const Monitoramento = lazy(() => import('./Monitoramento').then((m) => ({ default: m.Monitoramento })));
const WhatsAppPedidos = lazy(() => import('./WhatsAppPedidos').then((m) => ({ default: m.WhatsAppPedidos })));
import { printReceipt } from '../../lib/print';
import type { Pedido, ItemPedido } from '../../types';

type Tab = 'dashboard' | 'produtos' | 'balcao' | 'mesas' | 'pedidos' | 'clientes' | 'financeiro' | 'estoque' | 'ia' | 'whatsapp' | 'monitoramento' | 'config';

interface DashboardData {
  lucro: number;
  faturamento: number;
  numPedidos: number;
}

interface BuscaResultado {
  tipo: 'produto' | 'cliente' | 'pedido';
  titulo: string;
  sub: string;
  tab: Tab;
  valor: string;
}

export function Adm() {
  const { usuario, signOut } = useAuth();
  const { config } = useConfig();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dash, setDash] = useState<DashboardData>({ lucro: 0, faturamento: 0, numPedidos: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Busca global do topo — um campo só pra achar produto, cliente ou pedido
  // sem trocar de aba manualmente. Ao clicar num resultado, troca de aba e
  // preenche a busca da tela de destino via `buscaAlvo` (prop `buscaInicial`).
  const [buscaGlobal, setBuscaGlobal] = useState('');
  const [buscaResultados, setBuscaResultados] = useState<BuscaResultado[]>([]);
  const [buscandoGlobal, setBuscandoGlobal] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [buscaMobileAberta, setBuscaMobileAberta] = useState(false);
  const [buscaAlvo, setBuscaAlvo] = useState<{ tab: Tab; valor: string; nonce: number } | null>(null);

  useEffect(() => {
    const termo = buscaGlobal.trim();
    if (termo.length < 2) {
      setBuscaResultados([]);
      setBuscandoGlobal(false);
      return;
    }
    setBuscandoGlobal(true);
    const handle = setTimeout(async () => {
      // Sanitiza pra não quebrar o filtro .ilike/.or() do PostgREST caso a
      // pessoa cole um telefone com parênteses/vírgula.
      const termoSanitizado = termo.replace(/[(),"*]/g, '');
      if (!termoSanitizado) { setBuscaResultados([]); setBuscandoGlobal(false); return; }
      const numerico = /^\d+$/.test(termoSanitizado);

      const [produtosRes, pedidosPorNomeRes, pedidosPorNumeroRes] = await Promise.all([
        supabase.from('produtos').select('id, nome').ilike('nome', `%${termoSanitizado}%`).limit(5),
        supabase
          .from('pedidos')
          .select('id, numero, cliente_nome, cliente_telefone')
          .ilike('cliente_nome', `%${termoSanitizado}%`)
          .order('created_at', { ascending: false })
          .limit(20),
        numerico
          ? supabase.from('pedidos').select('id, numero, cliente_nome').eq('numero', Number(termoSanitizado)).limit(5)
          : Promise.resolve({ data: [] as { id: string; numero: number; cliente_nome: string }[] }),
      ]);

      const resultados: BuscaResultado[] = [];
      for (const p of produtosRes.data || []) {
        resultados.push({ tipo: 'produto', titulo: p.nome, sub: 'Cardápio', tab: 'produtos', valor: p.nome });
      }
      const nomesVistos = new Set<string>();
      for (const p of (pedidosPorNomeRes.data || []) as { cliente_nome: string; cliente_telefone: string }[]) {
        const nome = (p.cliente_nome || '').trim();
        const chave = nome.toLowerCase();
        if (!nome || chave === 'consumidor' || nomesVistos.has(chave)) continue;
        nomesVistos.add(chave);
        resultados.push({ tipo: 'cliente', titulo: nome, sub: p.cliente_telefone || 'Cliente', tab: 'clientes', valor: nome });
        if (nomesVistos.size >= 5) break;
      }
      for (const p of (pedidosPorNumeroRes.data || []) as { numero: number; cliente_nome: string }[]) {
        resultados.push({ tipo: 'pedido', titulo: `Pedido #${p.numero}`, sub: p.cliente_nome || '', tab: 'pedidos', valor: String(p.numero) });
      }
      setBuscaResultados(resultados);
      setBuscandoGlobal(false);
    }, 350);
    return () => clearTimeout(handle);
  }, [buscaGlobal]);

  const selecionarResultado = (r: BuscaResultado) => {
    setTab(r.tab);
    setBuscaAlvo({ tab: r.tab, valor: r.valor, nonce: Date.now() });
    setBuscaGlobal('');
    setBuscaResultados([]);
    setBuscaAberta(false);
    setBuscaMobileAberta(false);
  };

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

  // Navegação mobile: barra inferior com os 4 mais usados + "Mais" abrindo um
  // painel com o resto do app — em vez do menu lateral em gaveta de antes.
  const BOTTOM_NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'balcao', label: 'Balcão', icon: ShoppingCart },
    { id: 'mesas', label: 'Mesas', icon: LayoutGrid },
    { id: 'pedidos', label: 'Pedidos', icon: UtensilsCrossed },
    { id: 'clientes', label: 'Clientes', icon: Users },
  ];
  const MAIS_ITENS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'produtos', label: 'Cardápio', icon: Flame },
    { id: 'financeiro', label: 'Financeiro', icon: Wallet },
    { id: 'estoque', label: 'Estoque', icon: Package },
    { id: 'ia', label: 'Agente IA', icon: MessageSquare },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'monitoramento', label: 'Monitoramento', icon: Radio },
    { id: 'config', label: 'Config', icon: Settings },
  ];
  const bottomNavAtivo = BOTTOM_NAV.some((i) => i.id === tab);

  const iconePorTipo = { produto: Flame, cliente: Users, pedido: UtensilsCrossed } as const;

  const renderResultadosBusca = () => (
    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
      {buscandoGlobal ? (
        <p className="text-neutral-500 text-sm text-center py-4">Buscando...</p>
      ) : buscaResultados.length === 0 ? (
        <p className="text-neutral-500 text-sm text-center py-4">Nenhum resultado pra "{buscaGlobal.trim()}"</p>
      ) : (
        buscaResultados.map((r, i) => {
          const Icone = iconePorTipo[r.tipo];
          return (
            <button
              key={`${r.tipo}-${r.valor}-${i}`}
              onClick={() => selecionarResultado(r)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FEE2E2] border-b border-neutral-100 last:border-b-0"
            >
              <Icone size={16} className="text-neutral-400 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-neutral-900 font-medium truncate">{r.titulo}</span>
                <span className="block text-xs text-neutral-500 truncate">{r.sub}</span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <Dashboard meta={config?.meta_diaria || 2000} />;
      case 'produtos': return <Produtos buscaInicial={buscaAlvo?.tab === 'produtos' ? buscaAlvo : undefined} />;
      case 'balcao': return <Balcao onOrderComplete={loadDashboard} />;
      case 'mesas': return <Mesas />;
      case 'pedidos': return <Pedidos buscaInicial={buscaAlvo?.tab === 'pedidos' ? buscaAlvo : undefined} />;
      case 'clientes': return <Clientes buscaInicial={buscaAlvo?.tab === 'clientes' ? buscaAlvo : undefined} />;
      case 'financeiro': return <Financeiro />;
      case 'estoque': return <Estoque />;
      case 'ia': return <IAWhatsApp />;
      case 'whatsapp': return <WhatsAppPedidos />;
      case 'monitoramento': return <Monitoramento />;
      case 'config': return <Configuracoes />;
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF6EF] flex flex-col lg:flex-row">
      <OfflineBanner />
      {/* Mobile header with dashboard strip — sem menu hambúrguer: a navegação
          mobile agora é a barra inferior fixa (ver fim do componente). */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-neutral-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="ESSENZA" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-display font-bold text-neutral-900 text-lg">ESSENZA</span>
          </div>
          <button
            onClick={() => setBuscaMobileAberta((v) => !v)}
            className="p-2 text-neutral-500 hover:text-[#B91C1C]"
            aria-label="Buscar"
          >
            <Search size={20} />
          </button>
        </div>
        {buscaMobileAberta && (
          <div className="relative px-4 pb-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                autoFocus
                value={buscaGlobal}
                onChange={(e) => setBuscaGlobal(e.target.value)}
                placeholder="Buscar produto, cliente ou pedido..."
                className="w-full bg-neutral-100 border border-neutral-200 rounded-xl pl-9 pr-3 py-2 text-sm text-neutral-900 focus:border-[#B91C1C] focus:outline-none"
              />
            </div>
            {buscaGlobal.trim().length >= 2 && renderResultadosBusca()}
          </div>
        )}
        {/* Profit strip always visible */}
        <ProfitStrip dash={dash} />
      </div>

      {/* Painel "Mais" (mobile) — sobe de baixo com o resto do app */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl p-5 pb-8 max-h-[75vh] overflow-y-auto">
            <div className="w-10 h-1 bg-neutral-300 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Menu</p>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-neutral-400 hover:text-neutral-900" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MAIS_ITENS.map((item) => {
                const ativo = tab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setTab(item.id); setSidebarOpen(false); }}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium ${
                      ativo ? 'bg-[#B91C1C] text-white' : 'text-neutral-600 hover:bg-[#FEE2E2]'
                    }`}
                  >
                    <item.icon size={20} className={ativo ? 'text-white' : 'text-neutral-400'} />
                    {item.label}
                  </button>
                );
              })}
              <button
                onClick={() => { setSidebarOpen(false); signOut(); }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium text-neutral-600 hover:bg-neutral-100"
              >
                <LogOut size={20} className="text-neutral-400" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar (desktop) */}
      <aside className="hidden lg:relative lg:flex lg:flex-col w-64 bg-white border-r border-neutral-200 min-h-screen">
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
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors text-left text-sm ${
                        ativo
                          ? 'bg-[#B91C1C] text-white font-semibold shadow-[0_4px_12px_rgba(185,28,28,0.25)]'
                          : 'text-neutral-600 hover:bg-[#FEE2E2] hover:text-[#26211E] font-medium'
                      }`}
                    >
                      <item.icon size={18} className={ativo ? 'text-white' : 'text-neutral-400'} />
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
          <div className="relative px-6 pt-4">
            <div className="relative max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={buscaGlobal}
                onChange={(e) => setBuscaGlobal(e.target.value)}
                onFocus={() => setBuscaAberta(true)}
                onBlur={() => setTimeout(() => setBuscaAberta(false), 150)}
                placeholder="Buscar produto, cliente ou pedido..."
                className="w-full bg-neutral-100 border border-neutral-200 rounded-xl pl-9 pr-3 py-2 text-sm text-neutral-900 focus:border-[#B91C1C] focus:outline-none"
              />
              {buscaAberta && buscaGlobal.trim().length >= 2 && renderResultadosBusca()}
            </div>
          </div>
          <ProfitStrip dash={dash} />
        </div>
        <div className="p-4 pb-20 lg:pb-6 lg:p-6 max-w-7xl mx-auto">
          <Suspense fallback={<div className="p-12 text-center text-neutral-500">Carregando...</div>}>
            {renderTab()}
          </Suspense>
        </div>
      </main>

      {/* Barra de navegação inferior (mobile) — Balcão/Mesas/Pedidos/Clientes
          sempre à mão, o resto do app fica atrás de "Mais". */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-neutral-200 flex pb-[env(safe-area-inset-bottom)]">
        {BOTTOM_NAV.map((item) => {
          const ativo = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5"
            >
              <item.icon size={20} className={ativo ? 'text-[#B91C1C]' : 'text-neutral-400'} />
              <span className={`text-[10px] ${ativo ? 'text-[#B91C1C] font-semibold' : 'text-neutral-500 font-medium'}`}>{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex-1 flex flex-col items-center gap-1 py-2.5"
        >
          <Menu size={20} className={bottomNavAtivo ? 'text-neutral-400' : 'text-[#B91C1C]'} />
          <span className={`text-[10px] font-medium ${bottomNavAtivo ? 'text-neutral-500' : 'text-[#B91C1C] font-semibold'}`}>Mais</span>
        </button>
      </nav>
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

