import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  addDays, dateTimeToISO, dateToISO,
} from '../../lib/dateUtils';
import {
  TrendingUp, TrendingDown, DollarSign, Receipt, ShoppingBag, RefreshCw, ChefHat, LayoutGrid,
  Calendar, PieChart as PieIcon, Trophy, Clock,
} from 'lucide-react';
import { GraficoTendencia, type BucketTendencia } from './dashboard/GraficoTendencia';
import { GraficoTopSabores, type SaborTop } from './dashboard/GraficoTopSabores';
import { MetaProgresso } from './dashboard/MetaProgresso';
import { InsightIA } from './dashboard/InsightIA';

type Filtro = 'hoje' | '7dias' | '30dias' | 'mes' | '3meses' | '6meses' | 'custom';

interface Agregado {
  faturamento: number;
  lucro: number;
  custo: number;
  num: number;
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
  return {
    faturamento: rows.reduce((s, p) => s + Number(p.total || 0), 0),
    lucro: rows.reduce((s, p) => s + Number(p.lucro || 0), 0),
    custo: rows.reduce((s, p) => s + Number(p.custo_total || 0), 0),
    num: rows.filter((p) => p.status === 'entregue').length,
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
      <polyline points={pontos} fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FILTRO_LABELS: Record<Filtro, string> = {
  hoje: 'Hoje', '7dias': '7 dias', '30dias': '30 dias', mes: 'Este mês',
  '3meses': '3 meses', '6meses': '6 meses', custom: 'Personalizado',
};

const CAT_CORES = ['#DC2626', '#22C55E', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6'];

export function Dashboard({ meta }: { meta: number }) {
  const { config } = useConfig();
  const [filtro, setFiltro] = useState<Filtro>('hoje');
  const [showCustom, setShowCustom] = useState(false);
  const [customIni, setCustomIni] = useState(dateToISO(addDays(new Date(), -30)));
  const [customFim, setCustomFim] = useState(dateToISO(new Date()));
  const [loading, setLoading] = useState(true);

  const [atual, setAtual] = useState<Agregado>({ faturamento: 0, lucro: 0, custo: 0, num: 0 });
  const [anterior, setAnterior] = useState<Agregado>({ faturamento: 0, lucro: 0, custo: 0, num: 0 });
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

    const [{ data: rows }, { data: saidas }] = await Promise.all([
      supabase
        .from('pedidos')
        .select('id, total, lucro, custo_total, status, forma_pagamento, created_at, cliente_nome')
        .gte('created_at', dateTimeToISO(ini))
        .lte('created_at', dateTimeToISO(fim))
        .neq('status', 'cancelado'),
      // Custos operacionais / saídas de caixa lançados no período — entram como
      // Despesas na tendência (além do custo dos produtos vendidos).
      supabase
        .from('caixa')
        .select('valor, data')
        .eq('tipo', 'saida')
        .gte('data', dateToISO(ini))
        .lte('data', dateToISO(fim)),
    ]);
    const pedidos = rows || [];
    setAtual(agregar(pedidos));
    setTendencia(bucketize(pedidos, saidas || [], ini, fim));

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
      .select('total, lucro, custo_total, status')
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
      const { data: rh } = await supabase.from('pedidos').select('total')
        .gte('created_at', dateTimeToISO(startOfDay(new Date())))
        .lte('created_at', dateTimeToISO(endOfDay(new Date())))
        .neq('status', 'cancelado');
      setFaturamentoHoje((rh || []).reduce((s, p) => s + Number(p.total || 0), 0));
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

  const ticketMedio = atual.num > 0 ? atual.faturamento / atual.num : 0;
  const ticketMedioPrev = anterior.num > 0 ? anterior.faturamento / anterior.num : 0;
  const margem = atual.faturamento > 0 ? (atual.lucro / atual.faturamento) * 100 : 0;
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
            {loading && <RefreshCw size={15} className="animate-spin text-[#DC2626]" />}
          </h2>
          <p className="text-[#8A8A8A] text-sm mt-1">
            Olá, {config?.nome_loja || 'Essenza'} 👋 Aqui está o desempenho da sua operação.
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
                  filtro === f ? 'bg-[#DC2626] text-white' : 'text-[#8A8A8A] hover:text-[#26211E]'
                }`}
              >
                {FILTRO_LABELS[f]}
              </button>
            ))}
            <button
              onClick={() => setShowCustom((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                filtro === 'custom' ? 'bg-[#DC2626] text-white' : 'text-[#8A8A8A] hover:text-[#26211E]'
              }`}
            >
              <Calendar size={12} /> Personalizado
            </button>
          </div>
        </div>
      </div>

      {showCustom && (
        <div className="bg-white border border-[#EFE9E0] rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[#8A8A8A] text-xs mb-1">De</label>
            <input type="date" value={customIni} max={customFim} onChange={(e) => setCustomIni(e.target.value)}
              className="bg-[#FBF6EF] border border-[#EFE9E0] rounded-lg px-3 py-2 text-sm text-[#26211E] focus:border-[#DC2626] focus:outline-none" />
          </div>
          <div>
            <label className="block text-[#8A8A8A] text-xs mb-1">Até</label>
            <input type="date" value={customFim} min={customIni} max={dateToISO(new Date())} onChange={(e) => setCustomFim(e.target.value)}
              className="bg-[#FBF6EF] border border-[#EFE9E0] rounded-lg px-3 py-2 text-sm text-[#26211E] focus:border-[#DC2626] focus:outline-none" />
          </div>
          <button onClick={() => { setFiltro('custom'); setShowCustom(false); }}
            className="bg-[#DC2626] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#B91C1C]">
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
                  <c.icon size={17} className="text-[#DC2626]" />
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
              <PieIcon size={16} className="text-[#DC2626]" />
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
            {topSabor && (
              <li className="flex items-start gap-2">
                <Trophy size={15} className="text-[#F59E0B] mt-0.5 shrink-0" />
                <span className="text-[#8A8A8A]">Mais vendido: <b className="text-[#26211E] font-medium">{topSabor.nome}</b> ({topSabor.quantidade}x)</span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <Receipt size={15} className="text-[#DC2626] mt-0.5 shrink-0" />
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
                { label: 'Receita', valor: atual.faturamento, cor: '#DC2626' },
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
              <div className="w-10 h-10 rounded-xl bg-[#FEE2E2] flex items-center justify-center shrink-0"><ChefHat size={18} className="text-[#DC2626]" /></div>
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
