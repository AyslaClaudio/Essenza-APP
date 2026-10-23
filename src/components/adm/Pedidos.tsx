import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { useAuth } from '../../context/AuthContext';
import { brl, fmtHora, fmtData } from '../../lib/format';
import { printReceipt } from '../../lib/print';
import { ultimoErroImpressao } from '../../lib/bluetoothPrinter';
import type { Pedido, ItemPedido, PedidoStatus } from '../../types';
import { Search, Printer, Eye, CheckCircle, XCircle, Bike, Trash2, Lock, AlertTriangle, Users, ListChecks } from 'lucide-react';
import { SenhaAdminModal } from '../SenhaAdminModal';

const STATUS_FLOW: PedidoStatus[] = ['confirmado', 'entregue'];
const STATUS_LABELS: Record<PedidoStatus, string> = {
  confirmado: 'Confirmado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

// buscaInicial vem da busca global do topo do app (Adm.tsx).
export function Pedidos({ buscaInicial }: { buscaInicial?: { valor: string; nonce: number } } = {}) {
  const { config } = useConfig();
  const { usuario } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<'hoje' | 'todos' | 'ativos'>('ativos');
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pedido | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Pedido | null>(null);
  const [splitTarget, setSplitTarget] = useState<Pedido | null>(null);

  useEffect(() => {
    if (buscaInicial) {
      setBusca(buscaInicial.valor);
      setFiltro('todos'); // senão um pedido já entregue/antigo pode não aparecer
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInicial?.nonce]);

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
      <h2 className="text-2xl font-bold text-neutral-900">Pedidos</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-2">
          {(['ativos', 'hoje', 'todos'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${filtro === f ? 'bg-[#B91C1C] text-white' : 'bg-neutral-200 text-neutral-500'}`}
            >{f === 'hoje' ? 'Hoje' : f === 'ativos' ? 'Ativos' : 'Todos'}</button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número ou cliente..."
            className="w-full bg-neutral-100 border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-neutral-900 text-sm focus:border-[#B91C1C] focus:outline-none"
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
          onPrint={(via) => {
            if (!config) throw new Error('Não foi possível carregar a configuração da loja. Atualize o app e tente novamente.');
            return printReceipt(selected, config, via);
          }}
          onStatus={(s) => updateStatus(selected, s)}
          onSplit={() => setSplitTarget(selected)}
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

      {splitTarget && (
        <SplitPaymentModal
          pedido={splitTarget}
          onClose={() => setSplitTarget(null)}
          onSaved={(forma) => {
            setSplitTarget(null);
            if (selected?.id === splitTarget.id) setSelected({ ...selected, forma_pagamento: forma });
            load();
          }}
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
      <div className="bg-white border border-red-900/50 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-neutral-900 font-bold text-lg">Excluir Venda</h3>
            <p className="text-neutral-500 text-sm">Pedido #{pedido.numero}</p>
          </div>
        </div>

        <div className="bg-red-950/40 border border-red-900/40 rounded-xl p-3 mb-4">
          <p className="text-red-300 text-sm">
            Esta acao ira <b>excluir permanentemente</b> o pedido #{pedido.numero}, seus itens e o lancamento no caixa.
            O lucro e faturamento do dia serao recalculados.
          </p>
        </div>

        <div className="flex items-center justify-between bg-neutral-100 rounded-xl p-3 mb-4">
          <div>
            <p className="text-neutral-500 text-xs">Valor da venda</p>
            <p className="text-[#22c55e] font-bold text-lg">{brl(pedido.total)}</p>
          </div>
          <div className="text-right">
            <p className="text-neutral-500 text-xs">Cliente</p>
            <p className="text-neutral-900 text-sm">{pedido.cliente_nome}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-neutral-500 text-sm flex items-center gap-1.5 mb-1.5">
            <Lock size={14} /> Senha do Gerente
          </label>
          <input
            type="password"
            value={senha}
            onChange={(e) => { setSenha(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            placeholder="Digite a senha para confirmar"
            className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-red-500 focus:outline-none"
            autoFocus
          />
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-200 text-neutral-700 rounded-xl font-medium">
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
    case 'confirmado': return 'bg-blue-500/20 text-blue-600 border-blue-500/30';
    case 'entregue': return 'bg-green-500/20 text-green-600 border-green-500/30';
    case 'cancelado': return 'bg-red-500/20 text-red-600 border-red-500/30';
    default: return 'bg-neutral-700 text-neutral-300';
  }
}

function statusIcon(status: PedidoStatus) {
  switch (status) {
    case 'confirmado': return <Bike size={14} />;
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
    <div className="bg-white border border-neutral-200 rounded-2xl p-4 hover:border-neutral-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-900 font-black text-lg">#{pedido.numero}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusColor(pedido.status)}`}>
              {statusIcon(pedido.status)} {STATUS_LABELS[pedido.status]}
            </span>
          </div>
          <p className="text-neutral-500 text-sm mt-1">{pedido.cliente_nome}</p>
          <p className="text-neutral-500 text-xs">{fmtHora(pedido.created_at)} · {pedido.tipo}</p>
        </div>
        <span className="text-[#22c55e] font-bold text-lg">{brl(pedido.total)}</span>
      </div>

      <div className="flex gap-2">
        <button onClick={onView} className="flex-1 py-2 bg-neutral-200 text-neutral-700 rounded-xl text-sm font-medium hover:bg-neutral-700 flex items-center justify-center gap-1">
          <Eye size={16} /> Ver
        </button>
        {nextStatus && (
          <button onClick={() => onStatus(nextStatus)} className="flex-1 py-2 bg-[#B91C1C] text-white rounded-xl text-sm font-medium hover:bg-[#f6121d]">
            {STATUS_LABELS[nextStatus]}
          </button>
        )}
        {pedido.status !== 'cancelado' && pedido.status !== 'entregue' && (
          <button onClick={() => onStatus('cancelado')} className="py-2 px-3 bg-neutral-200 text-red-600 rounded-xl text-sm hover:bg-red-950">
            <XCircle size={16} />
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} className="py-2 px-3 bg-neutral-200 text-red-600 rounded-xl text-sm hover:bg-red-950" title="Excluir venda">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function PedidoDetail({ pedido, onClose, onPrint, onStatus, onSplit, canDelete, onDelete }: {
  pedido: Pedido;
  onClose: () => void;
  onPrint: (via: 'cozinha' | 'caixa') => ReturnType<typeof printReceipt>;
  onStatus: (s: PedidoStatus) => void;
  onSplit: () => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [enviando, setEnviando] = useState<'cozinha' | 'caixa' | null>(null);
  const [retornoImpressao, setRetornoImpressao] = useState('');
  const travaImpressao = useRef(false);
  const imprimir = async (via: 'cozinha' | 'caixa') => {
    if (travaImpressao.current) return;
    travaImpressao.current = true;
    setEnviando(via);
    setRetornoImpressao('Enviando comanda...');
    try {
      const resultado = await onPrint(via);
      setRetornoImpressao(resultado === 'erro' ? `Falha na impressão: ${ultimoErroImpressao() || 'Reconecte a impressora.'}` : resultado === 'bluetooth' ? 'Dados enviados pelo Bluetooth. Confira a saída do papel.' : 'Impressão solicitada ao navegador. Confirme o destino na janela de impressão.');
    } catch (erro) {
      setRetornoImpressao(erro instanceof Error ? erro.message : 'Não foi possível iniciar a impressão.');
    } finally {
      travaImpressao.current = false;
      setEnviando(null);
    }
  };
  const nextIndex = STATUS_FLOW.indexOf(pedido.status) + 1;
  const nextStatus = nextIndex < STATUS_FLOW.length ? STATUS_FLOW[nextIndex] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-neutral-900 font-black text-2xl">Pedido #{pedido.numero}</h3>
            <p className="text-neutral-500 text-sm">{fmtData(pedido.created_at)}</p>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full border flex items-center gap-1.5 ${statusColor(pedido.status)}`}>
            {statusIcon(pedido.status)} {STATUS_LABELS[pedido.status]}
          </span>
        </div>

        {/* Cliente */}
        <div className="bg-neutral-100 rounded-xl p-3 mb-4 space-y-1">
          <p className="text-neutral-900 font-medium">{pedido.cliente_nome}</p>
          {pedido.cliente_telefone && <p className="text-neutral-500 text-sm">Tel: {pedido.cliente_telefone}</p>}
          {pedido.cliente_endereco && <p className="text-neutral-500 text-sm">End: {pedido.cliente_endereco}</p>}
          {pedido.cliente_bairro && <p className="text-neutral-500 text-sm">Bairro: {pedido.cliente_bairro}</p>}
          {pedido.observacao && <p className="text-amber-700 text-sm mt-1">Obs: {pedido.observacao}</p>}
        </div>

        {/* Itens */}
        <div className="space-y-2 mb-4">
          {pedido.itens?.map((item, i) => (
            <div key={i} className="border-b border-neutral-200 pb-2">
              <p className="text-neutral-900 font-medium">{item.quantidade}x {item.produto_nome}</p>
              {item.sabor1 && <p className="text-neutral-500 text-sm">Sabores: {[item.sabor1, item.sabor2].filter(Boolean).join(' / ')}</p>}
              {item.adicional && <p className="text-neutral-500 text-sm">+ {item.adicional}</p>}
              {item.observacao && <p className="text-amber-700 text-sm">Obs: {item.observacao}</p>}
              <p className="text-[#22c55e] text-sm font-semibold">{brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}</p>
            </div>
          ))}
          {(!pedido.itens || pedido.itens.length === 0) && (
            <p className="text-neutral-500 text-sm">Carregando itens...</p>
          )}
        </div>

        {/* Totals */}
        <div className="bg-neutral-100 rounded-xl p-3 space-y-1 mb-4">
          <div className="flex justify-between text-neutral-500 text-sm"><span>Subtotal</span><span>{brl(pedido.subtotal)}</span></div>
          {pedido.taxa_entrega > 0 && <div className="flex justify-between text-neutral-500 text-sm"><span>Entrega</span><span>{brl(pedido.taxa_entrega)}</span></div>}
          <div className="flex justify-between text-neutral-900 font-bold text-lg border-t border-neutral-200 pt-1"><span>Total</span><span className="text-[#22c55e]">{brl(pedido.total)}</span></div>
          <div className="flex justify-between text-neutral-500 text-sm"><span>Pagamento</span><span>{pedido.forma_pagamento}</span></div>
        </div>

        {pedido.status !== 'cancelado' && (
          <button onClick={onSplit} className="w-full flex items-center justify-center gap-2 py-3 mb-2 border border-[#B91C1C] text-[#B91C1C] rounded-xl font-bold hover:bg-red-50">
            <Users size={18} /> Dividir pagamento
          </button>
        )}

        {/* Actions */}
        {retornoImpressao && <p role="status" className="text-sm border border-neutral-200 bg-neutral-50 rounded-xl p-3 mb-2">{retornoImpressao}</p>}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={() => { void imprimir('cozinha'); }} disabled={enviando !== null} className="flex items-center justify-center gap-2 py-3 bg-neutral-200 text-neutral-900 rounded-xl font-medium hover:bg-neutral-300 disabled:opacity-50">
            <Printer size={18} /> {enviando === 'cozinha' ? 'Enviando...' : 'Cozinha'}
          </button>
          <button onClick={() => { void imprimir('caixa'); }} disabled={enviando !== null} className="flex items-center justify-center gap-2 py-3 bg-neutral-200 text-neutral-900 rounded-xl font-medium hover:bg-neutral-300 disabled:opacity-50">
            <Printer size={18} /> {enviando === 'caixa' ? 'Enviando...' : 'Caixa'}
          </button>
        </div>

        {nextStatus && (
          <button onClick={() => onStatus(nextStatus)} className="w-full py-3 bg-[#B91C1C] text-white rounded-xl font-bold mb-2">
            Avançar para: {STATUS_LABELS[nextStatus]}
          </button>
        )}
        {pedido.status !== 'entregue' && pedido.status !== 'cancelado' && (
          <button onClick={() => onStatus('cancelado')} className="w-full py-2 text-red-600 text-sm">Cancelar pedido</button>
        )}

        {/* Delete - only gerente */}
        {canDelete && (
          <button onClick={onDelete} className="w-full py-3 mt-3 bg-red-600/20 border border-red-600/40 text-red-600 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-red-600/30">
            <Trash2 size={18} /> Excluir Venda (Gerente)
          </button>
        )}
        <button onClick={onClose} className="w-full py-2 text-neutral-500 text-sm mt-2">Fechar</button>
      </div>
    </div>
  );
}

type SplitMode = 'pessoas' | 'itens';
type SplitPart = { identificacao: string; forma_pagamento: string; valor: number };
const FORMAS_DIVISAO = ['Dinheiro', 'Pix', 'Cartão'];

function SplitPaymentModal({ pedido, onClose, onSaved }: {
  pedido: Pedido;
  onClose: () => void;
  onSaved: (forma: string) => void;
}) {
  const [modo, setModo] = useState<SplitMode>('pessoas');
  const [quantidadePessoas, setQuantidadePessoas] = useState(2);
  const [quantidadeDigitada, setQuantidadeDigitada] = useState('2');
  const [valores, setValores] = useState<number[]>([]);
  const [formas, setFormas] = useState<string[]>([]);
  const [nomes, setNomes] = useState<string[]>([]);
  const nomesEditados = useRef(false);
  const [responsaveis, setResponsaveis] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const unidades = (pedido.itens || []).flatMap((item) => Array.from({ length: Math.max(1, item.quantidade) }, () => ({
    nome: item.produto_nome,
    valor: item.preco_unitario + item.adicional_preco,
  })));

  const ajustarPessoas = (n: number) => {
    const qtd = Math.min(12, Math.max(2, n || 2));
    const base = Math.floor((pedido.total * 100) / qtd) / 100;
    const novosValores = Array.from({ length: qtd }, (_, i) => i === qtd - 1 ? Math.round((pedido.total - base * (qtd - 1)) * 100) / 100 : base);
    setQuantidadePessoas(qtd);
    setValores(novosValores);
    setFormas((atual) => Array.from({ length: qtd }, (_, i) => atual[i] || 'Dinheiro'));
    setNomes((atual) => Array.from({ length: qtd }, (_, i) => atual[i] || ''));
    setResponsaveis((atual) => Array.from({ length: qtd }, (_, i) => atual[i] ?? 0));
  };

  useEffect(() => {
    let cancelado = false;
    ajustarPessoas(2);
    // Recupera nomes e pagamentos já salvos quando a divisão é reaberta.
    void (async () => {
      const { data } = await supabase.from('pedido_pagamentos')
        .select('identificacao, forma_pagamento, valor').eq('pedido_id', pedido.id)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      if (cancelado || nomesEditados.current || !data?.length) return;
      const qtd = Math.max(2, data.length);
      setQuantidadePessoas(qtd);
      setQuantidadeDigitada(String(qtd));
      setNomes(Array.from({ length: qtd }, (_, i) => data[i]?.identificacao || ''));
      setFormas(Array.from({ length: qtd }, (_, i) => data[i]?.forma_pagamento || 'Dinheiro'));
      setValores(Array.from({ length: qtd }, (_, i) => Number(data[i]?.valor || 0)));
    })();
    return () => { cancelado = true; };
  }, []);

  const valoresPorItem = () => {
    const donos = responsaveis.length === unidades.length ? responsaveis : unidades.map(() => 0);
    const subtotalItens = unidades.reduce((soma, unidade) => soma + unidade.valor, 0);
    const fator = subtotalItens > 0 ? pedido.total / subtotalItens : 0;
    const resultado = Array.from({ length: quantidadePessoas }, () => 0);
    unidades.forEach((unidade, index) => {
      const dono = Math.min(quantidadePessoas - 1, donos[index] || 0);
      resultado[dono] += unidade.valor * fator;
    });
    const arredondado = resultado.map((valor) => Math.round(valor * 100) / 100);
    const diferenca = Math.round((pedido.total - arredondado.reduce((soma, valor) => soma + valor, 0)) * 100) / 100;
    const primeiroComValor = arredondado.findIndex((valor) => valor > 0);
    if (primeiroComValor >= 0) arredondado[primeiroComValor] = Math.round((arredondado[primeiroComValor] + diferenca) * 100) / 100;
    return arredondado;
  };

  const valoresAtuais = modo === 'pessoas' ? valores : valoresPorItem();
  const confirmar = async () => {
    const quantidade = Number(quantidadeDigitada);
    if (!quantidadeDigitada || !Number.isInteger(quantidade) || quantidade < 2 || quantidade > 12) {
      setErro('Informe uma quantidade de 2 a 12 pessoas.');
      return;
    }
    if (valoresAtuais.some((valor, index) => valor > 0 && !nomes[index]?.trim())) {
      setErro('Informe o nome de cada pessoa que vai pagar.');
      return;
    }
    const soma = Math.round(valoresAtuais.reduce((total, valor) => total + (Number(valor) || 0), 0) * 100) / 100;
    if (Math.abs(soma - pedido.total) > 0.01) {
      setErro(`A soma precisa ser ${brl(pedido.total)}. Atualmente está ${brl(soma)}.`);
      return;
    }
    const partes: SplitPart[] = valoresAtuais
      .map((valor, index) => ({ identificacao: nomes[index]?.trim() || '', forma_pagamento: formas[index] || 'Dinheiro', valor: Number(valor) || 0 }))
      .filter((parte) => parte.valor > 0);
    if (partes.length === 0) return;
    setBusy(true);
    setErro('');
    const { data, error } = await supabase.rpc('registrar_pagamentos_pedido', { p_pedido_id: pedido.id, p_pagamentos: partes });
    setBusy(false);
    if (error) {
      setErro(error.message || 'Não foi possível registrar a divisão.');
      return;
    }
    onSaved((data as { forma_pagamento: string }[] | null)?.[0]?.forma_pagamento || 'Dividido');
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
          <div><h3 className="font-black text-xl text-neutral-900">Dividir pagamento</h3><p className="text-sm text-neutral-500">Pedido #{pedido.numero} · Total {brl(pedido.total)}</p></div>
          <button onClick={onClose} className="text-neutral-500 text-xl">×</button>
        </div>
        <div className="p-5 space-y-4" onChangeCapture={() => { nomesEditados.current = true; }}>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setModo('pessoas')} className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold ${modo === 'pessoas' ? 'bg-[#B91C1C] text-white' : 'bg-neutral-100 text-neutral-700'}`}><Users size={17} /> Por pessoas</button>
            <button onClick={() => setModo('itens')} className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold ${modo === 'itens' ? 'bg-[#B91C1C] text-white' : 'bg-neutral-100 text-neutral-700'}`}><ListChecks size={17} /> Por itens</button>
          </div>

          <label className="block text-sm font-semibold text-neutral-700">Quantidade de pessoas
            <input type="number" min={2} max={12} step={1} value={quantidadeDigitada}
              onChange={(e) => {
                nomesEditados.current = true;
                const texto = e.target.value;
                setQuantidadeDigitada(texto);
                const quantidade = Number(texto);
                if (texto && Number.isInteger(quantidade) && quantidade >= 2 && quantidade <= 12 && quantidade !== quantidadePessoas) {
                  ajustarPessoas(quantidade);
                  setErro('');
                }
              }}
              onBlur={() => {
                const quantidade = Number(quantidadeDigitada);
                if (!quantidadeDigitada || !Number.isInteger(quantidade) || quantidade < 2 || quantidade > 12) {
                  setQuantidadeDigitada(String(quantidadePessoas));
                }
              }}
              className="mt-1 w-full border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900" />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-neutral-700">Quem vai dividir a conta?</p>
            {Array.from({ length: quantidadePessoas }, (_, index) => <input
              key={index} type="text" aria-label={`Nome da pessoa ${index + 1}`} placeholder="Nome da pessoa"
              value={nomes[index] || ''} maxLength={100}
              onChange={(e) => { nomesEditados.current = true; setNomes((atual) => { const novo = [...atual]; novo[index] = e.target.value; return novo; }); }}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900"
            />)}
          </div>

          {modo === 'itens' && (
            <div className="border border-neutral-200 rounded-xl p-3 space-y-2">
              <p className="text-xs text-neutral-500">Escolha quem ficará responsável por cada unidade. A entrega e descontos serão distribuídos proporcionalmente.</p>
              {unidades.map((unidade, index) => (
                <div key={`${unidade.nome}-${index}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-neutral-800 truncate">{index + 1}. {unidade.nome}</span>
                  <select value={responsaveis[index] ?? 0} onChange={(e) => setResponsaveis((atual) => { const novo = [...atual]; novo[index] = Number(e.target.value); return novo; })} className="border border-neutral-200 rounded-lg px-2 py-1 text-neutral-900">
                    {Array.from({ length: quantidadePessoas }, (_, pessoa) => <option key={pessoa} value={pessoa}>{nomes[pessoa]?.trim() || 'Nome não informado'}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {valoresAtuais.map((valor, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_110px] gap-2 items-center">
                <span className="text-sm font-semibold text-neutral-800 break-words">{nomes[index]?.trim() || 'Nome não informado'}</span>
                <select value={formas[index] || 'Dinheiro'} onChange={(e) => setFormas((atual) => { const novo = [...atual]; novo[index] = e.target.value; return novo; })} className="border border-neutral-200 rounded-lg px-2 py-2 text-sm text-neutral-900">
                  {FORMAS_DIVISAO.map((forma) => <option key={forma}>{forma}</option>)}
                </select>
                <input type="number" min="0" step="0.01" value={valor.toFixed(2)} disabled={modo === 'itens'} onChange={(e) => setValores((atual) => { const novo = [...atual]; novo[index] = Number(e.target.value) || 0; return novo; })} className="border border-neutral-200 rounded-lg px-2 py-2 text-right text-sm text-neutral-900 disabled:bg-neutral-100" />
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-3 font-black text-neutral-900"><span>Total dividido</span><span>{brl(valoresAtuais.reduce((soma, valor) => soma + valor, 0))}</span></div>
          {erro && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{erro}</p>}
        </div>
        <div className="p-5 border-t border-neutral-200 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-700 font-semibold">Cancelar</button>
          <button onClick={confirmar} disabled={busy} className="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold disabled:opacity-50">{busy ? 'Salvando...' : 'Confirmar divisão'}</button>
        </div>
      </div>
    </div>
  );
}
