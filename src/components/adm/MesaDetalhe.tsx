import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { brl } from '../../lib/format';
import { printMesaComanda, printMesaConta } from '../../lib/print';
import {
  ArrowLeft, Plus, Trash2, Printer, DoorClosed, X, Clock, RefreshCw, User, StickyNote,
} from 'lucide-react';
import { ProductPlaceholder, usaImagemPadrao } from '../ProductPlaceholder';
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
  const [garcomInput, setGarcomInput] = useState(mesa.garcom || '');
  const [obsInput, setObsInput] = useState(mesa.observacao || '');

  // Só resincroniza os campos locais quando troca de mesa — evita apagar o que
  // o usuário está digitando quando o grid recarrega em segundo plano.
  useEffect(() => {
    setGarcomInput(mesa.garcom || '');
    setObsInput(mesa.observacao || '');
  }, [mesa.id]);

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

  // ----- Adiciona um ou mais itens na mesa de uma vez (e imprime UMA comanda com todos) -----
  // Não fecha o modal sozinho: o garçom costuma lançar vários itens da mesma mesa em
  // sequência (ex: 4 pizzas diferentes), e fechar a cada lançamento obrigava reabrir o
  // modal pra cada item. Quem decide fechar agora é o próprio garçom, no X do modal.
  const handleAddItens = async (novos: Omit<ItemMesa, 'id' | 'mesa_id' | 'created_at'>[]): Promise<boolean> => {
    if (novos.length === 0) return false;
    setBusy(true);
    try {
      const { data: inserted, error } = await supabase
        .from('itens_mesa')
        .insert(novos.map((n) => ({ ...n, mesa_id: mesa.id })))
        .select();
      if (error) throw error;

      // Se a mesa estava livre, passa para "ocupada" e marca o horário de abertura.
      // Se estava "fechando" (conta já pedida) e chegou item novo, volta pra "ocupada".
      if (mesa.status === 'livre') {
        await supabase
          .from('mesas')
          .update({ status: 'ocupada', abertura_at: new Date().toISOString() })
          .eq('id', mesa.id);
      } else if (mesa.status === 'fechando') {
        await supabase.from('mesas').update({ status: 'ocupada' }).eq('id', mesa.id);
      }

      // Imprime UMA comanda de cozinha com todos os itens recém-lançados
      if (config && inserted && inserted.length > 0) {
        printMesaComanda(mesa.numero, inserted as ItemMesa[], config);
      }

      await loadItens();
      onChanged();
      return true;
    } catch (e: any) {
      alert('Erro ao adicionar itens: ' + (e.message || 'tente novamente'));
      return false;
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

  // Abre o modal de fechamento e marca a mesa como "fechando" (conta pedida) —
  // visível para outros terminais/garçons em tempo real.
  const handleOpenClose = async () => {
    setShowClose(true);
    if (mesa.status === 'ocupada') {
      await supabase.from('mesas').update({ status: 'fechando' }).eq('id', mesa.id);
      onChanged();
    }
  };

  // Se o garçom cancelar o fechamento, a mesa volta a "ocupada"
  const handleCancelClose = async () => {
    setShowClose(false);
    if (mesa.status === 'fechando') {
      await supabase.from('mesas').update({ status: 'ocupada' }).eq('id', mesa.id);
      onChanged();
    }
  };

  // ----- Fecha a mesa: vira um pedido (tipo=mesa) + entrada no caixa -----
  // Tudo roda numa única transação no banco (RPC fechar_mesa), então não há risco
  // de ficar pela metade se a conexão cair no meio do processo.
  const handleCloseMesa = async (formaPagamento: string) => {
    if (itens.length === 0) {
      alert('A mesa não tem itens para fechar.');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .rpc('fechar_mesa', { p_mesa_id: mesa.id, p_forma_pagamento: formaPagamento })
        .maybeSingle<{ pedido_id: string; numero: number; total: number }>();
      if (error) throw error;

      const totalFechado = data?.total ?? subtotal;

      // Imprime a conta do cliente com os itens ainda em memória (a mesa já foi limpa no banco)
      if (config) printMesaConta(mesa.numero, itens, totalFechado, formaPagamento, config);

      setShowClose(false);
      onChanged();
      onBack();
    } catch (e: any) {
      // Os itens da mesa já estavam salvos no banco desde que foram lançados —
      // se faltar internet agora, nada se perde: a mesa continua com os itens
      // intactos (o RPC é atômico, então ou fechou tudo ou não fechou nada) e
      // dá para tentar fechar de novo assim que a conexão voltar.
      const semInternet = !navigator.onLine;
      alert(
        semInternet
          ? 'Sem conexão com a internet no momento. Os itens da mesa continuam salvos — assim que a internet voltar, tente Fechar Mesa novamente.'
          : 'Erro ao fechar a mesa: ' + (e.message || 'tente novamente'),
      );
    } finally {
      setBusy(false);
    }
  };

  // ----- Atualiza garçom / observação da mesa (campos existiam no banco mas nunca eram usados) -----
  const handleUpdateGarcom = async (garcom: string) => {
    await supabase.from('mesas').update({ garcom }).eq('id', mesa.id);
    onChanged();
  };
  const handleUpdateObservacao = async (observacao: string) => {
    await supabase.from('mesas').update({ observacao }).eq('id', mesa.id);
    onChanged();
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-2xl font-bold text-neutral-900">Mesa {mesa.numero}</h2>
              {mesa.status === 'fechando' && (
                <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Conta pedida
                </span>
              )}
            </div>
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
            onClick={handleOpenClose}
            disabled={itens.length === 0}
            className="flex items-center gap-2 border border-neutral-200 hover:bg-neutral-100 text-neutral-700 text-sm px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-40"
          >
            <DoorClosed size={18} /> Fechar Mesa
          </button>
        </div>
      </div>

      {/* Garçom responsável + observação da mesa (aniversário, cliente VIP, etc.) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-3 py-2">
          <User size={16} className="text-neutral-500 shrink-0" />
          <input
            type="text"
            value={garcomInput}
            onChange={(e) => setGarcomInput(e.target.value)}
            onBlur={() => garcomInput !== (mesa.garcom || '') && handleUpdateGarcom(garcomInput)}
            placeholder="Garçom responsável"
            className="w-full bg-transparent text-sm text-neutral-900 placeholder-neutral-600 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-3 py-2">
          <StickyNote size={16} className="text-neutral-500 shrink-0" />
          <input
            type="text"
            value={obsInput}
            onChange={(e) => setObsInput(e.target.value)}
            onBlur={() => obsInput !== (mesa.observacao || '') && handleUpdateObservacao(obsInput)}
            placeholder="Observação (ex: aniversário, cliente VIP)"
            className="w-full bg-transparent text-sm text-neutral-900 placeholder-neutral-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Lista de itens */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-500 flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" /> Carregando itens...
          </div>
        ) : itens.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            Nenhum item lançado ainda. Clique em <b className="text-neutral-700">Adicionar Item</b> para começar.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200/60">
            {itens.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-neutral-900 font-semibold text-sm">
                    {item.quantidade}x {item.produto_nome}
                  </p>
                  {(item.sabor1 || item.sabor2) && (
                    <p className="text-xs text-neutral-500">{[item.sabor1, item.sabor2].filter(Boolean).join(' / ')}</p>
                  )}
                  {item.adicional && <p className="text-xs text-neutral-500">+ {item.adicional}</p>}
                  {item.observacao && <p className="text-xs text-amber-500/80">Obs: {item.observacao}</p>}
                </div>
                <span className="text-[#22c55e] font-bold text-sm whitespace-nowrap">
                  {brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}
                </span>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Rodapé com subtotal */}
        {itens.length > 0 && (
          <div className="p-4 border-t border-neutral-200 bg-neutral-50/40 flex items-center justify-between">
            <span className="text-neutral-500 text-sm">Subtotal da Mesa</span>
            <span className="text-neutral-900 font-black text-xl">{brl(subtotal)}</span>
          </div>
        )}
      </div>

      {showAdd && (
        <AddItemModal produtos={produtos} busy={busy} onAdd={handleAddItens} onClose={() => setShowAdd(false)} />
      )}
      {showClose && (
        <CloseMesaModal total={subtotal} busy={busy} onConfirm={handleCloseMesa} onClose={handleCancelClose} />
      )}
    </div>
  );
}

// ===== Modal: adicionar item à mesa =====
type ItemDraft = Omit<ItemMesa, 'id' | 'mesa_id' | 'created_at'>;

function AddItemModal({
  produtos,
  busy,
  onAdd,
  onClose,
}: {
  produtos: Produto[];
  busy: boolean;
  onAdd: (itens: ItemDraft[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [prod1Id, setProd1Id] = useState('');
  const [meioMeio, setMeioMeio] = useState(false);
  const [prod2Id, setProd2Id] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState('');
  const [busca, setBusca] = useState('');
  const [catFiltro, setCatFiltro] = useState('todas');
  const [carrinho, setCarrinho] = useState<ItemDraft[]>([]);
  const [confirmado, setConfirmado] = useState(false);

  const categorias = [...new Set(produtos.map((p) => p.categoria_nome))];
  const filtrados = produtos.filter((p) => {
    const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase());
    const matchCat = catFiltro === 'todas' || p.categoria_nome === catFiltro;
    return matchBusca && matchCat;
  });
  const prod1 = produtos.find((p) => p.id === prod1Id);
  const prod2 = produtos.find((p) => p.id === prod2Id);

  // No meio a meio cobra-se o sabor mais caro (mesma regra do balcão/IA)
  const precoUnit = meioMeio && prod1 && prod2 ? Math.max(prod1.preco, prod2.preco) : prod1?.preco || 0;
  const custoUnit = meioMeio && prod1 && prod2 ? Math.max(prod1.custo, prod2.custo) : prod1?.custo || 0;

  const podeAdicionar = !!prod1 && (!meioMeio || !!prod2) && quantidade > 0;
  const totalCarrinho = carrinho.reduce((s, i) => s + i.quantidade * (i.preco_unitario + i.adicional_preco), 0);

  const limparFormulario = () => {
    setProd1Id('');
    setMeioMeio(false);
    setProd2Id('');
    setQuantidade(1);
    setObservacao('');
    setBusca('');
  };

  // Esfirra e pizza podem ter sabores com nome parecido — prefixa a categoria
  // pra não confundir a cozinha na hora do preparo.
  const nomeComCategoria = (p: Produto) => (p.categoria_nome.includes('Esfirra') ? `Esfirra: ${p.nome}` : p.nome);

  const adicionarAoCarrinho = () => {
    if (!prod1) return;
    const nome = meioMeio && prod2 ? `${prod1.nome} / ${prod2.nome}` : nomeComCategoria(prod1);
    setCarrinho((c) => [
      ...c,
      {
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
      },
    ]);
    limparFormulario();
  };

  const removerDoCarrinho = (idx: number) => {
    setCarrinho((c) => c.filter((_, i) => i !== idx));
  };

  const confirmar = async () => {
    // Se o usuário deixou algo selecionado no formulário sem clicar em "Adicionar
    // à lista", inclui esse item também para não perder o que já preencheu.
    const itens = podeAdicionar
      ? [
          ...carrinho,
          {
            produto_id: prod1!.id,
            produto_nome: meioMeio && prod2 ? `${prod1!.nome} / ${prod2.nome}` : nomeComCategoria(prod1!),
            quantidade,
            preco_unitario: precoUnit,
            custo_unitario: custoUnit,
            observacao,
            sabor1: meioMeio ? prod1!.nome : '',
            sabor2: meioMeio && prod2 ? prod2.nome : '',
            adicional: '',
            adicional_preco: 0,
          },
        ]
      : carrinho;
    if (itens.length === 0) return;
    const ok = await onAdd(itens);
    if (ok) {
      // Lançou com sucesso: limpa a lista e o formulário, mas mantém o modal
      // aberto — o garçom continua lançando os próximos itens da mesma mesa
      // sem precisar reabrir. Fecha manualmente pelo X quando terminar.
      setCarrinho([]);
      limparFormulario();
      setConfirmado(true);
      setTimeout(() => setConfirmado(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white border border-neutral-200 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 sticky top-0 bg-white">
          <h3 className="font-display text-neutral-900 font-bold text-lg">Adicionar Item</h3>
          <button onClick={onClose} className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg">
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
            className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm text-neutral-900 focus:border-[#E50914] focus:outline-none"
          />

          {/* Categorias */}
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <button
              onClick={() => setCatFiltro('todas')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${catFiltro === 'todas' ? 'bg-[#E50914] text-white' : 'bg-neutral-100 border border-neutral-200 text-neutral-500'}`}
            >Todos</button>
            {categorias.map((c) => (
              <button
                key={c}
                onClick={() => setCatFiltro(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${catFiltro === c ? 'bg-[#E50914] text-white' : 'bg-neutral-100 border border-neutral-200 text-neutral-500'}`}
              >{c}</button>
            ))}
          </div>

          {/* Lista de produtos (sabor 1) */}
          <div className="max-h-52 overflow-y-auto grid grid-cols-1 gap-1.5">
            {filtrados.map((p) => (
              <button
                key={p.id}
                onClick={() => setProd1Id(p.id)}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-lg border text-left text-sm transition-colors ${
                  prod1Id === p.id
                    ? 'border-[#E50914] bg-[#E50914]/10 text-[#E50914] font-semibold'
                    : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {p.foto && !usaImagemPadrao(p.categoria_nome) ? (
                  <img src={p.foto} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <ProductPlaceholder categoriaNome={p.categoria_nome} className="w-10 h-10 rounded-lg flex-shrink-0" />
                )}
                <span className="flex-1 min-w-0 truncate">{p.nome} <span className="text-neutral-500 text-xs">({p.tamanho || 'Único'})</span></span>
                <span className="text-[#22c55e] font-semibold whitespace-nowrap">{brl(p.preco)}</span>
              </button>
            ))}
            {filtrados.length === 0 && <p className="text-center text-neutral-500 text-sm py-4">Nenhum produto encontrado.</p>}
          </div>

          {/* Meio a meio */}
          <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={meioMeio} onChange={(e) => setMeioMeio(e.target.checked)} className="accent-[#E50914]" />
            Pizza meio a meio (2 sabores — cobra o mais caro)
          </label>
          {meioMeio && (
            <select
              value={prod2Id}
              onChange={(e) => setProd2Id(e.target.value)}
              className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm text-neutral-900 focus:border-[#E50914] focus:outline-none"
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
              <label className="block text-xs text-neutral-500 mb-1">Qtd</label>
              <input
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm text-neutral-900 focus:border-[#E50914] focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-neutral-500 mb-1">Observação</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: sem cebola"
                className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm text-neutral-900 focus:border-[#E50914] focus:outline-none"
              />
            </div>
          </div>

          {prod1 && (
            <div className="flex items-center justify-between text-sm bg-neutral-100 rounded-xl px-4 py-3">
              <span className="text-neutral-500">Total do item</span>
              <span className="text-neutral-900 font-bold">{brl(quantidade * precoUnit)}</span>
            </div>
          )}

          <button
            onClick={adicionarAoCarrinho}
            disabled={!podeAdicionar}
            className="w-full flex items-center justify-center gap-2 border border-[#E50914] text-[#E50914] rounded-xl py-2.5 font-bold hover:bg-[#E50914]/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Plus size={16} /> Adicionar à lista do pedido
          </button>

          {/* Itens já adicionados à lista, aguardando lançamento em conjunto */}
          {carrinho.length > 0 && (
            <div className="bg-neutral-100 rounded-xl divide-y divide-neutral-200/60 overflow-hidden">
              {carrinho.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-neutral-900 text-sm font-semibold truncate">{item.quantidade}x {item.produto_nome}</p>
                    {item.observacao && <p className="text-xs text-amber-500/80">Obs: {item.observacao}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[#22c55e] text-sm font-semibold">
                      {brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}
                    </span>
                    <button onClick={() => removerDoCarrinho(idx)} className="p-1 text-neutral-500 hover:text-red-600 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 bg-neutral-50/50">
                <span className="text-xs text-neutral-500">Total do pedido</span>
                <span className="text-neutral-900 font-bold text-sm">{brl(totalCarrinho + (podeAdicionar ? quantidade * precoUnit : 0))}</span>
              </div>
            </div>
          )}
        </div>

        {confirmado && (
          <div className="mx-4 mb-2 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-xl px-4 py-2.5 text-center">
            Itens lançados e comanda impressa! Pode adicionar mais, ou fechar quando terminar.
          </div>
        )}

        <div className="p-4 border-t border-neutral-200 flex gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 border border-neutral-200 text-neutral-700 rounded-xl py-2.5 font-semibold hover:bg-neutral-200">
            Fechar
          </button>
          <button
            onClick={confirmar}
            disabled={(!podeAdicionar && carrinho.length === 0) || busy}
            className="flex-1 flex items-center justify-center gap-2 bg-[#E50914] hover:bg-red-600 text-white rounded-xl py-2.5 font-bold disabled:opacity-40"
          >
            <Printer size={16} /> {busy ? 'Lançando...' : 'Lançar Pedido + Comanda'}
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
      <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h3 className="text-neutral-900 font-bold">Fechar Mesa</h3>
          <button onClick={onClose} className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-center">
            <p className="text-neutral-500 text-sm">Total a pagar</p>
            <p className="text-[#22c55e] font-black text-4xl mt-1">{brl(total)}</p>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-2">Forma de pagamento</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAS_PAGAMENTO.map((f) => (
                <button
                  key={f}
                  onClick={() => setForma(f)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    forma === f ? 'border-[#E50914] bg-[#E50914]/10 text-[#E50914] font-semibold' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-neutral-200 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-neutral-200 text-neutral-700 rounded-xl py-2.5 font-semibold hover:bg-neutral-200">
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
