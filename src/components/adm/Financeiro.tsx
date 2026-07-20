import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl, margemProduto } from '../../lib/format';
import { PeriodSelector } from '../PeriodSelector';
import { usePedidosPeriodo } from '../../hooks/usePedidosPeriodo';
import { calcularKPIs, agruparPorTipo, analisarProdutos, calcularEstatisticasMargem } from '../../lib/reportUtils';
import type { Pedido, CaixaEntry, ItemPedido } from '../../types';
import { Wallet, TrendingUp, DollarSign, ArrowUpCircle, ArrowDownCircle, FileText, Target, Trophy, Receipt, X, Printer, BarChart3 } from 'lucide-react';

type Tab = 'caixa' | 'fechamento' | 'relatorios' | 'metas';

export function Financeiro() {
  const [tab, setTab] = useState<Tab>('caixa');

  return (
    <div className="space-y-4 animate-fadeIn">
      <h2 className="text-2xl font-bold text-white">Financeiro</h2>

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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}
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
    const today = new Date().toISOString().slice(0, 10);
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
      data: new Date().toISOString().slice(0, 10),
    });
    setDescricao(''); setValor(''); setShowForm(false);
    load();
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowUpCircle size={20} className="text-green-400" /><span className="text-green-400/70 text-sm">Entradas</span></div>
          <p className="text-green-400 font-bold text-2xl">{brl(totalEntradas)}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowDownCircle size={20} className="text-red-400" /><span className="text-red-400/70 text-sm">Saídas</span></div>
          <p className="text-red-400 font-bold text-2xl">{brl(totalSaidas)}</p>
        </div>
        <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1"><DollarSign size={20} className="text-[#FFD700]" /><span className="text-[#FFD700]/70 text-sm">Saldo</span></div>
          <p className={`font-bold text-2xl ${saldo >= 0 ? 'text-[#FFD700]' : 'text-red-400'}`}>{brl(saldo)}</p>
        </div>
      </div>

      <button onClick={() => setShowForm(true)} className="w-full bg-[#E50914] text-white py-3 rounded-xl font-bold active:scale-95">
        Lançar Movimentação
      </button>

      {/* Entries */}
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${e.tipo === 'entrada' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                {e.tipo === 'entrada' ? <ArrowUpCircle size={20} className="text-green-400" /> : <ArrowDownCircle size={20} className="text-red-400" />}
              </div>
              <div>
                <p className="text-white text-sm font-medium">{e.descricao}</p>
                <p className="text-neutral-500 text-xs">{e.forma_pagamento}</p>
              </div>
            </div>
            <span className={`font-bold ${e.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>{e.tipo === 'entrada' ? '+' : '-'}{brl(e.valor)}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="text-center text-neutral-500 py-8">Nenhuma movimentação hoje</p>}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-4">Nova Movimentação</h3>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setTipo('entrada')} className={`flex-1 py-3 rounded-xl font-semibold ${tipo === 'entrada' ? 'bg-green-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>Entrada</button>
              <button onClick={() => setTipo('saida')} className={`flex-1 py-3 rounded-xl font-semibold ${tipo === 'saida' ? 'bg-red-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>Saída</button>
            </div>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mb-3 focus:border-[#E50914] focus:outline-none" />
            <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (R$)" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mb-3 focus:border-[#E50914] focus:outline-none" />
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mb-4 focus:border-[#E50914] focus:outline-none">
              <option>Dinheiro</option><option>Cartão</option><option>Pix</option><option>Outro</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-800 text-neutral-400 rounded-xl">Cancelar</button>
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
  const [dataFiltro, setDataFiltro] = useState(new Date().toISOString().slice(0, 10));

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
    const existing = document.getElementById('print-area');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'print-area';
    div.className = 'print-receipt';
    let linhas = '';
    produtos.forEach(([nome, d]) => {
      linhas += `<div>${d.qtd}x ${nome} - Lucro: ${brl(d.lucro)}</div>`;
    });
    div.innerHTML = `
      <div class="center"><b>FECHAMENTO DO DIA</b></div>
      <div class="center">${new Date(dataFiltro).toLocaleDateString('pt-BR')}</div>
      <div class="sep">--------------------------------</div>
      <div>Faturamento: ${brl(faturamento)}</div>
      <div>Custo Produtos: ${brl(custoTotal)}</div>
      <div>Lucro Bruto: ${brl(lucroBruto)}</div>
      <div>Despesas Fixas: ${brl(despesasFixas)}</div>
      <div class="total">LUCRO LIQUIDO: ${brl(lucroLiquido)}</div>
      <div class="sep">--------------------------------</div>
      <div><b>POR PRODUTO</b></div>
      ${linhas}
    `;
    document.body.appendChild(div);
    window.print();
    setTimeout(() => div.remove(), 1000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} className="bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white focus:border-[#E50914] focus:outline-none" />
        <button onClick={printFechamento} className="flex items-center gap-2 bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm hover:bg-neutral-700">
          <Printer size={18} /> Imprimir
        </button>
      </div>

      {/* Big result */}
      <div className="bg-gradient-to-br from-[#FFD700]/20 to-[#FFD700]/5 border border-[#FFD700]/30 rounded-2xl p-6 text-center">
        <p className="text-[#FFD700]/70 text-sm uppercase tracking-wide">Lucro Total do Dia</p>
        <p className="text-[#FFD700] font-black text-5xl">{brl(lucroLiquido)}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Faturamento" value={brl(faturamento)} color="text-white" />
        <StatCard label="Custo Produtos" value={brl(custoTotal)} color="text-orange-400" />
        <StatCard label="Lucro Bruto" value={brl(lucroBruto)} color="text-[#FFD700]" />
        <StatCard label="Despesas Fixas" value={brl(despesasFixas)} color="text-red-400" />
      </div>

      {/* Product breakdown */}
      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-neutral-900/50 border-b border-essenza-dark-border">
          <h3 className="text-white font-semibold">Lucro por Produto</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 text-xs uppercase border-b border-essenza-dark-border">
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
                <tr key={nome} className="border-b border-essenza-dark-border last:border-0">
                  <td className="px-4 py-2 text-white font-medium">{nome}</td>
                  <td className="px-2 py-2 text-right text-neutral-400">{d.qtd}</td>
                  <td className="px-2 py-2 text-right text-neutral-400">{brl(d.custo)}</td>
                  <td className="px-2 py-2 text-right text-white">{brl(d.venda)}</td>
                  <td className="px-2 py-2 text-right text-[#FFD700] font-semibold">{brl(d.lucro)}</td>
                  <td className="px-4 py-2 text-right text-green-400">{margemProduto(d.custo, d.venda).toFixed(0)}%</td>
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
    <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-4">
      <p className="text-neutral-500 text-xs uppercase">{label}</p>
      <p className={`font-bold text-xl mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Relatorios() {
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
  const produtos = analisarProdutos(pedidos, itensMap);
  const estatisticas = calcularEstatisticasMargem(kpis);

  const top10Lucrativos = produtos.slice(0, 10);
  const top10Vendidos = [...produtos].sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-neutral-400 text-center py-8">Carregando dados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <PeriodSelector onPeriodChange={handlePeriodChange} defaultPeriod="mes" />

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
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* RESUMO TAB */}
      {tabAtiva === 'resumo' && (
        <div className="space-y-4">
          {/* DRE */}
          <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-3">Demonstração de Resultado</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">Faturamento</span>
                <span className="text-white font-medium">{brl(kpis.faturamento)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">(-) Custo dos Produtos</span>
                <span className="text-orange-400">{brl(kpis.custoTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-essenza-dark-border pt-2">
                <span className="text-neutral-300 font-medium">Lucro Bruto</span>
                <span className="text-[#FFD700] font-bold">{brl(kpis.lucroTotal)}</span>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Ticket Médio" value={brl(kpis.ticketMedio)} color="text-white" />
            <StatCard label="Margem Média" value={`${kpis.margemMedia.toFixed(1)}%`} color="text-green-400" />
            <StatCard label="Margem Máxima" value={`${estatisticas.maxima.toFixed(1)}%`} color="text-[#FFD700]" />
            <StatCard label="Margem Mínima" value={`${estatisticas.minima.toFixed(1)}%`} color="text-red-400" />
            <StatCard label="Total Pedidos" value={String(kpis.pedidosCount)} color="text-white" />
            <StatCard label="Entregues" value={String(kpis.pedidosEntregues)} color="text-green-400" />
            <StatCard label="Em Andamento" value={String(kpis.pedidosEmAndamento)} color="text-yellow-400" />
            <StatCard label="Cancelados" value={String(kpis.pedidosCancelados)} color="text-red-400" />
          </div>

          {/* Top 5 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={20} className="text-[#FFD700]" />
                <h3 className="text-white font-semibold">Top 5 Mais Lucrativos</h3>
              </div>
              <div className="space-y-2">
                {top10Lucrativos.slice(0, 5).map((p, i) => (
                  <div key={p.nome} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-[#FFD700] text-black' : 'bg-neutral-800 text-neutral-400'
                    }`}>{i + 1}</span>
                    <span className="flex-1 text-white text-sm">{p.nome}</span>
                    <span className="text-[#FFD700] font-semibold text-sm">{brl(p.lucro)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={20} className="text-[#E50914]" />
                <h3 className="text-white font-semibold">Top 5 Mais Vendidos</h3>
              </div>
              <div className="space-y-2">
                {top10Vendidos.slice(0, 5).map((p, i) => (
                  <div key={p.nome} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}>{i + 1}</span>
                    <span className="flex-1 text-white text-sm">{p.nome}</span>
                    <span className="text-neutral-400 text-sm">{p.quantidade}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRODUTOS TAB */}
      {tabAtiva === 'produtos' && (
        <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-neutral-900/50 border-b border-essenza-dark-border">
            <h3 className="text-white font-semibold">Análise de Produtos ({produtos.length} produtos)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-neutral-500 text-xs uppercase border-b border-essenza-dark-border">
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
                  <tr key={p.nome} className="border-b border-essenza-dark-border last:border-0 hover:bg-neutral-900/30">
                    <td className="px-4 py-2 text-white">{p.nome}</td>
                    <td className="px-2 py-2 text-right text-neutral-400">{p.quantidade}</td>
                    <td className="px-2 py-2 text-right text-neutral-400">{brl(p.custo)}</td>
                    <td className="px-2 py-2 text-right text-white">{brl(p.venda)}</td>
                    <td className="px-2 py-2 text-right text-[#FFD700] font-semibold">{brl(p.lucro)}</td>
                    <td className="px-4 py-2 text-right text-green-400">{p.margem.toFixed(1)}%</td>
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
          {Object.entries(kpisPorTipo).map(([tipo, kpi]) => (
            <div key={tipo} className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 capitalize">Tipo: {tipo}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div><p className="text-neutral-400">Faturamento</p><p className="text-white font-bold">{brl(kpi.faturamento)}</p></div>
                <div><p className="text-neutral-400">Lucro</p><p className="text-[#FFD700] font-bold">{brl(kpi.lucroTotal)}</p></div>
                <div><p className="text-neutral-400">Pedidos</p><p className="text-white font-bold">{kpi.pedidosCount}</p></div>
                <div><p className="text-neutral-400">Ticket Médio</p><p className="text-white font-bold">{brl(kpi.ticketMedio)}</p></div>
                <div><p className="text-neutral-400">Margem Média</p><p className="text-green-400 font-bold">{kpi.margemMedia.toFixed(1)}%</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pedidos.length === 0 && (
        <div className="text-center py-12 text-neutral-500">
          <p>Nenhum pedido encontrado neste período.</p>
        </div>
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

  const load = useCallback(async () => {
    const { data } = await supabase.from('metas').select('*').order('created_at', { ascending: false });
    setMetas((data as typeof metas) || []);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const { data: peds } = await supabase.from('pedidos').select('total').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).neq('status', 'cancelado');
    setFaturamentoHoje((peds || []).reduce((s: number, p: { total: number }) => s + Number(p.total), 0));
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

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-neutral-400">Meta do Dia</span>
          <span className="text-white font-semibold">{brl(faturamentoHoje)} / {brl(metaDiaria)}</span>
        </div>
        <div className="h-6 bg-neutral-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#E50914] to-[#FFD700] rounded-full transition-all duration-500 flex items-center justify-end pr-2" style={{ width: `${pct}%` }}>
            {pct > 10 && <span className="text-black text-xs font-bold">{pct.toFixed(0)}%</span>}
          </div>
        </div>
        <p className="text-neutral-500 text-sm mt-2">
          {pct < 100 ? `Faltam ${brl(metaDiaria - faturamentoHoje)}` : 'Meta atingida!'}
        </p>
      </div>

      <button onClick={() => setShowForm(true)} className="w-full bg-[#E50914] text-white py-3 rounded-xl font-bold">Nova Meta</button>

      <div className="space-y-2">
        {metas.map((m) => (
          <div key={m.id} className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target size={20} className="text-[#FFD700]" />
              <div>
                <p className="text-white font-medium">Meta {m.periodo}</p>
                <p className="text-[#FFD700] font-bold">{brl(m.valor)}</p>
              </div>
            </div>
            <button onClick={() => removeMeta(m.id)} className="text-neutral-400 hover:text-red-400"><X size={18} /></button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-4">Nova Meta</h3>
            <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (R$)" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mb-3 focus:border-[#E50914] focus:outline-none" />
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mb-4 focus:border-[#E50914] focus:outline-none">
              <option value="dia">Diária</option><option value="semana">Semanal</option><option value="mes">Mensal</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-800 text-neutral-400 rounded-xl">Cancelar</button>
              <button onClick={save} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
