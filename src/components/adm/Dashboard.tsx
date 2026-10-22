import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  addDays, dateTimeToISO, dateToISO,
} from '../../lib/dateUtils';
import { calcularFinanceiroBase, calcularMargem, calcularReceitaPorOrigem } from '../../lib/reportUtils';
import { buscarFaturamentoPeriodo } from '../../lib/financeQueries';
import {
  TrendingUp, TrendingDown, DollarSign, Receipt, ShoppingBag, RefreshCw, ChefHat, LayoutGrid, Bluetooth, BluetoothConnected, AlertTriangle,
  Calendar, PieChart as PieIcon, Trophy, Clock, Bell, X, Users,
} from 'lucide-react';
import { conectarImpressora, nomeImpressora, observarStatusImpressora, reconectarImpressoraSalva, statusImpressora, suportado as bluetoothSuportado } from '../../lib/bluetoothPrinter';
import { buscarCustosOperacionais, type CustoOperacionalEntry } from '../../lib/custosOperacionais';
import { GraficoTendencia, type BucketTendencia } from './dashboard/GraficoTendencia';
import { GraficoTopSabores, type SaborTop } from './dashboard/GraficoTopSabores';
import { MetaProgresso } from './dashboard/MetaProgresso';
import { InsightIA } from './dashboard/InsightIA';
import { ContagemMassas } from './dashboard/ContagemMassas';

type Filtro = 'hoje' | '7dias' | '30dias' | 'mes' | '3meses' | '6meses' | 'custom';

interface Agregado {
  faturamento: number;
  lucro: number;
  custo: number;
  num: number;
  vendaProdutos: number;
  taxaEntrega: number;
}

interface Operacao {
  pedidosBalcao: number;
  pedidosDelivery: number;
  mesasOcupadas: number;
  mesasTotal: number;
}

interface StatusCount {
  entregue: number;
  emAndamento: number;
  cancelado: number;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function pctChange(cur: number, prev: number): number {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

// Intervalos [atual, anterior] conforme o filtro. O período anterior tem o
// mesmo tamanho e fica imediatamente antes — pra comparação de %.
function intervalos(filtro: Filtro, customIni: string, customFim: string): { ini: Date; fim: Date; iniPrev: Date; fimPrev: Date; labelPrev: string } {
  const hoje = new Date();

  if (filtro === 'hoje') {
    return {
      ini: startOfDay(hoje), fim: endOfDay(hoje),
      iniPrev: startOfDay(addDays(hoje, -1)), fimPrev: endOfDay(addDays(hoje, -1)),
      labelPrev: 'vs ontem',
    };
  }
  if (filtro === 'mes') {
    const ini = startOfMonth(hoje);
    return {
      ini, fim: endOfMonth(hoje),
      iniPrev: startOfMonth(addDays(ini, -1)), fimPrev: endOfMonth(addDays(ini, -1)),
      labelPrev: 'vs mês passado',
    };
  }

  // Faixas por nº de dias (7d, 30d, 3m, 6m, custom)
  let ini: Date, fim: Date, label: string;
  if (filtro === 'custom') {
    ini = startOfDay(new Date(`${customIni}T00:00:00`));
    fim = endOfDay(new Date(`${customFim}T00:00:00`));
    label = 'vs período anterior';
  } else {
    const dias = filtro === '7dias' ? 7 : filtro === '30dias' ? 30 : filtro === '3meses' ? 90 : 180;
    ini = startOfDay(addDays(hoje, -(dias - 1)));
    fim = endOfDay(hoje);
    label = `vs ${dias} dias anteriores`;
  }
  const spanMs = fim.getTime() - ini.getTime();
  const fimPrev = new Date(ini.getTime() - 1);
  const iniPrev = new Date(fimPrev.getTime() - spanMs);
  return { ini, fim, iniPrev, fimPrev, labelPrev: label };
}

function agregar(rows: any[]): Agregado {
  const { faturamento, custoTotal, lucroTotal } = calcularFinanceiroBase(rows);
  const { vendaProdutos, taxaEntrega } = calcularReceitaPorOrigem(rows);
  return {
    faturamento,
    lucro: lucroTotal,
    custo: custoTotal,
    num: rows.filter((p) => p.status === 'entregue').length,
    vendaProdutos,
    taxaEntrega,
  };
}

// Divide o período em "baldes" — por dia se o período for curto (≤ 45 dias),
// por mês se for longo. Série de Faturamento vs Despesas (custo dos produtos
// dos pedidos + saídas de caixa / custos operacionais lançados no período).
function bucketize(pedidos: any[], saidasCaixa: any[], ini: Date, fim: Date): BucketTendencia[] {
  const spanDias = Math.round((fim.getTime() - ini.getTime()) / 86400000);
  const porMes = spanDias > 45;
  const mapa = new Map<string, BucketTendencia>();
  const chaveDe = (d: Date) => porMes
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    : dateToISO(d);

  if (porMes) {
    const cursor = new Date(ini.getFullYear(), ini.getMonth(), 1);
    while (cursor <= fim) {
      mapa.set(chaveDe(cursor), { label: `${MESES[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, faturamento: 0, despesas: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    for (let d = new Date(ini); d <= fim; d = addDays(d, 1)) {
      mapa.set(chaveDe(d), { label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), faturamento: 0, despesas: 0 });
    }
  }

  pedidos.forEach((p) => {
    const b = mapa.get(chaveDe(new Date(p.created_at)));
    if (b) { b.faturamento += Number(p.total || 0); b.despesas += Number(p.custo_total || 0); }
  });
  saidasCaixa.forEach((s) => {
    // caixa.data é 'YYYY-MM-DD' — trata como data local pra cair no balde certo
    const b = mapa.get(chaveDe(new Date(`${s.data}T12:00:00`)));
    if (b) b.despesas += Number(s.valor || 0);
  });
  return [...mapa.values()];
}

function ResumoItem({ label, valor, cor }: { label: string; valor: number; cor?: string }) {
  return (
    <div>
      <p className="text-[#8A8A8A] text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-bold text-lg ${cor || 'text-[#26211E]'}`}>{brl(valor)}</p>
    </div>
  );
}

function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2 || valores.every((v) => v === 0)) return null;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const range = max - min || 1;
  const pontos = valores
    .map((v, i) => `${(i / (valores.length - 1)) * 100},${24 - ((v - min) / range) * 22 - 1}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-16 h-6">
      <polyline points={pontos} fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FILTRO_LABELS: Record<Filtro, string> = {
  hoje: 'Hoje', '7dias': '7 dias', '30dias': '30 dias', mes: 'Este mês',
  '3meses': '3 meses', '6meses': '6 meses', custom: 'Personalizado',
};

const CAT_CORES = ['#B91C1C', '#22C55E', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6'];

export function Dashboard({ meta }: { meta: number }) {
  const { config } = useConfig();
  const [filtro, setFiltro] = useState<Filtro>('hoje');
  const [showCustom, setShowCustom] = useState(false);
  const [customIni, setCustomIni] = useState(dateToISO(addDays(new Date(), -30)));
  const [customFim, setCustomFim] = useState(dateToISO(new Date()));
  const [loading, setLoading] = useState(true);

  const [atual, setAtual] = useState<Agregado>({ faturamento: 0, lucro: 0, custo: 0, num: 0, vendaProdutos: 0, taxaEntrega: 0 });
  const [anterior, setAnterior] = useState<Agregado>({ faturamento: 0, lucro: 0, custo: 0, num: 0, vendaProdutos: 0, taxaEntrega: 0 });
  const [labelPrev, setLabelPrev] = useState('vs ontem');
  const [tendencia, setTendencia] = useState<BucketTendencia[]>([]);
  const [topSabores, setTopSabores] = useState<SaborTop[]>([]);
  const [porCategoria, setPorCategoria] = useState<{ categoria: string; qtd: number; pct: number }[]>([]);
  const [status, setStatus] = useState<StatusCount>({ entregue: 0, emAndamento: 0, cancelado: 0 });
  const [novosClientes, setNovosClientes] = useState(0);
  const [faturamentoHoje, setFaturamentoHoje] = useState(0);
  const [formaPagamentoDominante, setFormaPagamentoDominante] = useState<{ forma: string; pct: number } | null>(null);
  const [operacao, setOperacao] = useState<Operacao>({ pedidosBalcao: 0, pedidosDelivery: 0, mesasOcupadas: 0, mesasTotal: 0 });
  const [produtoCat, setProdutoCat] = useState<Record<string, string>>({});
  const [primeiraCompra, setPrimeiraCompra] = useState<Record<string, string>>({});
  const [custosOperacionais, setCustosOperacionais] = useState<CustoOperacionalEntry[]>([]);

  // Dados que não dependem do período — carregados uma vez.
  useEffect(() => {
    (async () => {
      const { data: prods } = await supabase.from('produtos').select('id, categoria_nome');
      const cat: Record<string, string> = {};
      (prods || []).forEach((p: any) => { cat[p.id] = p.categoria_nome; });
      setProdutoCat(cat);

      const { data: todos } = await supabase
        .from('pedidos')
        .select('cliente_nome, created_at')
        .neq('status', 'cancelado')
        .order('created_at', { ascending: true });
      const pc: Record<string, string> = {};
      (todos || []).forEach((p: any) => {
        const n = (p.cliente_nome || '').trim().toLowerCase();
        if (n && n !== 'consumidor' && !pc[n]) pc[n] = p.created_at;
      });
      setPrimeiraCompra(pc);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { ini, fim, iniPrev, fimPrev, labelPrev } = intervalos(filtro, customIni, customFim);
    setLabelPrev(labelPrev);

    const [{ data: rows }, custosOp] = await Promise.all([
      supabase
        .from('pedidos')
        .select('id, total, lucro, custo_total, subtotal, taxa_entrega, status, forma_pagamento, created_at, cliente_nome')
        .gte('created_at', dateTimeToISO(ini))
        .lte('created_at', dateTimeToISO(fim))
        .neq('status', 'cancelado'),
      // Custos operacionais no período — mesma fonte usada em Financeiro >
      // Relatórios (Lucro Líquido) e na tela Custos Operacionais, pra evitar
      // as 3 telas mostrarem despesa diferente pro mesmo período.
      buscarCustosOperacionais(ini, fim),
    ]);
    const pedidos = rows || [];
    setAtual(agregar(pedidos));
    setTendencia(bucketize(pedidos, custosOp.entries, ini, fim));
    setCustosOperacionais(custosOp.entries);

    // Forma de pagamento dominante
    const formaCount = new Map<string, number>();
    pedidos.forEach((p: any) => formaCount.set(p.forma_pagamento || 'Não informado', (formaCount.get(p.forma_pagamento || 'Não informado') || 0) + 1));
    if (formaCount.size > 0 && pedidos.length > 0) {
      const [forma, count] = [...formaCount.entries()].sort((a, b) => b[1] - a[1])[0];
      setFormaPagamentoDominante({ forma, pct: (count / pedidos.length) * 100 });
    } else setFormaPagamentoDominante(null);

    // Clientes novos no período (primeira compra caiu dentro do período)
    const iniISO = dateTimeToISO(ini), fimISO = dateTimeToISO(fim);
    const novos = new Set<string>();
    pedidos.forEach((p: any) => {
      const n = (p.cliente_nome || '').trim().toLowerCase();
      if (!n || n === 'consumidor') return;
      const primeira = primeiraCompra[n];
      if (primeira && primeira >= iniISO && primeira <= fimISO) novos.add(n);
    });
    setNovosClientes(novos.size);

    // Período anterior (só pro %)
    const { data: rowsPrev } = await supabase
      .from('pedidos')
      .select('total, lucro, custo_total, subtotal, taxa_entrega, status')
      .gte('created_at', dateTimeToISO(iniPrev))
      .lte('created_at', dateTimeToISO(fimPrev))
      .neq('status', 'cancelado');
    setAnterior(agregar(rowsPrev || []));

    // Status dos pedidos no período (inclui cancelado) — só os 3 estados reais.
    const { data: rowsStatus } = await supabase
      .from('pedidos')
      .select('status')
      .gte('created_at', dateTimeToISO(ini))
      .lte('created_at', dateTimeToISO(fim));
    const st = rowsStatus || [];
    setStatus({
      entregue: st.filter((p: any) => p.status === 'entregue').length,
      emAndamento: st.filter((p: any) => p.status === 'confirmado').length,
      cancelado: st.filter((p: any) => p.status === 'cancelado').length,
    });

    // Faturamento de hoje (pra meta diária, independente do filtro)
    if (filtro === 'hoje') {
      setFaturamentoHoje(agregar(pedidos).faturamento);
    } else {
      setFaturamentoHoje(await buscarFaturamentoPeriodo(startOfDay(new Date()), endOfDay(new Date())));
    }

    // Itens do período → top sabores + categorias
    const ids = pedidos.map((p) => p.id);
    if (ids.length > 0) {
      const { data: itens } = await supabase
        .from('itens_pedido')
        .select('produto_id, produto_nome, sabor1, sabor2, quantidade, preco_unitario, adicional_preco')
        .in('pedido_id', ids);

      const mapa = new Map<string, SaborTop>();
      const add = (nome: string, qtd: number, valor: number) => {
        if (!nome) return;
        const cur = mapa.get(nome) || { nome, quantidade: 0, valor: 0 };
        cur.quantidade += qtd; cur.valor += valor;
        mapa.set(nome, cur);
      };
      const catMapa = new Map<string, number>();
      (itens || []).forEach((it: any) => {
        const q = Number(it.quantidade || 1);
        const lineValue = q * (Number(it.preco_unitario || 0) + Number(it.adicional_preco || 0));
        if (it.sabor1 && it.sabor2) { add(it.sabor1, q, lineValue / 2); add(it.sabor2, q, lineValue / 2); }
        else add(it.sabor1 || it.produto_nome, q, lineValue);
        const cat = (it.produto_id && produtoCat[it.produto_id]) || 'Outros';
        catMapa.set(cat, (catMapa.get(cat) || 0) + q);
      });
      setTopSabores([...mapa.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5));

      const totalQtd = [...catMapa.values()].reduce((s, v) => s + v, 0) || 1;
      setPorCategoria([...catMapa.entries()]
        .map(([categoria, qtd]) => ({ categoria, qtd, pct: (qtd / totalQtd) * 100 }))
        .sort((a, b) => b.qtd - a.qtd));
    } else {
      setTopSabores([]);
      setPorCategoria([]);
    }

    // Operação agora
    const [{ data: pedidosAndamento }, { data: mesasData }] = await Promise.all([
      supabase.from('pedidos').select('tipo').eq('status', 'confirmado'),
      supabase.from('mesas').select('status'),
    ]);
    const andamento = pedidosAndamento || [];
    const mesas = mesasData || [];
    setOperacao({
      pedidosBalcao: andamento.filter((p: any) => p.tipo === 'balcao' || p.tipo === 'mesa').length,
      pedidosDelivery: andamento.filter((p: any) => p.tipo === 'delivery' || p.tipo === 'cliente').length,
      mesasOcupadas: mesas.filter((m: any) => m.status !== 'livre').length,
      mesasTotal: mesas.length,
    });

    setLoading(false);
  }, [filtro, customIni, customFim, produtoCat, primeiraCompra]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  // Mantém a última impressora autorizada pelo Chrome sendo procurada em
  // segundo plano. Quando ela é ligada novamente, o GATT reconecta sem exigir
  // que a atendente volte às Configurações.
  useEffect(() => {
    const sincronizar = () => setTimeout(() => setStatusPrinter(statusImpressora()), 0);
    const tentarReconectar = () => { void reconectarImpressoraSalva().then(() => setStatusPrinter(statusImpressora())); };
    sincronizar();
    const cancelar = observarStatusImpressora(() => setStatusPrinter(statusImpressora()));
    const intervalo = window.setInterval(tentarReconectar, 12000);
    window.addEventListener('focus', tentarReconectar);
    document.addEventListener('visibilitychange', tentarReconectar);
    tentarReconectar();
    return () => {
      cancelar();
      window.clearInterval(intervalo);
      window.removeEventListener('focus', tentarReconectar);
      document.removeEventListener('visibilitychange', tentarReconectar);
    };
  }, []);

  const ticketMedio = atual.num > 0 ? atual.faturamento / atual.num : 0;
  const ticketMedioPrev = anterior.num > 0 ? anterior.faturamento / anterior.num : 0;
  const margem = calcularMargem(atual.lucro, atual.faturamento);
  const sparkValores = tendencia.map((d) => d.faturamento);
  const totalStatus = status.entregue + status.emAndamento + status.cancelado || 1;

  const cards = [
    { label: 'Faturamento', valor: brl(atual.faturamento), pct: pctChange(atual.faturamento, anterior.faturamento), icon: DollarSign, sparkline: true },
    { label: 'Pedidos', valor: String(atual.num), pct: pctChange(atual.num, anterior.num), icon: ShoppingBag, sparkline: false },
    { label: 'Clientes Novos', valor: String(novosClientes), pct: 0, icon: TrendingUp, sparkline: false, semPct: true },
    { label: 'Ticket Médio', valor: brl(ticketMedio), pct: pctChange(ticketMedio, ticketMedioPrev), icon: Receipt, sparkline: false },
  ];

  const topSabor = topSabores[0] || null;
  const rangeLabel = (() => {
    const { ini, fim } = intervalos(filtro, customIni, customFim);
    const a = ini.toLocaleDateString('pt-BR'), b = fim.toLocaleDateString('pt-BR');
    return a === b ? a : `${a} – ${b}`;
  })();

  return (
    <div className="space-y-5 animate-fadeIn max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#26211E] flex items-center gap-2">
            Dashboard
            {loading && <RefreshCw size={15} className="animate-spin text-[#B91C1C]" />}
          </h2>
          <p className="text-[#8A8A8A] text-sm mt-1">
            Olá, {config?.nome_loja || 'Essenza'} 👋 Aqui está o desempenho da sua operação. Pra análise a fundo com período livre, use o <b className="text-[#26211E] font-medium">Financeiro → Relatórios</b>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden sm:flex items-center gap-1.5 text-[#8A8A8A] text-xs bg-white border border-[#EFE9E0] rounded-full px-3 py-1.5">
            <Calendar size={13} /> {rangeLabel}
          </span>
          <div className="flex bg-white p-1 rounded-full border border-[#EFE9E0] flex-wrap">
            {(['hoje', '7dias', '30dias', 'mes', '3meses', '6meses'] as Filtro[]).map((f) => (
              <button
                key={f}
                onClick={() => { setFiltro(f); setShowCustom(false); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filtro === f ? 'bg-[#B91C1C] text-white' : 'text-[#8A8A8A] hover:text-[#26211E]'
                }`}
              >
                {FILTRO_LABELS[f]}
              </button>
            ))}
            <button
              onClick={() => setShowCustom((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                filtro === 'custom' ? 'bg-[#B91C1C] text-white' : 'text-[#8A8A8A] hover:text-[#26211E]'
              }`}
            >
              <Calendar size={12} /> Personalizado
            </button>
          </div>
        </div>
      </div>

      {/* Contagem de massas do dia */}
      <ContagemMassas />

      <PrinterStatusWidget />

      <PedidosAoVivo />

      {showCustom && (
        <div className="bg-white border border-[#EFE9E0] rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[#8A8A8A] text-xs mb-1">De</label>
            <input type="date" value={customIni} max={customFim} onChange={(e) => setCustomIni(e.target.value)}
              className="bg-[#FBF6EF] border border-[#EFE9E0] rounded-lg px-3 py-2 text-sm text-[#26211E] focus:border-[#B91C1C] focus:outline-none" />
          </div>
          <div>
            <label className="block text-[#8A8A8A] text-xs mb-1">Até</label>
            <input type="date" value={customFim} min={customIni} max={dateToISO(new Date())} onChange={(e) => setCustomFim(e.target.value)}
              className="bg-[#FBF6EF] border border-[#EFE9E0] rounded-lg px-3 py-2 text-sm text-[#26211E] focus:border-[#B91C1C] focus:outline-none" />
          </div>
          <button onClick={() => { setFiltro('custom'); setShowCustom(false); }}
            className="bg-[#B91C1C] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#991B1B]">
            Aplicar
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const subiu = c.pct >= 0;
          return (
            <div key={c.label} className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
                  <c.icon size={17} className="text-[#B91C1C]" />
                </div>
                {c.sparkline && <Sparkline valores={sparkValores} />}
              </div>
              <span className="text-[#8A8A8A] text-xs uppercase tracking-wide">{c.label}</span>
              <p className="font-semibold text-2xl text-[#26211E] tabular-nums mt-0.5">{c.valor}</p>
              {c.semPct ? (
                <p className="text-xs mt-2 text-[#a3a3a3]">no período</p>
              ) : (
                <div className={`flex items-center gap-1 text-xs mt-2 font-medium ${subiu ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                  {subiu ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(c.pct).toFixed(1)}% <span className="text-[#a3a3a3] font-normal">{labelPrev}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tendência + Pedidos por Categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
        <div className="lg:col-span-6">
          <GraficoTendencia data={tendencia} />
        </div>
        <div className="lg:col-span-4">
          <div className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)] h-full">
            <div className="flex items-center gap-2 mb-4">
              <PieIcon size={16} className="text-[#B91C1C]" />
              <h3 className="text-[#26211E] font-semibold">Pedidos por Categoria</h3>
            </div>
            {porCategoria.length === 0 ? (
              <p className="text-[#8A8A8A] text-sm text-center py-12">Sem itens no período.</p>
            ) : (
              <div className="space-y-3">
                {porCategoria.map((c, i) => (
                  <div key={c.categoria}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#26211E] flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CAT_CORES[i % CAT_CORES.length] }} />
                        {c.categoria}
                      </span>
                      <span className="text-[#8A8A8A]">{c.qtd} <span className="text-[#c4c0b8]">· {c.pct.toFixed(0)}%</span></span>
                    </div>
                    <div className="h-2 bg-[#FBF6EF] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: CAT_CORES[i % CAT_CORES.length] }} />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-[#8A8A8A] pt-1 flex items-center gap-1.5">
                  <Trophy size={13} className="text-[#F59E0B]" />
                  <b className="text-[#26211E] font-medium">{porCategoria[0].categoria}</b> é a categoria mais pedida.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top vendidos + Status + Resumo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GraficoTopSabores data={topSabores} />

        <div className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
          <h3 className="text-[#26211E] font-semibold mb-4">Status dos Pedidos</h3>
          <div className="space-y-3">
            {[
              { label: 'Entregues', valor: status.entregue, cor: '#22C55E' },
              { label: 'Em andamento', valor: status.emAndamento, cor: '#F59E0B' },
              { label: 'Cancelados', valor: status.cancelado, cor: '#EF4444' },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#8A8A8A]">{s.label}</span>
                  <span className="font-medium text-[#26211E]">{s.valor} <span className="text-[#c4c0b8]">· {((s.valor / totalStatus) * 100).toFixed(0)}%</span></span>
                </div>
                <div className="h-2 bg-[#FBF6EF] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(s.valor / totalStatus) * 100}%`, backgroundColor: s.cor }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
          <h3 className="text-[#26211E] font-semibold mb-4">Resumo do Período</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <TrendingUp size={15} className="text-[#22C55E] mt-0.5 shrink-0" />
              <span className="text-[#8A8A8A]">Faturamento <b className={`font-medium ${atual.faturamento >= anterior.faturamento ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>{pctChange(atual.faturamento, anterior.faturamento).toFixed(1)}%</b> {labelPrev}</span>
            </li>
            <li className="flex items-start gap-2">
              <DollarSign size={15} className="text-[#3B82F6] mt-0.5 shrink-0" />
              <span className="text-[#8A8A8A]">Venda de produtos <b className="text-[#26211E] font-medium">{brl(atual.vendaProdutos)}</b> · Taxa de entrega <b className="text-[#26211E] font-medium">{brl(atual.taxaEntrega)}</b></span>
            </li>
            {topSabor && (
              <li className="flex items-start gap-2">
                <Trophy size={15} className="text-[#F59E0B] mt-0.5 shrink-0" />
                <span className="text-[#8A8A8A]">Mais vendido: <b className="text-[#26211E] font-medium">{topSabor.nome}</b> ({topSabor.quantidade}x)</span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <Receipt size={15} className="text-[#B91C1C] mt-0.5 shrink-0" />
              <span className="text-[#8A8A8A]">Margem de lucro: <b className="text-[#26211E] font-medium">{margem.toFixed(0)}%</b></span>
            </li>
            {formaPagamentoDominante && (
              <li className="flex items-start gap-2">
                <Clock size={15} className="text-[#3B82F6] mt-0.5 shrink-0" />
                <span className="text-[#8A8A8A]"><b className="text-[#26211E] font-medium">{formaPagamentoDominante.pct.toFixed(0)}%</b> dos pagamentos em {formaPagamentoDominante.forma}</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* DRE resumido do período + custos operacionais um por um — antes só
          existia um número de "Despesas" dentro do gráfico de tendência, sem
          nenhum jeito de ver o que compunha esse número (custo de produto x
          custo operacional) nem qual lançamento específico entrava na conta. */}
      <div className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
        <h3 className="text-[#26211E] font-semibold mb-4">Faturamento, Custos e Lucro do Período</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <ResumoItem label="Faturamento" valor={atual.faturamento} />
          <ResumoItem label="Venda Produtos" valor={atual.vendaProdutos} />
          <ResumoItem label="Taxa Entrega" valor={atual.taxaEntrega} cor="text-blue-600" />
          <ResumoItem label="Custo Produtos" valor={atual.custo} cor="text-orange-600" />
          <ResumoItem label="Custos Operacionais" valor={custosOperacionais.reduce((s, e) => s + Number(e.valor), 0)} cor="text-orange-600" />
          <ResumoItem label="Lucro" valor={atual.lucro} cor={atual.lucro >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'} />
        </div>
        <p className="text-[#8A8A8A] text-xs font-semibold uppercase tracking-wide mb-2">Custos Operacionais lançados no período</p>
        {custosOperacionais.length === 0 ? (
          <p className="text-[#8A8A8A] text-sm">Nenhum custo operacional lançado neste período.</p>
        ) : (
          <div className="space-y-1.5">
            {custosOperacionais.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-[#EFE9E0] last:border-0 pb-1.5 last:pb-0">
                <span className="text-[#26211E]">{e.descricao}</span>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-[#8A8A8A] text-xs">{new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR')}</span>
                  <span className="text-orange-600 font-semibold w-20 text-right">{brl(e.valor)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Insights */}
      <InsightIA
        margem={margem}
        ticketMedio={ticketMedio}
        faturamento={atual.faturamento}
        faturamentoAnterior={anterior.faturamento}
        meta={meta}
        seteDias={tendencia.map((t) => ({ dia: t.label, label: t.label, valor: t.faturamento }))}
        topSabor={topSabor}
        formaPagamentoDominante={formaPagamentoDominante}
      />

      {/* Meta do dia */}
      <MetaProgresso faturamento={faturamentoHoje} meta={meta} />

      {/* Margem + Operação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#EFE9E0] rounded-2xl p-6 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
          <h3 className="text-[#26211E] font-semibold mb-5">Margem de Lucro</h3>
          <div className="flex items-center gap-6">
            <div className="shrink-0">
              <p className="text-4xl font-semibold text-[#22C55E] tabular-nums">{margem.toFixed(0)}%</p>
              <p className="text-[#8A8A8A] text-xs mt-1">do faturamento vira lucro</p>
            </div>
            <div className="flex-1 space-y-3">
              {[
                { label: 'Receita', valor: atual.faturamento, cor: '#B91C1C' },
                { label: 'Custos', valor: atual.custo, cor: '#EF4444' },
                { label: 'Lucro', valor: atual.lucro, cor: '#22C55E' },
              ].map((linha) => (
                <div key={linha.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[#8A8A8A]">{linha.label}</span>
                    <span className="font-medium text-[#26211E]">{brl(linha.valor)}</span>
                  </div>
                  <div className="h-2 bg-[#FBF6EF] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${atual.faturamento > 0 ? Math.min(100, (linha.valor / atual.faturamento) * 100) : 0}%`, backgroundColor: linha.cor }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#EFE9E0] rounded-2xl p-6 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
          <h3 className="text-[#26211E] font-semibold mb-4">Operação Agora</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FEE2E2] flex items-center justify-center shrink-0"><ChefHat size={18} className="text-[#B91C1C]" /></div>
              <div><p className="text-[#26211E] font-semibold text-lg leading-none">{operacao.pedidosBalcao}</p><p className="text-[#8A8A8A] text-xs mt-1">Balcão/mesa em andamento</p></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><ShoppingBag size={18} className="text-[#F59E0B]" /></div>
              <div><p className="text-[#26211E] font-semibold text-lg leading-none">{operacao.pedidosDelivery}</p><p className="text-[#8A8A8A] text-xs mt-1">Entrega em andamento</p></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><LayoutGrid size={18} className="text-blue-600" /></div>
              <div><p className="text-[#26211E] font-semibold text-lg leading-none">{operacao.mesasOcupadas} / {operacao.mesasTotal}</p><p className="text-[#8A8A8A] text-xs mt-1">Mesas ocupadas</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function setStatusPrinter(_status: ReturnType<typeof statusImpressora>) {
  // O estado visual é atualizado pelo próprio widget; esta função existe para
  // evitar que o polling do Dashboard force recarregamentos dos indicadores.
  window.dispatchEvent(new CustomEvent('essenza-printer-status', { detail: _status }));
}

function PrinterStatusWidget() {
  const [status, setStatus] = useState<ReturnType<typeof statusImpressora>>(statusImpressora());
  const [nome, setNome] = useState(nomeImpressora());
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const atualizar = () => { setStatus(statusImpressora()); setNome(nomeImpressora()); };
    const cancelar = observarStatusImpressora(atualizar);
    const evento = () => atualizar();
    window.addEventListener('essenza-printer-status', evento);
    atualizar();
    return () => { cancelar(); window.removeEventListener('essenza-printer-status', evento); };
  }, []);

  const conectar = async () => {
    setConectando(true);
    setErro('');
    const resultado = await conectarImpressora();
    if (resultado.ok) {
      setNome(resultado.nome);
      setStatus('conectada');
    } else if (resultado.erro !== 'Nenhum dispositivo selecionado.') {
      setErro(resultado.erro);
      setStatus('desconectada');
    }
    setConectando(false);
  };

  if (status === 'conectada') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
        <BluetoothConnected size={20} className="text-green-600 shrink-0" />
        <div className="flex-1 min-w-0"><p className="text-green-800 font-bold text-sm">Impressora conectada</p><p className="text-green-700 text-xs truncate">{nome || 'Impressora Bluetooth'}</p></div>
        <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" title="Pronta para imprimir" />
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
      <AlertTriangle size={20} className="text-amber-600 shrink-0" />
      <div className="flex-1 min-w-0"><p className="text-amber-900 font-bold text-sm">Impressora não conectada</p><p className="text-amber-800 text-xs">Ligue a impressora ou conecte uma autorizada.</p>{erro && <p className="text-red-600 text-xs mt-1">{erro}</p>}</div>
      {bluetoothSuportado() ? <button onClick={conectar} disabled={conectando} className="shrink-0 flex items-center gap-1.5 bg-[#B91C1C] text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"><Bluetooth size={15} /> {conectando ? 'Buscando...' : 'Conectar'}</button> : <span className="text-amber-700 text-xs font-semibold">Use Chrome/Edge</span>}
    </div>
  );
}

type PedidoAoVivo = {
  id: string;
  numero: number;
  cliente_nome: string;
  tipo: 'balcao' | 'delivery' | 'cliente' | 'mesa';
  status: string;
  total: number;
  created_at: string;
  garcom_nome?: string;
};

const SONS_PEDIDO: { id: string; nome: string; notas: number[]; delivery?: boolean; intervalo?: number; repeticoes?: number; voz?: boolean; sino?: boolean }[] = [
  { id: 'classico', nome: 'Clássico', notas: [880, 1175] },
  { id: 'campainha', nome: 'Campainha', notas: [1047, 784, 1047] },
  { id: 'suave', nome: 'Suave', notas: [523, 659, 784] },
  { id: 'urgente', nome: 'Alerta forte', notas: [1400, 1000, 1400, 1000] },
  { id: 'delivery-chegou', nome: 'Delivery · Chegou pedido', notas: [659.25, 830.61, 987.77], delivery: true, intervalo: 0.17, repeticoes: 2 },
  { id: 'delivery-campainha', nome: 'Delivery · Campainha dupla', notas: [1174.66, 880], delivery: true, intervalo: 0.32, repeticoes: 2 },
  { id: 'delivery-chamada', nome: 'Delivery · Chamada rápida', notas: [783.99, 1046.5, 987.77, 1318.51], delivery: true, intervalo: 0.12, repeticoes: 3 },
  { id: 'voz', nome: 'Voz · Chegou um novo pedido', notas: [], voz: true },
  { id: 'sino', nome: 'Sino · Duas badaladas', notas: [], sino: true },
  { id: 'sino-voz', nome: 'Sino + voz', notas: [], sino: true, voz: true },
  { id: 'silencioso', nome: 'Sem som (só balão)', notas: [] },
];
const SOM_PEDIDO_KEY = 'essenza_som_pedido';
function somPedidoSalvo() {
  try { return localStorage.getItem(SOM_PEDIDO_KEY) || 'classico'; } catch { return 'classico'; }
}

let falaPedidoPendente: number | undefined;
function anunciarPedido() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance('Atenção, chegou um novo pedido!');
  fala.lang = 'pt-BR';
  fala.rate = 0.95;
  const vozes = window.speechSynthesis.getVoices();
  const voz = vozes.find((v) => v.lang.toLowerCase() === 'pt-br') || vozes.find((v) => v.lang.toLowerCase().startsWith('pt'));
  if (voz) fala.voice = voz;
  window.speechSynthesis.speak(fala);
}

function tocaAlertaPedido() {
  try {
    window.clearTimeout(falaPedidoPendente);
    const som = SONS_PEDIDO.find((s) => s.id === somPedidoSalvo()) || SONS_PEDIDO[0];
    if (som.voz && !som.sino) { anunciarPedido(); return; }
    if (som.sino) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) { if (som.voz) anunciarPedido(); return; }
      const ctx = new AudioCtx();
      void ctx.resume();
      // Parciais não inteiros e cauda longa dão o timbre de sino.
      [0, 0.65].forEach((atraso) => {
        [1, 2.76, 5.4].forEach((parcial, i) => {
          const nota = ctx.createOscillator();
          const ganho = ctx.createGain();
          const inicio = ctx.currentTime + 0.03 + atraso;
          nota.frequency.value = 659.25 * parcial;
          ganho.gain.setValueAtTime(0.0001, inicio);
          ganho.gain.exponentialRampToValueAtTime(0.22 / (i + 1) ** 2, inicio + 0.008);
          ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 1.65);
          nota.connect(ganho).connect(ctx.destination);
          nota.start(inicio);
          nota.stop(inicio + 1.7);
        });
      });
      window.setTimeout(() => { void ctx.close(); }, 2500);
      if (som.voz) falaPedidoPendente = window.setTimeout(anunciarPedido, 1500);
      return;
    }
    if (!som.notas.length) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (som.delivery) {
      void ctx.resume();
      const intervalo = som.intervalo || 0.18;
      const repeticoes = som.repeticoes || 1;
      const ciclo = som.notas.length * intervalo + 0.35;
      for (let repeticao = 0; repeticao < repeticoes; repeticao++) {
        som.notas.forEach((frequencia, indice) => {
          const inicio = ctx.currentTime + 0.03 + repeticao * ciclo + indice * intervalo;
          // Cada nota tem ataque próprio e harmônicos suaves, como uma
          // campainha, em vez de apenas deslizar a frequência de um bip.
          [1, 2, 3].forEach((harmonico) => {
            const nota = ctx.createOscillator();
            const volume = ctx.createGain();
            nota.type = 'sine';
            nota.frequency.value = frequencia * harmonico;
            volume.gain.setValueAtTime(0.0001, inicio);
            volume.gain.exponentialRampToValueAtTime(0.15 / (harmonico * harmonico), inicio + 0.008);
            volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.45);
            nota.connect(volume).connect(ctx.destination);
            nota.start(inicio);
            nota.stop(inicio + 0.48);
          });
        });
      }
      window.setTimeout(() => { void ctx.close(); }, (repeticoes * ciclo + 0.6) * 1000);
      return;
    }
    const oscilador = ctx.createOscillator();
    const ganho = ctx.createGain();
    oscilador.type = 'sine';
    const duracao = som.notas.length * 0.18;
    som.notas.forEach((nota, i) => oscilador.frequency.setValueAtTime(nota, ctx.currentTime + i * 0.18));
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duracao);
    oscilador.connect(ganho).connect(ctx.destination);
    oscilador.start();
    oscilador.stop(ctx.currentTime + duracao + 0.02);
    window.setTimeout(() => { void ctx.close(); }, (duracao + 0.2) * 1000);
  } catch {
    // Alguns navegadores bloqueiam áudio até o primeiro clique; o balão visual
    // continua sendo mostrado normalmente.
  }
}

function PedidosAoVivo() {
  const [pedidos, setPedidos] = useState<PedidoAoVivo[]>([]);
  const [toast, setToast] = useState<{ id: string; texto: string } | null>(null);
  const vistos = useRef<Set<string> | null>(null);
  const [erroMonitor, setErroMonitor] = useState('');
  const [somSelecionado, setSomSelecionado] = useState(somPedidoSalvo);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('id, numero, cliente_nome, tipo, status, total, created_at, garcom_nome')
      .neq('status', 'entregue')
      .neq('status', 'cancelado')
      .order('created_at', { ascending: false })
      .limit(30);
    const { data: mesas, error: erroMesas } = await supabase.from('mesas')
      .select('id, numero, garcom, abertura_at, itens_mesa(id, quantidade, preco_unitario, adicional_preco, created_at)');
    if (error || erroMesas) {
      setErroMonitor('Não foi possível atualizar os pedidos. Tentando novamente automaticamente.');
      return;
    }
    setErroMonitor('');
    const chaves = new Set<string>();
    const novidades: string[] = [];
    const contas: PedidoAoVivo[] = [];
    for (const pedido of (data || []) as PedidoAoVivo[]) {
      const chave = `pedido:${pedido.id}`;
      chaves.add(chave);
      if (vistos.current && !vistos.current.has(chave)) novidades.push(`Pedido #${pedido.numero}`);
    }
    for (const mesa of mesas || []) {
      const itens = mesa.itens_mesa || [];
      if (!itens.length) continue;
      let novo = false;
      for (const item of itens) {
        const chave = `item:${item.id}`;
        chaves.add(chave);
        if (vistos.current && !vistos.current.has(chave)) novo = true;
      }
      if (novo) novidades.push(`Novos itens na mesa ${mesa.numero}`);
      contas.push({ id: mesa.id, numero: mesa.numero, cliente_nome: `Mesa ${mesa.numero}`, tipo: 'mesa', status: 'confirmado', garcom_nome: mesa.garcom,
        created_at: mesa.abertura_at || itens[0].created_at,
        total: itens.reduce((s, i) => s + Number(i.quantidade) * (Number(i.preco_unitario) + Number(i.adicional_preco || 0)), 0) });
    }
    vistos.current = chaves;
    if (novidades.length) {
      tocaAlertaPedido();
      const id = String(Date.now());
      setToast({ id, texto: novidades.join(' · ') });
      window.setTimeout(() => setToast((atual) => atual?.id === id ? null : atual), 10000);
    }
    setPedidos([...contas, ...((data as PedidoAoVivo[]) || [])]);
  }, []);

  useEffect(() => {
    void carregar();
    const intervalo = window.setInterval(carregar, 30000);
    const channel = supabase
      .channel('dashboard-pedidos-ao-vivo')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, () => {
        void carregar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itens_mesa' }, () => { void carregar(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, () => { void carregar(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, () => { void carregar(); })
      .subscribe();
    return () => {
      window.clearInterval(intervalo);
      supabase.removeChannel(channel);
    };
  }, [carregar]);

  const tipoLabel: Record<PedidoAoVivo['tipo'], string> = {
    balcao: 'Balcão', delivery: 'Delivery', cliente: 'Site', mesa: 'Mesa',
  };
  const tempo = (data: string) => {
    const minutos = Math.max(0, Math.floor((Date.now() - new Date(data).getTime()) / 60000));
    return minutos < 1 ? 'agora' : `${minutos} min`;
  };

  const porGarcom = pedidos.reduce<Record<string, { qtd: number; total: number }>>((acc, pedido) => {
    const nome = pedido.garcom_nome?.trim() || 'Sem atribuição';
    const atual = acc[nome] || { qtd: 0, total: 0 };
    atual.qtd += 1;
    atual.total += Number(pedido.total || 0);
    acc[nome] = atual;
    return acc;
  }, {});

  return (
    <>
      <section className="bg-white border border-[#EFE9E0] rounded-2xl p-4 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
        {erroMonitor && <p role="alert" className="text-red-600 text-sm mb-3">{erroMonitor}</p>}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center"><Bell size={17} className="text-[#B91C1C]" /></span>
            <div><h3 className="text-[#26211E] font-bold text-sm">Pedidos em andamento</h3><p className="text-[#8A8A8A] text-xs">Atualiza em tempo real e a cada 30 segundos</p></div>
          </div>
          <span className="text-xs font-bold text-[#B91C1C] bg-red-50 rounded-full px-2.5 py-1">{pedidos.length} abertos</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label htmlFor="som-pedidos" className="text-xs text-neutral-600">Som de notificação</label>
          <select id="som-pedidos" value={somSelecionado} onChange={(e) => {
            setSomSelecionado(e.target.value);
            try { localStorage.setItem(SOM_PEDIDO_KEY, e.target.value); } catch { /* preferência permanece nesta sessão */ }
            tocaAlertaPedido();
          }} className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white">
            {SONS_PEDIDO.map((som) => <option key={som.id} value={som.id}>{som.nome}</option>)}
          </select>
          <button onClick={tocaAlertaPedido} className="text-xs text-[#B91C1C] border border-red-200 rounded-lg px-3 py-2">Ativar / testar som</button>
          <span className="text-xs text-neutral-500">Preferência salva neste aparelho</span>
        </div>
        {pedidos.length === 0 ? (
          <p className="text-sm text-[#8A8A8A] py-3">Nenhum pedido aguardando atendimento.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {pedidos.slice(0, 12).map((pedido) => (
              <div key={pedido.id} className="border border-[#EFE9E0] rounded-xl px-3 py-2.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FBF6EF] flex items-center justify-center text-[#B91C1C] font-black text-xs">#{pedido.numero}</div>
                <div className="min-w-0 flex-1"><p className="text-[#26211E] text-sm font-semibold truncate">{tipoLabel[pedido.tipo]} · {pedido.cliente_nome || 'Consumidor'}</p><p className="text-[#8A8A8A] text-xs truncate">{pedido.garcom_nome || 'Sem garçom'} · {tempo(pedido.created_at)}</p></div>
                <span className="text-[#22c55e] font-bold text-sm">{brl(Number(pedido.total || 0))}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-[#EFE9E0] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3"><Users size={17} className="text-[#B91C1C]" /><h3 className="text-[#26211E] font-bold text-sm">Prestação em andamento por garçom</h3></div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(porGarcom).length === 0 ? <span className="text-xs text-[#8A8A8A]">Nenhum movimento aberto.</span> : Object.entries(porGarcom).map(([nome, resumo]) => (
            <span key={nome} className="bg-[#FBF6EF] border border-[#EFE9E0] rounded-xl px-3 py-2 text-xs text-[#26211E]"><b>{nome}</b> · {resumo.qtd} pedido{resumo.qtd === 1 ? '' : 's'} · {brl(resumo.total)}</span>
          ))}
        </div>
      </section>

      {toast && (
        <div className="fixed right-4 bottom-5 z-[80] w-[min(360px,calc(100vw-2rem))] bg-[#26211E] text-white rounded-2xl p-4 shadow-2xl flex items-start gap-3 animate-fadeIn">
          <Bell size={19} className="text-amber-300 mt-0.5 shrink-0" /><p className="text-sm font-semibold flex-1">{toast.texto}</p><button onClick={() => setToast(null)} className="text-white/60 hover:text-white"><X size={17} /></button>
        </div>
      )}
    </>
  );
}
