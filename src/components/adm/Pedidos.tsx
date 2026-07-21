import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { useAuth } from '../../context/AuthContext';
import { brl, fmtHora, fmtData } from '../../lib/format';
import { printReceipt } from '../../lib/print';
import type { Pedido, ItemPedido, PedidoStatus } from '../../types';
import { Search, Printer, Eye, Flame, Clock, CheckCircle, XCircle, Bike, ChefHat, Trash2, Lock, AlertTriangle } from 'lucide-react';
import { SenhaAdminModal } from '../SenhaAdminModal';

const STATUS_FLOW: PedidoStatus[] = ['recebido', 'preparo', 'forno', 'saiu', 'entregue'];
const STATUS_LABELS: Record<PedidoStatus, string> = {
  recebido: 'Recebido',
  preparo: 'Em Preparo',
  forno: 'No Forno',
  saiu: 'Saiu p/ Entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export function Pedidos() {
  const { config } = useConfig();
  const { usuario } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<'hoje' | 'todos' | 'ativos'>('ativos');
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pedido | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Pedido | null>(null);

  const isGerente = usuario?.role === 'gerente';

  const load = useCallback(async () => {
    let query = supabase.from('pedidos').select('*').order('created_at', { ascending: false }).limit(100);
    if (filtro === 'hoje') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
    } else if (filtro === 'ativos') {
      query = query.neq('status', 'entregue').neq('status', 'cancelado');
    }
    const { data } = await query;
    setPedidos((data as Pedido[]) || []);
  }, [filtro]);

  useEffect(() => { load(); }, [load]);

  const filtered = pedidos.filter((p) =>
    p.cliente_nome.toLowerCase().includes(busca.toLowerCase()) ||
    String(p.numero).includes(busca)
  );

  const updateStatus = async (pedido: Pedido, status: PedidoStatus) => {
    if (status === 'cancelado') {
      setCancelTarget(pedido);
      return;
    }
    await supabase.from('pedidos').update({ status, updated_at: new Date().toISOString() }).eq('id', pedido.id);
    load();
    if (selected?.id === pedido.id) setSelected({ ...selected, status });
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    await supabase.from('pedidos').update({ status: 'cancelado', updated_at: new Date().toISOString() }).eq('id', cancelTarget.id);
    setCancelTarget(null);
    if (selected?.id === cancelTarget.id) setSelected({ ...selected, status: 'cancelado' });
    load();
  };

  const deletePedido = async (pedido: Pedido) => {
    await supabase.from('itens_pedido').delete().eq('pedido_id', pedido.id);
    await supabase.from('caixa').delete().eq('pedido_id', pedido.id);
    await supabase.from('pedidos').delete().eq('id', pedido.id);
    setDeleteTarget(null);
    setSelected(null);
    load();
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <h2 className="text-2xl font-bold text-white">Pedidos</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-2">
          {(['ativos', 'hoje', 'todos'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${filtro === f ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}
            >{f === 'hoje' ? 'Hoje' : f === 'ativos' ? 'Ativos' : 'Todos'}</button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número ou cliente..."
            className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:border-[#E50914] focus:outline-none"
          />
        </div>
      </div>

      {/* Pedidos grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((p) => (
          <PedidoCard
            key={p.id}
            pedido={p}
            onView={() => loadItens(p)}
            onStatus={(s) => updateStatus(p, s)}
            canDelete={isGerente}
            onDelete={() => setDeleteTarget(p)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-neutral-500">Nenhum pedido encontrado</div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <PedidoDetail
          pedido={selected}
          onClose={() => setSelected(null)}
          onPrint={(via) => config && printReceipt(selected, config, via)}
          onStatus={(s) => updateStatus(selected, s)}
          canDelete={isGerente}
          onDelete={() => setDeleteTarget(selected)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          pedido={deleteTarget}
          senhaTabela={config?.senha_tabela || '1234'}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deletePedido(deleteTarget)}
        />
      )}

      {/* Cancel authorization modal */}
      {cancelTarget && (
        <SenhaAdminModal
          title="Autorizar Cancelamento"
          description={`Cancelar pedido #${cancelTarget.numero}`}
          confirmLabel="Cancelar Pedido"
          senhaEsperada={config?.senha_tabela || '9876'}
          onConfirm={confirmCancel}
          onCancel={() => setCancelTarget(null)}
          danger
        />
      )}
    </div>
  );

  async function loadItens(p: Pedido) {
    const { data } = await supabase.from('itens_pedido').select('*').eq('pedido_id', p.id);
    setSelected({ ...p, itens: (data as ItemPedido[]) || [] });
  }
}

function DeleteConfirmModal({ pedido, senhaTabela, onCancel, onConfirm }: {
  pedido: Pedido;
  senhaTabela: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    if (senha === senhaTabela) {
      onConfirm();
    } else {
      setError('Senha incorreta. Exclusão negada.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-essenza-dark-card border border-red-900/50 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">Excluir Venda</h3>
            <p className="text-neutral-400 text-sm">Pedido #{pedido.numero}</p>
          </div>
        </div>

        <div className="bg-red-950/40 border border-red-900/40 rounded-xl p-3 mb-4">
          <p className="text-red-300 text-sm">
            Esta acao ira <b>excluir permanentemente</b> o pedido #{pedido.numero}, seus itens e o lancamento no caixa.
            O lucro e faturamento do dia serao recalculados.
          </p>
        </div>

        <div className="flex items-center justify-between bg-neutral-900 rounded-xl p-3 mb-4">
          <div>
            <p className="text-neutral-500 text-xs">Valor da venda</p>
            <p className="text-[#22c55e] font-bold text-lg">{brl(pedido.total)}</p>
          </div>
          <div className="text-right">
            <p className="text-neutral-500 text-xs">Cliente</p>
            <p className="text-white text-sm">{pedido.cliente_nome}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-neutral-400 text-sm flex items-center gap-1.5 mb-1.5">
            <Lock size={14} /> Senha do Gerente
          </label>
          <input
            type="password"
            value={senha}
            onChange={(e) => { setSenha(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            placeholder="Digite a senha para confirmar"
            className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-red-500 focus:outline-none"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 text-neutral-300 rounded-xl font-medium">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={!senha} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold disabled:opacity-50">
            Excluir Venda
          </button>
        </div>
      </div>
    </div>
  );
}

function statusColor(status: PedidoStatus): string {
  switch (status) {
    case 'recebido': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'preparo': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'forno': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'saiu': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'entregue': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'cancelado': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-neutral-700 text-neutral-300';
  }
}

function statusIcon(status: PedidoStatus) {
  switch (status) {
    case 'recebido': return <Clock size={14} />;
    case 'preparo': return <ChefHat size={14} />;
    case 'forno': return <Flame size={14} />;
    case 'saiu': return <Bike size={14} />;
    case 'entregue': return <CheckCircle size={14} />;
    case 'cancelado': return <XCircle size={14} />;
  }
}

function PedidoCard({ pedido, onView, onStatus, canDelete, onDelete }: {
  pedido: Pedido;
  onView: () => void;
  onStatus: (s: PedidoStatus) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const nextIndex = STATUS_FLOW.indexOf(pedido.status) + 1;
  const nextStatus = nextIndex < STATUS_FLOW.length ? STATUS_FLOW[nextIndex] : null;

  return (
    <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-4 hover:border-neutral-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-black text-lg">#{pedido.numero}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusColor(pedido.status)}`}>
              {statusIcon(pedido.status)} {STATUS_LABELS[pedido.status]}
            </span>
          </div>
          <p className="text-neutral-400 text-sm mt-1">{pedido.cliente_nome}</p>
          <p className="text-neutral-500 text-xs">{fmtHora(pedido.created_at)} · {pedido.tipo}</p>
        </div>
        <span className="text-[#22c55e] font-bold text-lg">{brl(pedido.total)}</span>
      </div>

      <div className="flex gap-2">
        <button onClick={onView} className="flex-1 py-2 bg-neutral-800 text-neutral-300 rounded-xl text-sm font-medium hover:bg-neutral-700 flex items-center justify-center gap-1">
          <Eye size={16} /> Ver
        </button>
        {nextStatus && (
          <button onClick={() => onStatus(nextStatus)} className="flex-1 py-2 bg-[#E50914] text-white rounded-xl text-sm font-medium hover:bg-[#f6121d]">
            {STATUS_LABELS[nextStatus]}
          </button>
        )}
        {pedido.status !== 'cancelado' && pedido.status !== 'entregue' && (
          <button onClick={() => onStatus('cancelado')} className="py-2 px-3 bg-neutral-800 text-red-400 rounded-xl text-sm hover:bg-red-950">
            <XCircle size={16} />
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} className="py-2 px-3 bg-neutral-800 text-red-400 rounded-xl text-sm hover:bg-red-950" title="Excluir venda">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function PedidoDetail({ pedido, onClose, onPrint, onStatus, canDelete, onDelete }: {
  pedido: Pedido;
  onClose: () => void;
  onPrint: (via: 'cozinha' | 'caixa') => void;
  onStatus: (s: PedidoStatus) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const nextIndex = STATUS_FLOW.indexOf(pedido.status) + 1;
  const nextStatus = nextIndex < STATUS_FLOW.length ? STATUS_FLOW[nextIndex] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-black text-2xl">Pedido #{pedido.numero}</h3>
            <p className="text-neutral-400 text-sm">{fmtData(pedido.created_at)}</p>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full border flex items-center gap-1.5 ${statusColor(pedido.status)}`}>
            {statusIcon(pedido.status)} {STATUS_LABELS[pedido.status]}
          </span>
        </div>

        {/* Cliente */}
        <div className="bg-neutral-900 rounded-xl p-3 mb-4 space-y-1">
          <p className="text-white font-medium">{pedido.cliente_nome}</p>
          {pedido.cliente_telefone && <p className="text-neutral-400 text-sm">Tel: {pedido.cliente_telefone}</p>}
          {pedido.cliente_endereco && <p className="text-neutral-400 text-sm">End: {pedido.cliente_endereco}</p>}
          {pedido.cliente_bairro && <p className="text-neutral-400 text-sm">Bairro: {pedido.cliente_bairro}</p>}
          {pedido.observacao && <p className="text-yellow-400 text-sm mt-1">Obs: {pedido.observacao}</p>}
        </div>

        {/* Itens */}
        <div className="space-y-2 mb-4">
          {pedido.itens?.map((item, i) => (
            <div key={i} className="border-b border-essenza-dark-border pb-2">
              <p className="text-white font-medium">{item.quantidade}x {item.produto_nome}</p>
              {item.sabor1 && <p className="text-neutral-400 text-sm">Sabores: {[item.sabor1, item.sabor2].filter(Boolean).join(' / ')}</p>}
              {item.adicional && <p className="text-neutral-400 text-sm">+ {item.adicional}</p>}
              {item.observacao && <p className="text-yellow-400 text-sm">Obs: {item.observacao}</p>}
              <p className="text-[#22c55e] text-sm font-semibold">{brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}</p>
            </div>
          ))}
          {(!pedido.itens || pedido.itens.length === 0) && (
            <p className="text-neutral-500 text-sm">Carregando itens...</p>
          )}
        </div>

        {/* Totals */}
        <div className="bg-neutral-900 rounded-xl p-3 space-y-1 mb-4">
          <div className="flex justify-between text-neutral-400 text-sm"><span>Subtotal</span><span>{brl(pedido.subtotal)}</span></div>
          {pedido.taxa_entrega > 0 && <div className="flex justify-between text-neutral-400 text-sm"><span>Entrega</span><span>{brl(pedido.taxa_entrega)}</span></div>}
          <div className="flex justify-between text-white font-bold text-lg border-t border-essenza-dark-border pt-1"><span>Total</span><span className="text-[#22c55e]">{brl(pedido.total)}</span></div>
          <div className="flex justify-between text-neutral-400 text-sm"><span>Pagamento</span><span>{pedido.forma_pagamento}</span></div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={() => onPrint('cozinha')} className="flex items-center justify-center gap-2 py-3 bg-neutral-800 text-white rounded-xl font-medium hover:bg-neutral-700">
            <Printer size={18} /> Cozinha
          </button>
          <button onClick={() => onPrint('caixa')} className="flex items-center justify-center gap-2 py-3 bg-neutral-800 text-white rounded-xl font-medium hover:bg-neutral-700">
            <Printer size={18} /> Caixa
          </button>
        </div>

        {nextStatus && (
          <button onClick={() => onStatus(nextStatus)} className="w-full py-3 bg-[#E50914] text-white rounded-xl font-bold mb-2">
            Avançar para: {STATUS_LABELS[nextStatus]}
          </button>
        )}
        {pedido.status !== 'entregue' && pedido.status !== 'cancelado' && (
          <button onClick={() => onStatus('cancelado')} className="w-full py-2 text-red-400 text-sm">Cancelar pedido</button>
        )}

        {/* Delete - only gerente */}
        {canDelete && (
          <button onClick={onDelete} className="w-full py-3 mt-3 bg-red-600/20 border border-red-600/40 text-red-400 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-red-600/30">
            <Trash2 size={18} /> Excluir Venda (Gerente)
          </button>
        )}
        <button onClick={onClose} className="w-full py-2 text-neutral-400 text-sm mt-2">Fechar</button>
      </div>
    </div>
  );
}
