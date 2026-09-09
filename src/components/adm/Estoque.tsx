import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { brl } from '../../lib/format';
import type { Ingrediente, Produto, FichaTecnica } from '../../types';
import { Package, Plus, Pencil, Trash2, X, AlertTriangle, Link2, FlaskConical, TrendingDown } from 'lucide-react';

type Tab = 'ingredientes' | 'ficha' | 'previsao';

export function Estoque() {
  const [tab, setTab] = useState<Tab>('ingredientes');

  return (
    <div className="space-y-4 animate-fadeIn">
      <h2 className="text-2xl font-bold text-neutral-900">Estoque & Custo</h2>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setTab('ingredientes')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${tab === 'ingredientes' ? 'bg-[#B5652E] text-white' : 'bg-neutral-200 text-neutral-500'}`}>
          <Package size={16} /> Ingredientes
        </button>
        <button onClick={() => setTab('ficha')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${tab === 'ficha' ? 'bg-[#B5652E] text-white' : 'bg-neutral-200 text-neutral-500'}`}>
          <FlaskConical size={16} /> Ficha Técnica
        </button>
        <button onClick={() => setTab('previsao')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${tab === 'previsao' ? 'bg-[#B5652E] text-white' : 'bg-neutral-200 text-neutral-500'}`}>
          <TrendingDown size={16} /> Previsão de Consumo
        </button>
      </div>

      {tab === 'ingredientes' && <Ingredientes />}
      {tab === 'ficha' && <FichaTecnicaView />}
      {tab === 'previsao' && <PrevisaoConsumo />}
    </div>
  );
}

// ===== Previsão de consumo — cruza estoque atual com a velocidade de venda
// real dos últimos 30 dias, pra saber quantos dias de estoque restam em cada
// ingrediente no ritmo atual (não só alertar quando já está baixo). =====
function PrevisaoConsumo() {
  const [linhas, setLinhas] = useState<{
    ingrediente: Ingrediente;
    consumoDiario: number;
    diasRestantes: number | null;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);

    const [ingRes, fichaRes, itensRes] = await Promise.all([
      supabase.from('ingredientes').select('*').order('nome'),
      supabase.from('ficha_tecnica').select('*'),
      supabase
        .from('itens_pedido')
        .select('produto_id, quantidade, pedidos!inner(created_at, status)')
        .gte('pedidos.created_at', desde.toISOString())
        .neq('pedidos.status', 'cancelado'),
    ]);

    const ingredientes = (ingRes.data as Ingrediente[]) || [];
    const fichas = (fichaRes.data as FichaTecnica[]) || [];
    const itens = (itensRes.data as any[]) || [];

    // Quantidade vendida de cada produto nos últimos 30 dias
    const vendidoPorProduto: Record<string, number> = {};
    itens.forEach((it) => {
      if (!it.produto_id) return;
      vendidoPorProduto[it.produto_id] = (vendidoPorProduto[it.produto_id] || 0) + Number(it.quantidade || 0);
    });

    // Consumo total de cada ingrediente = soma, por ficha técnica, de
    // (quantidade vendida do produto × quantidade do ingrediente por unidade)
    const consumoPorIngrediente: Record<string, number> = {};
    fichas.forEach((f) => {
      const vendido = vendidoPorProduto[f.produto_id] || 0;
      if (vendido === 0) return;
      consumoPorIngrediente[f.ingrediente_id] = (consumoPorIngrediente[f.ingrediente_id] || 0) + vendido * Number(f.quantidade || 0);
    });

    const resultado = ingredientes.map((ing) => {
      const consumoTotal30d = consumoPorIngrediente[ing.id] || 0;
      const consumoDiario = consumoTotal30d / 30;
      const diasRestantes = consumoDiario > 0 ? ing.estoque_atual / consumoDiario : null;
      return { ingrediente: ing, consumoDiario, diasRestantes };
    });

    // Sem consumo nos últimos 30 dias fica por último (não é urgente saber "dias restantes" de algo que não sai)
    resultado.sort((a, b) => {
      if (a.diasRestantes === null && b.diasRestantes === null) return 0;
      if (a.diasRestantes === null) return 1;
      if (b.diasRestantes === null) return -1;
      return a.diasRestantes - b.diasRestantes;
    });

    setLinhas(resultado);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-neutral-500 text-center py-8">Calculando previsão...</p>;

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 bg-neutral-100/50 border-b border-neutral-200">
        <h3 className="text-neutral-900 font-semibold">Dias de estoque restantes no ritmo de venda dos últimos 30 dias</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-500 text-xs uppercase border-b border-neutral-200">
              <th className="text-left px-4 py-2">Ingrediente</th>
              <th className="text-right px-2 py-2">Estoque Atual</th>
              <th className="text-right px-2 py-2">Consumo/Dia</th>
              <th className="text-right px-4 py-2">Dias Restantes</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ ingrediente, consumoDiario, diasRestantes }) => {
              const urgente = diasRestantes !== null && diasRestantes <= 7;
              const atencao = diasRestantes !== null && diasRestantes > 7 && diasRestantes <= 14;
              return (
                <tr key={ingrediente.id} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-100/30">
                  <td className="px-4 py-2 text-neutral-900 flex items-center gap-2">
                    {urgente && <AlertTriangle size={14} className="text-red-600" />}
                    {ingrediente.nome}
                  </td>
                  <td className="px-2 py-2 text-right text-neutral-500">{ingrediente.estoque_atual} {ingrediente.unidade}</td>
                  <td className="px-2 py-2 text-right text-neutral-500">{consumoDiario > 0 ? `${consumoDiario.toFixed(2)} ${ingrediente.unidade}` : '—'}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${urgente ? 'text-red-600' : atencao ? 'text-amber-600' : diasRestantes === null ? 'text-neutral-400' : 'text-green-600'}`}>
                    {diasRestantes === null ? 'Sem venda recente' : `${Math.floor(diasRestantes)} dias`}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr><td colSpan={4} className="text-center text-neutral-500 py-6">Nenhum ingrediente cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Ingredientes() {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ingrediente | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('ingredientes').select('*').order('nome');
    setIngredientes((data as Ingrediente[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    if (confirm('Excluir ingrediente?')) { await supabase.from('ingredientes').delete().eq('id', id); load(); }
  };

  const recalcProduto = async (ingredienteId: string) => {
    // Recalculate all products that use this ingredient
    const { data: fichas } = await supabase.from('ficha_tecnica').select('produto_id, quantidade').eq('ingrediente_id', ingredienteId);
    if (!fichas) return;
    const ing = ingredientes.find((i) => i.id === ingredienteId);
    if (!ing) return;
    for (const f of fichas) {
      const { data: allFichas } = await supabase.from('ficha_tecnica').select('ingrediente_id, quantidade').eq('produto_id', f.produto_id);
      let custo = 0;
      for (const af of allFichas || []) {
        const ingAf = ingredientes.find((i) => i.id === af.ingrediente_id);
        if (ingAf) custo += ingAf.custo_por_unidade * af.quantidade;
      }
      await supabase.from('produtos').update({ custo }).eq('id', f.produto_id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-neutral-500 text-sm">Cadastro de ingredientes e controle de estoque</p>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-[#B5652E] text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <Plus size={18} /> Novo
        </button>
      </div>

      {/* Low stock alerts */}
      {ingredientes.filter((i) => i.estoque_atual <= i.estoque_minimo && i.estoque_minimo > 0).length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={20} className="text-amber-700" /><span className="text-amber-700 font-medium text-sm">Estoque Baixo</span></div>
          <div className="space-y-1">
            {ingredientes.filter((i) => i.estoque_atual <= i.estoque_minimo && i.estoque_minimo > 0).map((i) => (
              <p key={i.id} className="text-amber-700/70 text-sm">{i.nome}: {i.estoque_atual} {i.unidade} (mín: {i.estoque_minimo})</p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ingredientes.map((ing) => (
          <div key={ing.id} className="bg-white border border-neutral-200 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-neutral-900 font-medium">{ing.nome}</p>
                <p className="text-neutral-500 text-sm">{brl(ing.custo_por_unidade)} / {ing.unidade}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(ing); setShowForm(true); }} className="p-1 text-neutral-500 hover:text-neutral-900"><Pencil size={14} /></button>
                <button onClick={() => remove(ing.id)} className="p-1 text-neutral-500 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-200">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Estoque:</span>
                <span className={ing.estoque_atual <= ing.estoque_minimo && ing.estoque_minimo > 0 ? 'text-amber-600 font-semibold' : 'text-neutral-900'}>
                  {ing.estoque_atual} {ing.unidade}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Mínimo:</span>
                <span className="text-neutral-500">{ing.estoque_minimo} {ing.unidade}</span>
              </div>
            </div>
          </div>
        ))}
        {ingredientes.length === 0 && <p className="col-span-full text-center text-neutral-500 py-6">Nenhum ingrediente cadastrado</p>}
      </div>

      {showForm && <IngredienteForm ingrediente={editing} onClose={() => setShowForm(false)} onSave={async (id) => { setShowForm(false); await load(); if (id) await recalcProduto(id); }} />}
    </div>
  );
}

function IngredienteForm({ ingrediente, onClose, onSave }: { ingrediente: Ingrediente | null; onClose: () => void; onSave: (id?: string) => void }) {
  const [nome, setNome] = useState(ingrediente?.nome || '');
  const [unidade, setUnidade] = useState(ingrediente?.unidade || 'kg');
  const [custo, setCusto] = useState(String(ingrediente?.custo_por_unidade ?? ''));
  const [estoque, setEstoque] = useState(String(ingrediente?.estoque_atual ?? ''));
  const [minimo, setMinimo] = useState(String(ingrediente?.estoque_minimo ?? ''));

  const save = async () => {
    const data = { nome, unidade, custo_por_unidade: parseFloat(custo) || 0, estoque_atual: parseFloat(estoque) || 0, estoque_minimo: parseFloat(minimo) || 0 };
    let id = ingrediente?.id;
    if (ingrediente) {
      await supabase.from('ingredientes').update(data).eq('id', ingrediente.id);
    } else {
      const { data: created } = await supabase.from('ingredientes').insert(data).select().maybeSingle();
      id = (created as Ingrediente)?.id;
    }
    onSave(id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-neutral-900 font-bold text-lg mb-4">{ingrediente ? 'Editar' : 'Novo'} Ingrediente</h3>
        <div className="space-y-3">
          <div>
            <label className="text-neutral-500 text-sm">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1 focus:border-[#B5652E] focus:outline-none" />
          </div>
          <div>
            <label className="text-neutral-500 text-sm">Unidade</label>
            <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1">
              <option value="kg">kg</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option><option value="un">unidade</option>
            </select>
          </div>
          <div>
            <label className="text-neutral-500 text-sm">Custo por {unidade} (R$)</label>
            <input type="number" step="0.01" value={custo} onChange={(e) => setCusto(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1 focus:border-[#B5652E] focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-neutral-500 text-sm">Estoque Atual</label>
              <input type="number" step="0.001" value={estoque} onChange={(e) => setEstoque(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1 focus:border-[#B5652E] focus:outline-none" />
            </div>
            <div>
              <label className="text-neutral-500 text-sm">Estoque Mínimo</label>
              <input type="number" step="0.001" value={minimo} onChange={(e) => setMinimo(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1 focus:border-[#B5652E] focus:outline-none" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-200 text-neutral-500 rounded-xl">Cancelar</button>
          <button onClick={save} disabled={!nome} className="flex-1 py-3 bg-[#B5652E] text-white rounded-xl font-semibold disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  );
}

function FichaTecnicaView() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null);
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);

  const load = useCallback(async () => {
    const [{ data: p }, { data: i }] = await Promise.all([
      supabase.from('produtos').select('*').order('categoria_nome').order('nome'),
      supabase.from('ingredientes').select('*').order('nome'),
    ]);
    setProdutos((p as Produto[]) || []);
    setIngredientes((i as Ingrediente[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadFichas = async (produtoId: string) => {
    const { data } = await supabase.from('ficha_tecnica').select('*').eq('produto_id', produtoId);
    setFichas((data as FichaTecnica[]) || []);
  };

  const custoCalculado = fichas.reduce((s, f) => {
    const ing = ingredientes.find((i) => i.id === f.ingrediente_id);
    return s + (ing ? ing.custo_por_unidade * f.quantidade : 0);
  }, 0);

  const addFicha = async (ingredienteId: string, quantidade: number) => {
    if (!selectedProduto || !ingredienteId) return;
    await supabase.from('ficha_tecnica').insert({ produto_id: selectedProduto.id, ingrediente_id: ingredienteId, quantidade });
    loadFichas(selectedProduto.id);
    // Update product cost
    const newCusto = custoCalculado + (ingredientes.find((i) => i.id === ingredienteId)?.custo_por_unidade || 0) * quantidade;
    await supabase.from('produtos').update({ custo: newCusto }).eq('id', selectedProduto.id);
  };

  const removeFicha = async (fichaId: string) => {
    await supabase.from('ficha_tecnica').delete().eq('id', fichaId);
    if (selectedProduto) loadFichas(selectedProduto.id);
  };

  return (
    <div className="space-y-4">
      <p className="text-neutral-500 text-sm">Vincule ingredientes aos produtos. O custo do produto é recalculado automaticamente.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Product list */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <h3 className="text-neutral-900 font-semibold mb-3">Produtos</h3>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {produtos.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedProduto(p); loadFichas(p.id); }}
                className={`w-full text-left p-3 rounded-xl flex items-center justify-between ${selectedProduto?.id === p.id ? 'bg-[#B5652E] text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
              >
                <div>
                  <span className="font-medium text-sm">{p.nome}</span>
                  <span className="text-xs opacity-60 block">{p.categoria_nome}</span>
                </div>
                <span className="text-xs opacity-70">Custo: {brl(p.custo)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Ficha técnica */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          {selectedProduto ? (
            <>
              <h3 className="text-neutral-900 font-semibold mb-2">Ficha Técnica: {selectedProduto.nome}</h3>
              <div className="flex items-center gap-2 mb-3 text-sm">
                <span className="text-neutral-500">Custo Atual:</span>
                <span className="text-[#22c55e] font-bold">{brl(custoCalculado || selectedProduto.custo)}</span>
              </div>

              {/* Linked ingredients */}
              <div className="space-y-2 mb-4">
                {fichas.map((f) => {
                  const ing = ingredientes.find((i) => i.id === f.ingrediente_id);
                  if (!ing) return null;
                  return (
                    <div key={f.id} className="flex items-center justify-between bg-neutral-100 rounded-xl p-2.5">
                      <div className="flex items-center gap-2">
                        <Link2 size={14} className="text-[#B5652E]" />
                        <span className="text-neutral-900 text-sm">{ing.nome}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500 text-sm">{f.quantidade} {ing.unidade}</span>
                        <span className="text-[#22c55e] text-sm">{brl(ing.custo_por_unidade * f.quantidade)}</span>
                        <button onClick={() => removeFicha(f.id)} className="text-neutral-500 hover:text-red-600"><X size={14} /></button>
                      </div>
                    </div>
                  );
                })}
                {fichas.length === 0 && <p className="text-neutral-500 text-sm py-2">Nenhum ingrediente vinculado</p>}
              </div>

              {/* Add ingredient */}
              <AddIngredienteRow ingredientes={ingredientes} onAdd={addFicha} />
            </>
          ) : (
            <div className="text-center py-12 text-neutral-500">Selecione um produto</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddIngredienteRow({ ingredientes, onAdd }: { ingredientes: Ingrediente[]; onAdd: (id: string, qtd: number) => void }) {
  const [selId, setSelId] = useState('');
  const [qtd, setQtd] = useState('');

  return (
    <div className="flex gap-2">
      <select value={selId} onChange={(e) => setSelId(e.target.value)} className="flex-1 bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 text-sm focus:border-[#B5652E] focus:outline-none">
        <option value="">Ingrediente...</option>
        {ingredientes.map((i) => <option key={i.id} value={i.id}>{i.nome} ({brl(i.custo_por_unidade)}/{i.unidade})</option>)}
      </select>
      <input type="number" step="0.001" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="Qtd" className="w-20 bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 text-sm focus:border-[#B5652E] focus:outline-none" />
      <button onClick={() => { if (selId && qtd) { onAdd(selId, parseFloat(qtd)); setSelId(''); setQtd(''); } }} className="px-3 py-2 bg-[#B5652E] text-white rounded-xl">
        <Plus size={16} />
      </button>
    </div>
  );
}
