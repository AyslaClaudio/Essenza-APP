import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, dateTimeToISO,
} from '../../lib/dateUtils';
import {
  TrendingUp, TrendingDown, DollarSign, Receipt, ShoppingBag, RefreshCw, ChefHat, LayoutGrid,
} from 'lucide-react';
import { GraficoBarras, type BarraDia } from './dashboard/GraficoBarras';
import { GraficoTopSabores, type SaborTop } from './dashboard/GraficoTopSabores';
import { MetaProgresso } from './dashboard/MetaProgresso';
import { InsightIA } from './dashboard/InsightIA';

type Filtro = 'hoje' | 'semana' | 'mes';

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

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Variação percentual entre período atual e anterior — cálculo idêntico ao de sempre.
function pctChange(cur: number, prev: number): number {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

// Intervalos [atual, anterior] conforme o filtro — cálculo idêntico ao de sempre.
function intervalos(filtro: Filtro): { ini: Date; fim: Date; iniPrev: Date; fimPrev: Date; labelPrev: string } {
  const hoje = new Date();
  if (filtro === 'hoje') {
    return {
      ini: startOfDay(hoje), fim: endOfDay(hoje),
      iniPrev: startOfDay(addDays(hoje, -1)), fimPrev: endOfDay(addDays(hoje, -1)),
      labelPrev: 'vs ontem',
    };
  }
  if (filtro === 'semana') {
    const ini = startOfWeek(hoje);
    return {
      ini, fim: endOfWeek(hoje),
      iniPrev: startOfWeek(addDays(ini, -7)), fimPrev: endOfWeek(addDays(ini, -7)),
      labelPrev: 'vs semana passada',
    };
  }
  const ini = startOfMonth(hoje);
  return {
    ini, fim: endOfMonth(hoje),
    iniPrev: startOfMonth(addDays(ini, -1)), fimPrev: endOfMonth(addDays(ini, -1)),
    labelPrev: 'vs mês passado',
  };
}

// Agrega uma lista de pedidos (total/lucro/custo_total) em somatórios — cálculo
// idêntico ao de sempre ("num" conta só pedidos entregues).
function agregar(rows: any[]): Agregado {
  return {
    faturamento: rows.reduce((s, p) => s + Number(p.total || 0), 0),
    lucro: rows.reduce((s, p) => s + Number(p.lucro || 0), 0),
    custo: rows.reduce((s, p) => s + Number(p.custo_total || 0), 0),
    num: rows.filter((p) => p.status === 'entregue').length,
  };
}

// Sparkline discreto (SVG puro, sem lib) — usa os mesmos 7 dias do gráfico principal.
function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2 || valores.every((v) => v === 0)) return null;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const range = max - min || 1;
  const pontos = valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * 100;
      const y = 24 - ((v - min) / range) * 22 - 1;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-16 h-6">
      <polyline points={pontos} fill="none" stroke="#F26522" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Dashboard({ meta }: { meta: number }) {
  const { config } = useConfig();
  const [filtro, setFiltro] = useState<Filtro>('hoje');
  const [loading, setLoading] = useState(true);
  const [atual, setAtual] = useState<Agregado>({ faturamento: 0, lucro: 0, custo: 0, num: 0 });
  const [anterior, setAnterior] = useState<Agregado>({ faturamento: 0, lucro: 0, custo: 0, num: 0 });
  const [labelPrev, setLabelPrev] = useState('vs ontem');
  const [seteDias, setSeteDias] = useState<BarraDia[]>([]);
  const [topSabores, setTopSabores] = useState<SaborTop[]>([]);
  const [faturamentoHoje, setFaturamentoHoje] = useState(0);
  const [formaPagamentoDominante, setFormaPagamentoDominante] = useState<{ forma: string; pct: number } | null>(null);
  const [operacao, setOperacao] = useState<Operacao>({ pedidosBalcao: 0, pedidosDelivery: 0, mesasOcupadas: 0, mesasTotal: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const { ini, fim, iniPrev, fimPrev, labelPrev } = intervalos(filtro);
    setLabelPrev(labelPrev);

    // 1. Pedidos do período atual (com id para buscar itens)
    const { data: rows } = await supabase
      .from('pedidos')
      .select('id, total, lucro, custo_total, status, forma_pagamento, created_at')
      .gte('created_at', dateTimeToISO(ini))
      .lte('created_at', dateTimeToISO(fim))
      .neq('status', 'cancelado');
    const pedidos = rows || [];
    setAtual(agregar(pedidos));

    // Forma de pagamento mais usada no período (para sugerir diversificação)
    const formaCount = new Map<string, number>();
    pedidos.forEach((p: any) => {
      const forma = p.forma_pagamento || 'Não informado';
      formaCount.set(forma, (formaCount.get(forma) || 0) + 1);
    });
    if (formaCount.size > 0 && pedidos.length > 0) {
      const [forma, count] = [...formaCount.entries()].sort((a, b) => b[1] - a[1])[0];
      setFormaPagamentoDominante({ forma, pct: (count / pedidos.length) * 100 });
    } else {
      setFormaPagamentoDominante(null);
    }

    // 2. Período anterior (só para o % de comparação)
    const { data: rowsPrev } = await supabase
      .from('pedidos')
      .select('total, lucro, custo_total, status')
      .gte('created_at', dateTimeToISO(iniPrev))
      .lte('created_at', dateTimeToISO(fimPrev))
      .neq('status', 'cancelado');
    setAnterior(agregar(rowsPrev || []));

    // 3. Últimos 7 dias, agrupados por dia
    const ini7 = startOfDay(addDays(new Date(), -6));
    const { data: rows7 } = await supabase
      .from('pedidos')
      .select('total, created_at')
      .gte('created_at', dateTimeToISO(ini7))
      .lte('created_at', dateTimeToISO(endOfDay(new Date())))
      .neq('status', 'cancelado');
    const buckets: BarraDia[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const key = d.toDateString();
      const valor = (rows7 || [])
        .filter((p) => new Date(p.created_at).toDateString() === key)
        .reduce((s, p) => s + Number(p.total || 0), 0);
      buckets.push({
        dia: DIAS_SEMANA[d.getDay()],
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        valor,
      });
    }
    setSeteDias(buckets);

    // 4. Faturamento de hoje (para a meta diária, independente do filtro)
    if (filtro === 'hoje') {
      setFaturamentoHoje(agregar(pedidos).faturamento);
    } else {
      const { data: rowsHoje } = await supabase
        .from('pedidos')
        .select('total')
        .gte('created_at', dateTimeToISO(startOfDay(new Date())))
        .lte('created_at', dateTimeToISO(endOfDay(new Date())))
        .neq('status', 'cancelado');
      setFaturamentoHoje((rowsHoje || []).reduce((s, p) => s + Number(p.total || 0), 0));
    }

    // 5. Top sabores do período (agrega itens_pedido dos pedidos do período)
    const ids = pedidos.map((p) => p.id);
    if (ids.length > 0) {
      const { data: itens } = await supabase
        .from('itens_pedido')
        .select('produto_nome, sabor1, sabor2, quantidade, preco_unitario, adicional_preco')
        .in('pedido_id', ids);
      const mapa = new Map<string, SaborTop>();
      const add = (nome: string, qtd: number, valor: number) => {
        if (!nome) return;
        const cur = mapa.get(nome) || { nome, quantidade: 0, valor: 0 };
        cur.quantidade += qtd;
        cur.valor += valor;
        mapa.set(nome, cur);
      };
      (itens || []).forEach((it: any) => {
        const q = Number(it.quantidade || 1);
        const lineValue = q * (Number(it.preco_unitario || 0) + Number(it.adicional_preco || 0));
        if (it.sabor1 && it.sabor2) {
          // Meio a meio: cada sabor conta a quantidade e metade do valor
          add(it.sabor1, q, lineValue / 2);
          add(it.sabor2, q, lineValue / 2);
        } else {
          add(it.sabor1 || it.produto_nome, q, lineValue);
        }
      });
      setTopSabores([...mapa.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5));
    } else {
      setTopSabores([]);
    }

    // 6. Operação agora — só dados reais: pedidos em andamento (status
    // "confirmado", separados por tipo) e mesas ocupadas. Sem status de
    // "cozinha" vs "aguardando entrega" porque o sistema não distingue isso.
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
  }, [filtro]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const ticketMedio = atual.num > 0 ? atual.faturamento / atual.num : 0;
  const ticketMedioPrev = anterior.num > 0 ? anterior.faturamento / anterior.num : 0;
  const margem = atual.faturamento > 0 ? (atual.lucro / atual.faturamento) * 100 : 0;
  const seteDiasValores = seteDias.map((d) => d.valor);

  const cards = [
    { label: 'Faturamento', valor: brl(atual.faturamento), pct: pctChange(atual.faturamento, anterior.faturamento), icon: DollarSign, sparkline: true },
    { label: 'Lucro Líquido', valor: brl(atual.lucro), pct: pctChange(atual.lucro, anterior.lucro), icon: TrendingUp, sparkline: false },
    { label: 'Ticket Médio', valor: brl(ticketMedio), pct: pctChange(ticketMedio, ticketMedioPrev), icon: Receipt, sparkline: false },
    { label: 'Pedidos', valor: String(atual.num), pct: pctChange(atual.num, anterior.num), icon: ShoppingBag, sparkline: false },
  ];

  const FILTRO_LABELS: Record<Filtro, string> = { hoje: 'Hoje', semana: 'Esta semana', mes: 'Este mês' };

  return (
    <div className="space-y-5 animate-fadeIn max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#171717] flex items-center gap-2">
            Dashboard
            {loading && <RefreshCw size={15} className="animate-spin text-[#F26522]" />}
          </h2>
          <p className="text-[#737373] text-sm mt-1">
            Olá, {config?.nome_loja || 'Essenza'} 👋 Aqui está o desempenho da sua operação.
          </p>
        </div>
        <div className="flex bg-white p-1 rounded-full border border-[#E8E8E5]">
          {(['hoje', 'semana', 'mes'] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                filtro === f ? 'bg-[#F26522] text-white' : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              {FILTRO_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const subiu = c.pct >= 0;
          return (
            <div key={c.label} className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#FDECE3] flex items-center justify-center">
                  <c.icon size={17} className="text-[#F26522]" />
                </div>
                {c.sparkline && <Sparkline valores={seteDiasValores} />}
              </div>
              <span className="text-[#8A8A8A] text-xs uppercase tracking-wide">{c.label}</span>
              <p className="font-semibold text-2xl text-[#26211E] tabular-nums mt-0.5">{c.valor}</p>
              <div className={`flex items-center gap-1 text-xs mt-2 font-medium ${subiu ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                {subiu ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(c.pct).toFixed(1)}% <span className="text-[#a3a3a3] font-normal">{labelPrev}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Insight IA */}
      <InsightIA
        margem={margem}
        ticketMedio={ticketMedio}
        faturamento={atual.faturamento}
        faturamentoAnterior={anterior.faturamento}
        meta={meta}
        seteDias={seteDias}
        topSabor={topSabores[0] || null}
        formaPagamentoDominante={formaPagamentoDominante}
      />

      {/* Meta do dia */}
      <MetaProgresso faturamento={faturamentoHoje} meta={meta} />

      {/* Gráfico principal (≈70%) + Produtos mais vendidos (≈30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
        <div className="lg:col-span-7">
          <GraficoBarras data={seteDias} />
        </div>
        <div className="lg:col-span-3">
          <GraficoTopSabores data={topSabores} />
        </div>
      </div>

      {/* Margem de lucro — substitui o donut por uma leitura mais direta */}
      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-6">
        <h3 className="text-[#171717] font-semibold mb-5">Margem de Lucro</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-center">
          <div>
            <p className="text-4xl font-semibold text-[#22C55E] tabular-nums">{margem.toFixed(0)}%</p>
            <p className="text-[#737373] text-xs mt-1">do faturamento vira lucro</p>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Receita', valor: atual.faturamento, cor: '#F26522', max: atual.faturamento },
              { label: 'Custos', valor: atual.custo, cor: '#EF4444', max: atual.faturamento },
              { label: 'Lucro', valor: atual.lucro, cor: '#22C55E', max: atual.faturamento },
            ].map((linha) => (
              <div key={linha.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#737373]">{linha.label}</span>
                  <span className="font-medium text-[#171717]">{brl(linha.valor)}</span>
                </div>
                <div className="h-2 bg-[#FBF6EF] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${linha.max > 0 ? Math.min(100, (linha.valor / linha.max) * 100) : 0}%`, backgroundColor: linha.cor }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Operação agora — só dados que existem de verdade no sistema */}
      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-6">
        <h3 className="text-[#171717] font-semibold mb-4">Operação Agora</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
              <ChefHat size={18} className="text-[#F26522]" />
            </div>
            <div>
              <p className="text-[#171717] font-semibold text-lg leading-none">{operacao.pedidosBalcao}</p>
              <p className="text-[#737373] text-xs mt-1">Pedidos de balcão/mesa em andamento</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <ShoppingBag size={18} className="text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-[#171717] font-semibold text-lg leading-none">{operacao.pedidosDelivery}</p>
              <p className="text-[#737373] text-xs mt-1">Pedidos de entrega em andamento</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <LayoutGrid size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-[#171717] font-semibold text-lg leading-none">{operacao.mesasOcupadas} / {operacao.mesasTotal}</p>
              <p className="text-[#737373] text-xs mt-1">Mesas ocupadas</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
