import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { brl } from '../../lib/format';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, dateTimeToISO,
} from '../../lib/dateUtils';
import {
  TrendingUp, TrendingDown, DollarSign, Receipt, ShoppingBag, RefreshCw,
} from 'lucide-react';
import { GraficoBarras, type BarraDia } from './dashboard/GraficoBarras';
import { GraficoRosca } from './dashboard/GraficoRosca';
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

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Variação percentual entre período atual e anterior
function pctChange(cur: number, prev: number): number {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

// Intervalos [atual, anterior] conforme o filtro
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

// Agrega uma lista de pedidos (total/lucro/custo_total) em somatórios
function agregar(rows: any[]): Agregado {
  return {
    faturamento: rows.reduce((s, p) => s + Number(p.total || 0), 0),
    lucro: rows.reduce((s, p) => s + Number(p.lucro || 0), 0),
    custo: rows.reduce((s, p) => s + Number(p.custo_total || 0), 0),
    num: rows.length,
  };
}

export function Dashboard({ meta }: { meta: number }) {
  const [filtro, setFiltro] = useState<Filtro>('hoje');
  const [loading, setLoading] = useState(true);
  const [atual, setAtual] = useState<Agregado>({ faturamento: 0, lucro: 0, custo: 0, num: 0 });
  const [anterior, setAnterior] = useState<Agregado>({ faturamento: 0, lucro: 0, custo: 0, num: 0 });
  const [labelPrev, setLabelPrev] = useState('vs ontem');
  const [seteDias, setSeteDias] = useState<BarraDia[]>([]);
  const [topSabores, setTopSabores] = useState<SaborTop[]>([]);
  const [faturamentoHoje, setFaturamentoHoje] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { ini, fim, iniPrev, fimPrev, labelPrev } = intervalos(filtro);
    setLabelPrev(labelPrev);

    // 1. Pedidos do período atual (com id para buscar itens)
    const { data: rows } = await supabase
      .from('pedidos')
      .select('id, total, lucro, custo_total, created_at')
      .gte('created_at', dateTimeToISO(ini))
      .lte('created_at', dateTimeToISO(fim))
      .neq('status', 'cancelado');
    const pedidos = rows || [];
    setAtual(agregar(pedidos));

    // 2. Período anterior (só para o % de comparação)
    const { data: rowsPrev } = await supabase
      .from('pedidos')
      .select('total, lucro, custo_total')
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

  // O card de Lucro é destacado em VERDE quando há lucro (positivo) e em VERMELHO
  // quando há prejuízo (negativo).
  const lucroPos = atual.lucro >= 0;
  const destTone = lucroPos
    ? { grad: 'bg-gradient-to-br from-green-500/20 to-green-500/5 border-green-500/30', text: 'text-green-500' }
    : { grad: 'bg-gradient-to-br from-red-500/20 to-red-500/5 border-red-500/30', text: 'text-red-400' };

  const cards = [
    { label: 'Faturamento', valor: brl(atual.faturamento), pct: pctChange(atual.faturamento, anterior.faturamento), icon: DollarSign, destaque: false },
    { label: 'Lucro', valor: brl(atual.lucro), pct: pctChange(atual.lucro, anterior.lucro), icon: TrendingUp, destaque: true },
    { label: 'Ticket Médio', valor: brl(ticketMedio), pct: pctChange(ticketMedio, ticketMedioPrev), icon: Receipt, destaque: false },
    { label: 'Nº Pedidos', valor: String(atual.num), pct: pctChange(atual.num, anterior.num), icon: ShoppingBag, destaque: false },
  ];

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Cabeçalho + filtros */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          Dashboard
          {loading && <RefreshCw size={16} className="animate-spin text-[#E50914]" />}
        </h2>
        <div className="flex bg-neutral-900 p-1 rounded-xl border border-essenza-dark-border">
          {(['hoje', 'semana', 'mes'] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all ${
                filtro === f ? 'bg-[#E50914] text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {f === 'mes' ? 'Mês' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de topo com % vs período anterior */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const subiu = c.pct >= 0;
          return (
            <div
              key={c.label}
              className={`rounded-2xl p-5 border ${
                c.destaque ? destTone.grad : 'bg-essenza-dark-card border-essenza-dark-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-neutral-400 text-xs uppercase tracking-wide">{c.label}</span>
                <c.icon size={18} className={c.destaque ? destTone.text : 'text-neutral-500'} />
              </div>
              <p className={`font-black text-2xl ${c.destaque ? destTone.text : 'text-white'}`}>{c.valor}</p>
              <div className={`flex items-center gap-1 text-xs mt-1 ${subiu ? 'text-green-500' : 'text-red-400'}`}>
                {subiu ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(c.pct).toFixed(0)}% <span className="text-neutral-600">{labelPrev}</span>
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
        meta={meta}
        seteDias={seteDias}
        topSabor={topSabores[0] || null}
      />

      {/* Meta do dia */}
      <MetaProgresso faturamento={faturamentoHoje} meta={meta} />

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficoBarras data={seteDias} />
        <GraficoRosca custo={atual.custo} lucro={atual.lucro} />
      </div>
      <GraficoTopSabores data={topSabores} />
    </div>
  );
}
