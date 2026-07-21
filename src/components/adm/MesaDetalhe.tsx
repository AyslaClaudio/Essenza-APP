import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { brl } from '../../lib/format';
import { printMesaComanda, printMesaConta } from '../../lib/print';
import {
  ArrowLeft, Plus, Trash2, Printer, DoorClosed, X, Clock, RefreshCw,
} from 'lucide-react';
import type { Mesa, ItemMesa, Produto, Configuracao } from '../../types';

interface Props {
  mesa: Mesa;
  produtos: Produto[];
  config: Configuracao | null;
  onBack: () => void;
  onChanged: () => void; // avisa o grid pai para recarregar
}

const FORMAS_PAGAMENTO = ['Dinheiro', 'Pix', 'Cartão'];

export function MesaDetalhe({ mesa, produtos, config, onBack, onChanged }: Props) {
  const [itens, setItens] = useState<ItemMesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [busy, setBusy] = useState(false);

  // ----- Carrega os itens já lançados na mesa -----
  const loadItens = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('itens_mesa')
      .select('*')
      .eq('mesa_id', mesa.id)
      .order('created_at', { ascending: true });
    setItens((data as ItemMesa[]) || []);
    setLoading(false);
  }, [mesa.id]);

  useEffect(() => {
    loadItens();
  }, [loadItens]);

  // Totais acumulados
  const subtotal = itens.reduce((s, i) => s + i.quantidade * (i.preco_unitario + i.adicional_preco), 0);
  const custoTotal = itens.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0);

  // ----- Adiciona um item na mesa (e imprime comanda da cozinha) -----
  const handleAddItem = async (novo: Omit<ItemMesa, 'id' | 'mesa_id' | 'created_at'>) => {
    setBusy(true);
    try {
      const { data: inserted, error } = await supabase
        .from('itens_mesa')
        .insert({ ...novo, mesa_id: mesa.id })
        .select()
        .maybeSingle();
      if (error) throw error;

      // Se a mesa estava livre, passa para "ocupada" e marca o horário de abertura
      if (mesa.status === 'livre') {
        await supabase
          .from('mesas')
          .update({ status: 'ocupada', abertura_at: new Date().toISOString() })
          .eq('id', mesa.id);
      }

      // Imprime a comanda de cozinha apenas do item recém-lançado
      if (config && inserted) {
        printMesaComanda(mesa.numero, [inserted as ItemMesa], config);
      }

      setShowAdd(false);
      await loadItens();
      onChanged();
    } catch (e: any) {
      alert('Erro ao adicionar item: ' + (e.message || 'tente novamente'));
    } finally {
      setBusy(false);
    }
  };

  // ----- Remove um item da mesa -----
  const handleRemove = async (id: string) => {
    if (!confirm('Remover este item da mesa?')) return;
    await supabase.from('itens_mesa').delete().eq('id', id);
    await loadItens();
    onChanged();
  };

  // ----- Fecha a mesa: vira um pedido (tipo=mesa) + entrada no caixa -----
  const handleCloseMesa = async (formaPagamento: string) => {
    if (itens.length === 0) {
      alert('A mesa não tem itens para fechar.');
      return;
    }
    setBusy(true);
    try {
      const total = subtotal; // mesa não tem taxa de entrega
      const lucro = subtotal - custoTotal;

      // 1. Próximo número sequencial de pedido
      const { data: numData } = await supabase.rpc('get_next_pedido_numero').maybeSingle();
      const numero = (numData as number) || Math.floor(Math.random() * 100000) + 1;

      // 2. Cria o pedido do tipo "mesa" (entra no Dashboard/Financeiro como venda do salão)
      const { data: pedido, error: pedErr } = await supabase
        .from('pedidos')
        .insert({
          numero,
          cliente_nome: `Mesa ${mesa.numero}`,
          cliente_telefone: '',
          cliente_endereco: '',
          cliente_bairro: '',
          tipo: 'mesa',
          status: 'entregue',
          subtotal,
          taxa_entrega: 0,
          desconto: 0,
          total,
          custo_total: custoTotal,
          lucro,
          forma_pagamento: formaPagamento,
          observacao: `Fechamento da Mesa ${mesa.numero}`,
          cupom: '',
        })
        .select()
        .maybeSingle();
      if (pedErr || !pedido) throw new Error(pedErr?.message || 'Falha ao criar o pedido da mesa');

      // 3. Copia os itens da mesa para os itens do pedido
      const { error: itensErr } = await supabase.from('itens_pedido').insert(
        itens.map((i) => ({
          pedido_id: pedido.id,
          produto_id: i.produto_id,
          produto_nome: i.produto_nome,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
          custo_unitario: i.custo_unitario,
          observacao: i.observacao,
          sabor1: i.sabor1,
          sabor2: i.sabor2,
          adicional: i.adicional,
          adicional_preco: i.adicional_preco,
        })),
      );
      if (itensErr) throw new Error(itensErr.message);

      // 4. Registra a entrada no caixa
      await supabase.from('caixa').insert({
        tipo: 'entrada',
        descricao: `Mesa ${mesa.numero} - Pedido #${numero}`,
        valor: total,
        forma_pagamento: formaPagamento,
        pedido_id: pedido.id,
        data: new Date().toISOString().slice(0, 10),
      });

      // 5. Imprime a conta do cliente
      if (config) printMesaConta(mesa.numero, itens, total, formaPagamento, config);

      // 6. Limpa a mesa: apaga os itens e volta para "livre"
      await supabase.from('itens_mesa').delete().eq('mesa_id', mesa.id);
      await supabase
        .from('mesas')
        .update({ status: 'livre', abertura_at: null, observacao: '' })
        .eq('id', mesa.id);

      setShowClose(false);
      onChanged();
      onBack();
    } catch (e: any) {
      alert('Erro ao fechar a mesa: ' + (e.message || 'tente novamente'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-essenza-dark-border text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-white">Mesa {mesa.numero}</h2>
            <p className="text-xs text-neutral-500 flex items-center gap-1.5">
              <Clock size={12} />
              {mesa.abertura_at ? `Aberta às ${new Date(mesa.abertura_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Mesa livre'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-[#E50914] hover:bg-red-600 text-white text-sm px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95"
          >
            <Plus size={18} /> Adicionar Item
          </button>
          <button
            onClick={() => setShowClose(true)}
            disabled={itens.length === 0}
            className="flex items-center gap-2 border border-essenza-dark-border hover:bg-neutral-800 text-neutral-200 text-sm px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-40"
          >
            <DoorClosed size={18} /> Fechar Mesa
          </button>
        </div>
      </div>

      {/* Lista de itens */}
      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-500 flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" /> Carregando itens...
          </div>
        ) : itens.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            Nenhum item lançado ainda. Clique em <b className="text-neutral-300">Adicionar Item</b> para começar.
          </div>
        ) : (
          <div className="divide-y divide-essenza-dark-border/60">
            {itens.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">
                    {item.quantidade}x {item.produto_nome}
                  </p>
                  {(item.sabor1 || item.sabor2) && (
                    <p className="text-xs text-neutral-400">{[item.sabor1, item.sabor2].filter(Boolean).join(' / ')}</p>
                  )}
                  {item.adicional && <p className="text-xs text-neutral-400">+ {item.adicional}</p>}
                  {item.observacao && <p className="text-xs text-amber-500/80">Obs: {item.observacao}</p>}
                </div>
                <span className="text-[#22c55e] font-bold text-sm whitespace-nowrap">
                  {brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}
                </span>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Rodapé com subtotal */}
        {itens.length > 0 && (
          <div className="p-4 border-t border-essenza-dark-border bg-neutral-950/40 flex items-center justify-between">
            <span className="text-neutral-400 text-sm">Subtotal da Mesa</span>
            <span className="text-white font-black text-xl">{brl(subtotal)}</span>
          </div>
        )}
      </div>

      {showAdd && (
        <AddItemModal produtos={produtos} busy={busy} onAdd={handleAddItem} onClose={() => setShowAdd(false)} />
      )}
      {showClose && (
        <CloseMesaModal total={subtotal} busy={busy} onConfirm={handleCloseMesa} onClose={() => setShowClose(false)} />
      )}
    </div>
  );
}

// ===== Modal: adicionar item à mesa =====
function AddItemModal({
  produtos,
  busy,
  onAdd,
  onClose,
}: {
  produtos: Produto[];
  busy: boolean;
  onAdd: (i: Omit<ItemMesa, 'id' | 'mesa_id' | 'created_at'>) => void;
  onClose: () => void;
}) {
  const [prod1Id, setProd1Id] = useState('');
  const [meioMeio, setMeioMeio] = useState(false);
  const [prod2Id, setProd2Id] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState('');
  const [busca, setBusca] = useState('');

  const filtrados = produtos.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()));
  const prod1 = produtos.find((p) => p.id === prod1Id);
  const prod2 = produtos.find((p) => p.id === prod2Id);

  // No meio a meio cobra-se o sabor mais caro (mesma regra do balcão/IA)
  const precoUnit = meioMeio && prod1 && prod2 ? Math.max(prod1.preco, prod2.preco) : prod1?.preco || 0;
  const custoUnit = meioMeio && prod1 && prod2 ? Math.max(prod1.custo, prod2.custo) : prod1?.custo || 0;

  const podeAdicionar = !!prod1 && (!meioMeio || !!prod2) && quantidade > 0;

  const confirmar = () => {
    if (!prod1) return;
    const nome = meioMeio && prod2 ? `1/2 ${prod1.nome} + 1/2 ${prod2.nome}` : prod1.nome;
    onAdd({
      produto_id: prod1.id,
      produto_nome: nome,
      quantidade,
      preco_unitario: precoUnit,
      custo_unitario: custoUnit,
      observacao,
      sabor1: meioMeio ? prod1.nome : '',
      sabor2: meioMeio && prod2 ? prod2.nome : '',
      adicional: '',
      adicional_preco: 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-[#141414] border border-essenza-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-essenza-dark-border sticky top-0 bg-[#141414]">
          <h3 className="text-white font-bold">Adicionar Item</h3>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-white rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Busca de produto */}
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2.5 text-sm text-white focus:border-[#E50914] focus:outline-none"
          />

          {/* Lista de produtos (sabor 1) */}
          <div className="max-h-52 overflow-y-auto grid grid-cols-1 gap-1.5">
            {filtrados.map((p) => (
              <button
                key={p.id}
                onClick={() => setProd1Id(p.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm transition-colors ${
                  prod1Id === p.id
                    ? 'border-[#E50914] bg-[#E50914]/10 text-white'
                    : 'border-essenza-dark-border text-neutral-300 hover:bg-neutral-900'
                }`}
              >
                <span>{p.nome} <span className="text-neutral-500 text-xs">({p.tamanho || 'Único'})</span></span>
                <span className="text-[#22c55e] font-semibold">{brl(p.preco)}</span>
              </button>
            ))}
            {filtrados.length === 0 && <p className="text-center text-neutral-500 text-sm py-4">Nenhum produto encontrado.</p>}
          </div>

          {/* Meio a meio */}
          <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
            <input type="checkbox" checked={meioMeio} onChange={(e) => setMeioMeio(e.target.checked)} className="accent-[#E50914]" />
            Pizza meio a meio (2 sabores — cobra o mais caro)
          </label>
          {meioMeio && (
            <select
              value={prod2Id}
              onChange={(e) => setProd2Id(e.target.value)}
              className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2.5 text-sm text-white focus:border-[#E50914] focus:outline-none"
            >
              <option value="">Selecione o 2º sabor...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome} — {brl(p.preco)}</option>
              ))}
            </select>
          )}

          {/* Quantidade + observação */}
          <div className="flex gap-3">
            <div className="w-24">
              <label className="block text-xs text-neutral-400 mb-1">Qtd</label>
              <input
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2.5 text-sm text-white focus:border-[#E50914] focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-neutral-400 mb-1">Observação</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: sem cebola"
                className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2.5 text-sm text-white focus:border-[#E50914] focus:outline-none"
              />
            </div>
          </div>

          {prod1 && (
            <div className="flex items-center justify-between text-sm bg-neutral-900 rounded-xl px-4 py-3">
              <span className="text-neutral-400">Total do item</span>
              <span className="text-white font-bold">{brl(quantidade * precoUnit)}</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-essenza-dark-border flex gap-3 sticky bottom-0 bg-[#141414]">
          <button onClick={onClose} className="flex-1 border border-essenza-dark-border text-neutral-300 rounded-xl py-2.5 font-semibold hover:bg-neutral-800">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!podeAdicionar || busy}
            className="flex-1 flex items-center justify-center gap-2 bg-[#E50914] hover:bg-red-600 text-white rounded-xl py-2.5 font-bold disabled:opacity-40"
          >
            <Printer size={16} /> {busy ? 'Lançando...' : 'Lançar + Comanda'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Modal: fechar mesa (forma de pagamento) =====
function CloseMesaModal({
  total,
  busy,
  onConfirm,
  onClose,
}: {
  total: number;
  busy: boolean;
  onConfirm: (forma: string) => void;
  onClose: () => void;
}) {
  const [forma, setForma] = useState('Dinheiro');

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#141414] border border-essenza-dark-border rounded-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-essenza-dark-border">
          <h3 className="text-white font-bold">Fechar Mesa</h3>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-white rounded-lg">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-center">
            <p className="text-neutral-400 text-sm">Total a pagar</p>
            <p className="text-[#22c55e] font-black text-4xl mt-1">{brl(total)}</p>
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-2">Forma de pagamento</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAS_PAGAMENTO.map((f) => (
                <button
                  key={f}
                  onClick={() => setForma(f)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    forma === f ? 'border-[#E50914] bg-[#E50914]/10 text-white' : 'border-essenza-dark-border text-neutral-300 hover:bg-neutral-900'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-essenza-dark-border flex gap-3">
          <button onClick={onClose} className="flex-1 border border-essenza-dark-border text-neutral-300 rounded-xl py-2.5 font-semibold hover:bg-neutral-800">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(forma)}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white rounded-xl py-2.5 font-bold disabled:opacity-40"
          >
            <Printer size={16} /> {busy ? 'Fechando...' : 'Confirmar e Imprimir'}
          </button>
        </div>
      </div>
    </div>
  );
}
