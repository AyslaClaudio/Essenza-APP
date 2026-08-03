import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl, margemProduto, todayISO } from '../../lib/format';
import { dateToISO } from '../../lib/dateUtils';
import { PeriodSelector } from '../PeriodSelector';
import { usePedidosPeriodo } from '../../hooks/usePedidosPeriodo';
import { calcularKPIs, agruparPorTipo, agruparPorFormaPagamento, analisarProdutos, calcularEstatisticasMargem } from '../../lib/reportUtils';
import { GraficoBarras } from './dashboard/GraficoBarras';
import { GraficoRosca } from './dashboard/GraficoRosca';
import { printFechamentoDia } from '../../lib/print';
import type { Pedido, CaixaEntry, ItemPedido } from '../../types';
import { Wallet, TrendingUp, DollarSign, ArrowUpCircle, ArrowDownCircle, FileText, Target, Trophy, Receipt, X, Printer, BarChart3, CreditCard } from 'lucide-react';

type Tab = 'caixa' | 'fechamento' | 'relatorios' | 'metas';

const TIPO_LABELS: Record<string, string> = {
  balcao: 'Balcão',
  delivery: 'Delivery',
  cliente: 'Cliente (autoatendimento)',
  mesa: 'Mesas do Salão',
};

export function Financeiro() {
  const [tab, setTab] = useState<Tab>('caixa');

  return (
    <div className="space-y-4 animate-fadeIn">
      <h2 className="text-2xl font-bold text-neutral-900">Financeiro</h2>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { id: 'caixa', label: 'Caixa', icon: Wallet },
          { id: 'fechamento', label: 'Fechamento do Dia', icon: Receipt },
          { id: 'relatorios', label: 'Relatórios', icon: FileText },
          { id: 'metas', label: 'Metas', icon: Target },
        ] as { id: Tab; label: string; icon: typeof Wallet }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-[#E50914] text-white' : 'bg-neutral-200 text-neutral-500'}`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'caixa' && <Caixa />}
      {tab === 'fechamento' && <Fechamento />}
      {tab === 'relatorios' && <Relatorios />}
      {tab === 'metas' && <Metas />}
    </div>
  );
}

function Caixa() {
  const [entries, setEntries] = useState<CaixaEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro');

  const load = useCallback(async () => {
    const today = todayISO();
    const { data } = await supabase.from('caixa').select('*').eq('data', today).order('created_at', { ascending: false });
    setEntries((data as CaixaEntry[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalEntradas = entries.filter((e) => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
  const totalSaidas = entries.filter((e) => e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
  const saldo = totalEntradas - totalSaidas;

  const save = async () => {
    if (!descricao || !valor) return;
    await supabase.from('caixa').insert({
      tipo,
      descricao,
      valor: parseFloat(valor),
      forma_pagamento: formaPagamento,
      data: todayISO(),
    });
    setDescricao(''); setValor(''); setShowForm(false);
    load();
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowUpCircle size={20} className="text-green-600" /><span className="text-green-600/70 text-sm">Entradas</span></div>
          <p className="text-green-600 font-bold text-2xl">{brl(totalEntradas)}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowDownCircle size={20} className="text-red-600" /><span className="text-red-600/70 text-sm">Saídas</span></div>
          <p className="text-red-600 font-bold text-2xl">{brl(totalSaidas)}</p>
        </div>
        <div className="bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><DollarSign size={20} className="text-[#22c55e]" /><span className="text-[#22c55e]/70 text-sm">Saldo</span></div>
          <p className={`font-bold text-2xl ${saldo >= 0 ? 'text-[#22c55e]' : 'text-red-600'}`}>{brl(saldo)}</p>
        </div>
      </div>

      <button onClick={() => setShowForm(true)} className="w-full bg-[#E50914] text-white py-3 rounded-xl font-bold active:scale-95">
        Lançar Movimentação
      </button>

      {/* Entries */}
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="bg-white border border-neutral-200 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${e.tipo === 'entrada' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                {e.tipo === 'entrada' ? <ArrowUpCircle size={20} className="text-green-600" /> : <ArrowDownCircle size={20} className="text-red-600" />}
              </div>
              <div>
                <p className="text-neutral-900 text-sm font-medium">{e.descricao}</p>
                <p className="text-neutral-500 text-xs">{e.forma_pagamento}</p>
              </div>
            </div>
            <span className={`font-bold ${e.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>{e.tipo === 'entrada' ? '+' : '-'}{brl(e.valor)}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="text-center text-neutral-500 py-8">Nenhuma movimentação hoje</p>}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-neutral-900 font-bold text-lg mb-4">Nova Movimentação</h3>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setTipo('entrada')} className={`flex-1 py-3 rounded-xl font-semibold ${tipo === 'entrada' ? 'bg-green-500 text-white' : 'bg-neutral-200 text-neutral-500'}`}>Entrada</button>
              <button onClick={() => setTipo('saida')} className={`flex-1 py-3 rounded-xl font-semibold ${tipo === 'saida' ? 'bg-red-500 text-white' : 'bg-neutral-200 text-neutral-500'}`}>Saída</button>
            </div>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mb-3 focus:border-[#E50914] focus:outline-none" />
            <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (R$)" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mb-3 focus:border-[#E50914] focus:outline-none" />
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mb-4 focus:border-[#E50914] focus:outline-none">
              <option>Dinheiro</option><option>Cartão</option><option>Pix</option><option>Outro</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-200 text-neutral-500 rounded-xl">Cancelar</button>
              <button onClick={save} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fechamento() {
  const { config } = useConfig();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [itens, setItens] = useState<Record<string, ItemPedido[]>>({});
  const [dataFiltro, setDataFiltro] = useState(todayISO());

  const load = useCallback(async () => {
    const start = new Date(dataFiltro + 'T00:00:00');
    const end = new Date(dataFiltro + 'T23:59:59');
    const { data: peds } = await supabase
      .from('pedidos')
      .select('*')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .neq('status', 'cancelado')
      .order('created_at');
    const pedsData = (peds as Pedido[]) || [];
    setPedidos(pedsData);

    // Load items for all pedidos
    const itensMap: Record<string, ItemPedido[]> = {};
    for (const p of pedsData) {
      const { data } = await supabase.from('itens_pedido').select('*').eq('pedido_id', p.id);
      itensMap[p.id] = (data as ItemPedido[]) || [];
    }
    setItens(itensMap);
  }, [dataFiltro]);

  useEffect(() => { load(); }, [load]);

  const faturamento = pedidos.reduce((s, p) => s + Number(p.total), 0);
  const custoTotal = pedidos.reduce((s, p) => s + Number(p.custo_total), 0);
  const lucroBruto = pedidos.reduce((s, p) => s + Number(p.lucro), 0);
  const despesasFixas = config?.despesas_fixas_diaria || 0;
  const lucroLiquido = lucroBruto - despesasFixas;

  // Product breakdown
  const productMap: Record<string, { qtd: number; custo: number; venda: number; lucro: number }> = {};
  pedidos.forEach((p) => {
    (itens[p.id] || []).forEach((item) => {
      const key = item.produto_nome;
      if (!productMap[key]) productMap[key] = { qtd: 0, custo: 0, venda: 0, lucro: 0 };
      productMap[key].qtd += item.quantidade;
      productMap[key].custo += item.quantidade * item.custo_unitario;
      productMap[key].venda += item.quantidade * (item.preco_unitario + item.adicional_preco);
      productMap[key].lucro += item.quantidade * ((item.preco_unitario + item.adicional_preco) - item.custo_unitario);
    });
  });

  const produtos = Object.entries(productMap).sort((a, b) => b[1].lucro - a[1].lucro);

  const printFechamento = () => {
    if (!config) return;
    printFechamentoDia(
      new Date(dataFiltro).toLocaleDateString('pt-BR'),
      faturamento,
      custoTotal,
      lucroBruto,
      despesasFixas,
      lucroLiquido,
      produtos.map(([nome, d]) => ({ nome, qtd: d.qtd, lucro: d.lucro })),
      config,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} className="bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 focus:border-[#E50914] focus:outline-none" />
        <button onClick={printFechamento} className="flex items-center gap-2 bg-neutral-200 text-neutral-900 px-4 py-2.5 rounded-xl text-sm hover:bg-neutral-700">
          <Printer size={18} /> Imprimir
        </button>
      </div>

      {/* Big result */}
      <div className="bg-gradient-to-br from-[#22c55e]/20 to-[#22c55e]/5 border border-[#22c55e]/30 rounded-2xl p-6 text-center">
        <p className="text-[#22c55e]/70 text-sm uppercase tracking-wide">Lucro Total do Dia</p>
        <p className="text-[#22c55e] font-black text-5xl">{brl(lucroLiquido)}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Faturamento" value={brl(faturamento)} color="text-neutral-900" />
        <StatCard label="Custo Produtos" value={brl(custoTotal)} color="text-orange-600" />
        <StatCard label="Lucro Bruto" value={brl(lucroBruto)} color="text-[#22c55e]" />
        <StatCard label="Despesas Fixas" value={brl(despesasFixas)} color="text-red-600" />
      </div>

      {/* Product breakdown */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-neutral-100/50 border-b border-neutral-200">
          <h3 className="text-neutral-900 font-semibold">Lucro por Produto</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 text-xs uppercase border-b border-neutral-200">
                <th className="text-left px-4 py-2">Produto</th>
                <th className="text-right px-2 py-2">Qtd</th>
                <th className="text-right px-2 py-2">Custo</th>
                <th className="text-right px-2 py-2">Venda</th>
                <th className="text-right px-2 py-2">Lucro R$</th>
                <th className="text-right px-4 py-2">Margem %</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map(([nome, d]) => (
                <tr key={nome} className="border-b border-neutral-200 last:border-0">
                  <td className="px-4 py-2 text-neutral-900 font-medium">{nome}</td>
                  <td className="px-2 py-2 text-right text-neutral-500">{d.qtd}</td>
                  <td className="px-2 py-2 text-right text-neutral-500">{brl(d.custo)}</td>
                  <td className="px-2 py-2 text-right text-neutral-900">{brl(d.venda)}</td>
                  <td className="px-2 py-2 text-right text-[#22c55e] font-semibold">{brl(d.lucro)}</td>
                  <td className="px-4 py-2 text-right text-green-600">{margemProduto(d.custo, d.venda).toFixed(0)}%</td>
                </tr>
              ))}
              {produtos.length === 0 && (
                <tr><td colSpan={6} className="text-center py-6 text-neutral-500">Nenhum pedido neste dia</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <p className="text-neutral-500 text-xs uppercase">{label}</p>
      <p className={`font-bold text-xl mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Relatorios() {
  const { config } = useConfig();
  const [periodo, setPeriodo] = useState({ dataInicio: new Date(), dataFim: new Date() });
  const [tabAtiva, setTabAtiva] = useState<'resumo' | 'produtos' | 'tipo'>('resumo');

  const { pedidos, loading } = usePedidosPeriodo({
    dataInicio: periodo.dataInicio,
    dataFim: periodo.dataFim,
  });

  const handlePeriodChange = (newPeriodo: { dataInicio: Date; dataFim: Date }) => {
    setPeriodo(newPeriodo);
  };

  const itensMap: Record<string, ItemPedido[]> = {};
  pedidos.forEach((p) => {
    if (p.itens) {
      itensMap[p.id] = p.itens;
    }
  });

  const kpis = calcularKPIs(pedidos);
  const kpisPorTipo = agruparPorTipo(pedidos);
  const kpisPorFormaPagamento = agruparPorFormaPagamento(pedidos);
  const produtos = analisarProdutos(pedidos, itensMap);
  const estatisticas = calcularEstatisticasMargem(kpis);

  const top10Lucrativos = produtos.slice(0, 10);
  const top10Vendidos = [...produtos].sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

  // Faturamento por dia dentro do período selecionado (para o gráfico de tendência)
  // p.created_at é UTC — usar dateToISO(new Date(...)) em vez de .slice(0,10) direto,
  // senão pedidos feitos à noite (fuso Brasil = UTC-3) somam no dia seguinte errado.
  const porDiaMap: Record<string, number> = {};
  pedidos.forEach((p) => {
    const dia = dateToISO(new Date(p.created_at));
    porDiaMap[dia] = (porDiaMap[dia] || 0) + Number(p.total);
  });
  const tendencia = Object.keys(porDiaMap)
    .sort()
    .map((iso) => {
      const [, m, d] = iso.split('-');
      return { dia: `${d}/${m}`, label: `${d}/${m}`, valor: porDiaMap[iso] };
    });

  // Formas de pagamento ordenadas por faturamento (maior primeiro)
  const formasPagamento = Object.entries(kpisPorFormaPagamento).sort((a, b) => b[1].faturamento - a[1].faturamento);
  const faturamentoTotalFormas = formasPagamento.reduce((s, [, k]) => s + k.faturamento, 0);

  // Desempenho por dia da semana dentro do período (pra saber qual dia vende mais)
  const DIAS_SEMANA_NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const porDiaSemanaMap: Record<number, { faturamento: number; pedidos: number }> = {};
  pedidos.forEach((p) => {
    const dow = new Date(p.created_at).getDay();
    if (!porDiaSemanaMap[dow]) porDiaSemanaMap[dow] = { faturamento: 0, pedidos: 0 };
    porDiaSemanaMap[dow].faturamento += Number(p.total);
    porDiaSemanaMap[dow].pedidos += 1;
  });
  const porDiaSemana = DIAS_SEMANA_NOMES.map((nome, i) => ({ nome, ...(porDiaSemanaMap[i] || { faturamento: 0, pedidos: 0 }) }));
  const maxDiaSemana = Math.max(1, ...porDiaSemana.map((d) => d.faturamento));

  // Imprime o relatório do período selecionado (dia/semana/mês) na mesma
  // impressora térmica das comandas — reaproveita o layout do Fechamento do
  // Dia, sem despesas fixas (essas só fazem sentido por dia, não por período).
  const printRelatorio = () => {
    if (!config) return;
    const inicioStr = periodo.dataInicio.toLocaleDateString('pt-BR');
    const fimStr = periodo.dataFim.toLocaleDateString('pt-BR');
    const dataLabel = inicioStr === fimStr ? inicioStr : `${inicioStr} a ${fimStr}`;
    printFechamentoDia(
      dataLabel,
      kpis.faturamento,
      kpis.custoTotal,
      kpis.lucroTotal,
      0,
      kpis.lucroTotal,
      produtos.map((p) => ({ nome: p.nome, qtd: p.quantidade, lucro: p.lucro })),
      config,
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Sempre montado — se ficasse dentro do "if (loading)" abaixo, o seletor
          perderia o período escolhido (remontava do zero) toda vez que os dados
          recarregassem, voltando sempre para "Este Mês". */}
      <div className="flex items-center gap-3 flex-wrap">
        <PeriodSelector onPeriodChange={handlePeriodChange} defaultPeriod="mes" />
        <button onClick={printRelatorio} className="flex items-center gap-2 bg-neutral-200 text-neutral-900 px-4 py-2.5 rounded-xl text-sm hover:bg-neutral-700">
          <Printer size={18} /> Imprimir Relatório
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-center py-8">Carregando dados...</p>
      ) : (
        <>
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {([
          { id: 'resumo', label: 'Resumo', icon: BarChart3 },
          { id: 'produtos', label: 'Produtos', icon: Trophy },
          { id: 'tipo', label: 'Por Tipo', icon: TrendingUp },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTabAtiva(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${
              tabAtiva === t.id
                ? 'bg-[#E50914] text-white'
                : 'bg-neutral-200 text-neutral-500 hover:bg-neutral-700'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* RESUMO TAB */}
      {tabAtiva === 'resumo' && (
        <div className="space-y-4">
          {/* DRE + gráfico de custo vs lucro lado a lado */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-5">
              <h3 className="text-neutral-900 font-semibold mb-3">Demonstração de Resultado</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Faturamento</span>
                  <span className="text-neutral-900 font-medium">{brl(kpis.faturamento)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">(-) Custo dos Produtos</span>
                  <span className="text-orange-600">{brl(kpis.custoTotal)}</span>
                </div>
                <div className="flex justify-between border-t border-neutral-200 pt-2">
                  <span className="text-neutral-700 font-medium">Lucro Bruto</span>
                  <span className="text-[#22c55e] font-bold">{brl(kpis.lucroTotal)}</span>
                </div>
              </div>
            </div>
            <GraficoRosca custo={kpis.custoTotal} lucro={kpis.lucroTotal} />
          </div>

          {/* Tendência de faturamento no período */}
          <GraficoBarras data={tendencia} titulo="Faturamento por dia no período" />

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Ticket Médio" value={brl(kpis.ticketMedio)} color="text-neutral-900" />
            <StatCard label="Margem Média" value={`${kpis.margemMedia.toFixed(1)}%`} color="text-green-600" />
            <StatCard label="Margem Máxima" value={`${estatisticas.maxima.toFixed(1)}%`} color="text-[#22c55e]" />
            <StatCard label="Margem Mínima" value={`${estatisticas.minima.toFixed(1)}%`} color="text-red-600" />
            <StatCard label="Total Pedidos" value={String(kpis.pedidosCount)} color="text-neutral-900" />
            <StatCard label="Entregues" value={String(kpis.pedidosEntregues)} color="text-green-600" />
            <StatCard label="Em Andamento" value={String(kpis.pedidosEmAndamento)} color="text-amber-700" />
            <StatCard label="Cancelados" value={String(kpis.pedidosCancelados)} color="text-red-600" />
          </div>

          {/* Top 5 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={20} className="text-[#22c55e]" />
                <h3 className="text-neutral-900 font-semibold">Top 5 Mais Lucrativos</h3>
              </div>
              <div className="space-y-2">
                {top10Lucrativos.slice(0, 5).map((p, i) => (
                  <div key={p.nome} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-[#22c55e] text-black' : 'bg-neutral-200 text-neutral-500'
                    }`}>{i + 1}</span>
                    <span className="flex-1 text-neutral-900 text-sm">{p.nome}</span>
                    <span className="text-[#22c55e] font-semibold text-sm">{brl(p.lucro)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={20} className="text-[#E50914]" />
                <h3 className="text-neutral-900 font-semibold">Top 5 Mais Vendidos</h3>
              </div>
              <div className="space-y-2">
                {top10Vendidos.slice(0, 5).map((p, i) => (
                  <div key={p.nome} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-[#E50914] text-white' : 'bg-neutral-200 text-neutral-500'
                    }`}>{i + 1}</span>
                    <span className="flex-1 text-neutral-900 text-sm">{p.nome}</span>
                    <span className="text-neutral-500 text-sm">{p.quantidade}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Faturamento por forma de pagamento */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={20} className="text-[#22c55e]" />
              <h3 className="text-neutral-900 font-semibold">Faturamento por Forma de Pagamento</h3>
            </div>
            <div className="space-y-3">
              {formasPagamento.map(([forma, kpi]) => {
                const pct = faturamentoTotalFormas > 0 ? (kpi.faturamento / faturamentoTotalFormas) * 100 : 0;
                return (
                  <div key={forma}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-neutral-700">{forma}</span>
                      <span className="text-neutral-900 font-semibold">{brl(kpi.faturamento)} <span className="text-neutral-500 font-normal">({kpi.pedidosCount})</span></span>
                    </div>
                    <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#22c55e] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {formasPagamento.length === 0 && <p className="text-center text-neutral-500 text-sm py-4">Sem dados no período.</p>}
            </div>
          </div>

          {/* Desempenho por dia da semana */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5">
            <h3 className="text-neutral-900 font-semibold mb-3">Faturamento por Dia da Semana</h3>
            <div className="space-y-2.5">
              {porDiaSemana.map((d) => {
                const pct = (d.faturamento / maxDiaSemana) * 100;
                return (
                  <div key={d.nome} className="flex items-center gap-3">
                    <span className="text-neutral-500 text-xs w-16 flex-shrink-0">{d.nome}</span>
                    <div className="flex-1 h-5 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-essenza-terracotta to-[#E50914] rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-neutral-900 text-xs font-semibold w-20 text-right flex-shrink-0">{brl(d.faturamento)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PRODUTOS TAB */}
      {tabAtiva === 'produtos' && (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-neutral-100/50 border-b border-neutral-200">
            <h3 className="text-neutral-900 font-semibold">Análise de Produtos ({produtos.length} produtos)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-neutral-500 text-xs uppercase border-b border-neutral-200">
                  <th className="text-left px-4 py-2">Produto</th>
                  <th className="text-right px-2 py-2">Qtd</th>
                  <th className="text-right px-2 py-2">Custo</th>
                  <th className="text-right px-2 py-2">Venda</th>
                  <th className="text-right px-2 py-2">Lucro R$</th>
                  <th className="text-right px-4 py-2">Margem %</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.nome} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-100/30">
                    <td className="px-4 py-2 text-neutral-900">{p.nome}</td>
                    <td className="px-2 py-2 text-right text-neutral-500">{p.quantidade}</td>
                    <td className="px-2 py-2 text-right text-neutral-500">{brl(p.custo)}</td>
                    <td className="px-2 py-2 text-right text-neutral-900">{brl(p.venda)}</td>
                    <td className="px-2 py-2 text-right text-[#22c55e] font-semibold">{brl(p.lucro)}</td>
                    <td className="px-4 py-2 text-right text-green-600">{p.margem.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TIPO TAB */}
      {tabAtiva === 'tipo' && (
        <div className="space-y-4">
          {(() => {
            const totalFaturamento = Object.values(kpisPorTipo).reduce((s, k) => s + k.faturamento, 0);
            return Object.entries(kpisPorTipo)
              .sort((a, b) => b[1].faturamento - a[1].faturamento)
              .map(([tipo, kpi]) => {
                const pct = totalFaturamento > 0 ? (kpi.faturamento / totalFaturamento) * 100 : 0;
                return (
                  <div key={tipo} className="bg-white border border-neutral-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-neutral-900 font-semibold capitalize">{TIPO_LABELS[tipo] || tipo}</h3>
                      <span className="text-neutral-500 text-xs">{pct.toFixed(0)}% do faturamento</span>
                    </div>
                    <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden mb-4">
                      <div className="h-full bg-[#E50914] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div><p className="text-neutral-500">Faturamento</p><p className="text-neutral-900 font-bold">{brl(kpi.faturamento)}</p></div>
                      <div><p className="text-neutral-500">Lucro</p><p className="text-[#22c55e] font-bold">{brl(kpi.lucroTotal)}</p></div>
                      <div><p className="text-neutral-500">Pedidos</p><p className="text-neutral-900 font-bold">{kpi.pedidosCount}</p></div>
                      <div><p className="text-neutral-500">Ticket Médio</p><p className="text-neutral-900 font-bold">{brl(kpi.ticketMedio)}</p></div>
                      <div><p className="text-neutral-500">Margem Média</p><p className="text-green-600 font-bold">{kpi.margemMedia.toFixed(1)}%</p></div>
                    </div>
                  </div>
                );
              });
          })()}
        </div>
      )}

      {pedidos.length === 0 && (
        <div className="text-center py-12 text-neutral-500">
          <p>Nenhum pedido encontrado neste período.</p>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function Metas() {
  const { config } = useConfig();
  const [metas, setMetas] = useState<{ id: string; tipo: string; valor: number; periodo: string; ativo: boolean }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [valor, setValor] = useState('');
  const [periodo, setPeriodo] = useState('dia');
  const [faturamentoHoje, setFaturamentoHoje] = useState(0);
  const [faturamentoMes, setFaturamentoMes] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase.from('metas').select('*').order('created_at', { ascending: false });
    setMetas((data as typeof metas) || []);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const { data: peds } = await supabase.from('pedidos').select('total').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).neq('status', 'cancelado');
    setFaturamentoHoje((peds || []).reduce((s: number, p: { total: number }) => s + Number(p.total), 0));

    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const fimMes = new Date(inicioMes); fimMes.setMonth(fimMes.getMonth() + 1); fimMes.setDate(0); fimMes.setHours(23, 59, 59, 999);
    const { data: pedsMes } = await supabase.from('pedidos').select('total').gte('created_at', inicioMes.toISOString()).lte('created_at', fimMes.toISOString()).neq('status', 'cancelado');
    setFaturamentoMes((pedsMes || []).reduce((s: number, p: { total: number }) => s + Number(p.total), 0));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!valor) return;
    await supabase.from('metas').insert({ tipo: 'diaria', valor: parseFloat(valor), periodo, ativo: true });
    setValor(''); setShowForm(false);
    load();
  };

  const removeMeta = async (id: string) => {
    if (confirm('Excluir esta meta?')) {
      await supabase.from('metas').delete().eq('id', id);
      load();
    }
  };

  const metaDiaria = metas.find((m) => m.periodo === 'dia')?.valor || config?.meta_diaria || 0;
  const pct = metaDiaria > 0 ? Math.min((faturamentoHoje / metaDiaria) * 100, 100) : 0;

  const metaMensal = metas.find((m) => m.periodo === 'mes')?.valor || 0;
  const pctMes = metaMensal > 0 ? Math.min((faturamentoMes / metaMensal) * 100, 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar - dia */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-neutral-500">Meta do Dia</span>
          <span className="text-neutral-900 font-semibold">{brl(faturamentoHoje)} / {brl(metaDiaria)}</span>
        </div>
        <div className="h-6 bg-neutral-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#E50914] to-[#22c55e] rounded-full transition-all duration-500 flex items-center justify-end pr-2" style={{ width: `${pct}%` }}>
            {pct > 10 && <span className="text-black text-xs font-bold">{pct.toFixed(0)}%</span>}
          </div>
        </div>
        <p className="text-neutral-500 text-sm mt-2">
          {pct < 100 ? `Faltam ${brl(metaDiaria - faturamentoHoje)}` : 'Meta atingida!'}
        </p>
      </div>

      {/* Progress bar - mês */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-neutral-500">Meta do Mês</span>
          <span className="text-neutral-900 font-semibold">{brl(faturamentoMes)} / {brl(metaMensal)}</span>
        </div>
        {metaMensal > 0 ? (
          <>
            <div className="h-6 bg-neutral-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-essenza-terracotta to-essenza-italia-green rounded-full transition-all duration-500 flex items-center justify-end pr-2" style={{ width: `${pctMes}%` }}>
                {pctMes > 10 && <span className="text-white text-xs font-bold">{pctMes.toFixed(0)}%</span>}
              </div>
            </div>
            <p className="text-neutral-500 text-sm mt-2">
              {pctMes < 100 ? `Faltam ${brl(metaMensal - faturamentoMes)}` : 'Meta atingida!'}
            </p>
          </>
        ) : (
          <p className="text-neutral-500 text-sm">Nenhuma meta mensal definida ainda — crie uma abaixo com período "Mensal".</p>
        )}
      </div>

      <button onClick={() => setShowForm(true)} className="w-full bg-[#E50914] text-white py-3 rounded-xl font-bold">Nova Meta</button>

      <div className="space-y-2">
        {metas.map((m) => (
          <div key={m.id} className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target size={20} className="text-[#22c55e]" />
              <div>
                <p className="text-neutral-900 font-medium">Meta {{ dia: 'Diária', semana: 'Semanal', mes: 'Mensal' }[m.periodo] || m.periodo}</p>
                <p className="text-[#22c55e] font-bold">{brl(m.valor)}</p>
              </div>
            </div>
            <button onClick={() => removeMeta(m.id)} className="text-neutral-500 hover:text-red-600"><X size={18} /></button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-neutral-900 font-bold text-lg mb-4">Nova Meta</h3>
            <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (R$)" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mb-3 focus:border-[#E50914] focus:outline-none" />
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mb-4 focus:border-[#E50914] focus:outline-none">
              <option value="dia">Diária</option><option value="semana">Semanal</option><option value="mes">Mensal</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-200 text-neutral-500 rounded-xl">Cancelar</button>
              <button onClick={save} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
