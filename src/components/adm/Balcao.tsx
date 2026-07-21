import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import { printReceipt } from '../../lib/print';
import type { Produto, Cliente, ItemPedido, TaxaEntrega, Adicional, Pedido } from '../../types';
import { Search, Plus, Minus, X, ShoppingCart, Printer, Check, Phone, ArrowLeft, CloudOff } from 'lucide-react';
import { SenhaAdminModal } from '../SenhaAdminModal';
import { queueOfflinePedido } from '../../lib/offlineQueue';

interface CartItem extends ItemPedido {
  produto: Produto;
}

export function Balcao({ onOrderComplete }: { onOrderComplete: () => void }) {
  const { config } = useConfig();
  const [step, setStep] = useState<'produtos' | 'carrinho' | 'cliente' | 'pagamento' | 'sucesso'>('produtos');
  const [showSenhaAdmin, setShowSenhaAdmin] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [filtro, setFiltro] = useState('');
  const [catFiltro, setCatFiltro] = useState('todas');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteBusca, setClienteBusca] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipo, setTipo] = useState<'balcao' | 'delivery'>('balcao');
  const [taxas, setTaxas] = useState<TaxaEntrega[]>([]);
  const [bairro, setBairro] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro');
  const [observacao, setObservacao] = useState('');
  const [novoCliente, setNovoCliente] = useState({ nome: '', telefone: '', endereco: '', bairro: '', cep: '', referencia: '' });
  const [ultimoPedido, setUltimoPedido] = useState<Pedido | null>(null);
  const [showSabores, setShowSabores] = useState<Produto | null>(null);
  const [sabor1, setSabor1] = useState<Produto | null>(null);
  const [sabor2, setSabor2] = useState<Produto | null>(null);
  const [selectedAdicional, setSelectedAdicional] = useState<Adicional | null>(null);
  const [itemObs, setItemObs] = useState('');
  const [printCozinha, setPrintCozinha] = useState(true);
  const [printCaixa, setPrintCaixa] = useState(true);
  const [pedidoOffline, setPedidoOffline] = useState(false);

  const load = useCallback(async () => {
    const [p, a, t] = await Promise.all([
      supabase.from('produtos').select('*').eq('ativo', true).order('categoria_nome').order('nome'),
      supabase.from('adicionais').select('*').eq('ativo', true).order('nome'),
      supabase.from('taxa_entrega').select('*').eq('ativo', true).order('bairro'),
    ]);
    setProdutos((p.data as Produto[]) || []);
    setAdicionais((a.data as Adicional[]) || []);
    setTaxas((t.data as TaxaEntrega[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const buscaCliente = async (val: string) => {
    setClienteBusca(val);
    if (val.length >= 2) {
      const { data } = await supabase.from('clientes').select('*').or(`nome.ilike.%${val}%,telefone.ilike.%${val}%`).limit(10);
      setClientes((data as Cliente[]) || []);
    } else {
      setClientes([]);
    }
  };

  const categorias = [...new Set(produtos.map((p) => p.categoria_nome))];

  const filtered = produtos.filter((p) => {
    const matchFiltro = p.nome.toLowerCase().includes(filtro.toLowerCase());
    const matchCat = catFiltro === 'todas' || p.categoria_nome === catFiltro;
    return matchFiltro && matchCat;
  });

  const addToCart = (item: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.produto_nome === item.produto_nome && c.sabor1 === item.sabor1 && c.sabor2 === item.sabor2 && c.adicional === item.adicional && c.observacao === item.observacao);
      if (existing) {
        return prev.map((c) => c === existing ? { ...c, quantidade: c.quantidade + 1 } : c);
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQty = (index: number, delta: number) => {
    setCart((prev) => prev.map((c, i) => {
      if (i !== index) return c;
      const q = c.quantidade + delta;
      return q <= 0 ? null : { ...c, quantidade: q };
    }).filter(Boolean) as CartItem[]);
  };

  const subtotal = cart.reduce((s, c) => s + c.quantidade * (c.preco_unitario + c.adicional_preco), 0);
  const taxaEntrega = tipo === 'delivery' ? (taxas.find((t) => t.bairro === bairro)?.taxa || config?.taxa_fixa_entrega || 0) : 0;
  const total = subtotal + taxaEntrega;

  const handleProductClick = (produto: Produto) => {
    if (produto.categoria_nome.includes('Pizza')) {
      setShowSabores(produto);
      setSabor1(produto);
      setSabor2(null);
      setSelectedAdicional(null);
      setItemObs('');
    } else {
      addToCart({
        id: '',
        pedido_id: '',
        produto_id: produto.id,
        produto_nome: produto.nome,
        quantidade: 1,
        preco_unitario: produto.preco,
        custo_unitario: produto.custo,
        observacao: '',
        sabor1: '',
        sabor2: '',
        adicional: '',
        adicional_preco: 0,
        produto: produto,
      });
    }
  };

  const confirmSabor = () => {
    if (!showSabores || !sabor1) return;
    const isHalfHalf = sabor2 !== null;
    // Half/half: charge the more expensive one
    const preco = isHalfHalf ? Math.max(sabor1.preco, sabor2!.preco) : sabor1.preco;
    const custo = isHalfHalf ? (sabor1.custo + sabor2!.custo) / 2 : sabor1.custo;
    const nome = isHalfHalf ? `Pizza ${sabor1.tamanho} 1/2 ${sabor1.nome} / 1/2 ${sabor2!.nome}` : `Pizza ${sabor1.tamanho} ${sabor1.nome}`;
    addToCart({
      id: '',
      pedido_id: '',
      produto_id: sabor1.id,
      produto_nome: nome,
      quantidade: 1,
      preco_unitario: preco,
      custo_unitario: custo,
      observacao: itemObs,
      sabor1: sabor1.nome,
      sabor2: sabor2?.nome || '',
      adicional: selectedAdicional?.nome || '',
      adicional_preco: selectedAdicional?.preco || 0,
      produto: sabor1,
    });
    setShowSabores(null);
    setSabor1(null);
    setSabor2(null);
    setSelectedAdicional(null);
    setItemObs('');
  };

  const fecharPedido = async () => {
    if (cart.length === 0) return;

    const custoTotal = cart.reduce((s, c) => s + c.quantidade * c.custo_unitario, 0);
    const lucro = subtotal - custoTotal;

    const itensBase = cart.map((c) => ({
      produto_id: c.produto_id,
      produto_nome: c.produto_nome,
      quantidade: c.quantidade,
      preco_unitario: c.preco_unitario,
      custo_unitario: c.custo_unitario,
      observacao: c.observacao,
      sabor1: c.sabor1,
      sabor2: c.sabor2,
      adicional: c.adicional,
      adicional_preco: c.adicional_preco,
    }));

    // Sem internet: não dá nem para tentar (a criação de cliente novo e o
    // número sequencial dependem do banco) — vai direto para a fila offline.
    if (!navigator.onLine) {
      salvarPedidoOffline(custoTotal, lucro, itensBase);
      return;
    }

    try {
      const { data: numData, error: numErr } = await supabase.rpc('get_next_pedido_numero').maybeSingle();
      if (numErr) throw numErr;
      const numero = (numData as number) || 1;

      // Get or create cliente
      let clienteId = cliente?.id || null;
      if (tipo === 'delivery' && !cliente && novoCliente.nome) {
        const { data: nc, error: cliErr } = await supabase.from('clientes').insert(novoCliente).select().maybeSingle();
        if (cliErr) throw cliErr;
        clienteId = (nc as Cliente)?.id || null;
      }

      const pedidoData = {
        numero,
        cliente_id: clienteId,
        cliente_nome: cliente?.nome || novoCliente.nome || 'Consumidor',
        cliente_telefone: cliente?.telefone || novoCliente.telefone || '',
        cliente_endereco: cliente?.endereco || novoCliente.endereco || '',
        cliente_bairro: cliente?.bairro || novoCliente.bairro || bairro || '',
        tipo,
        status: 'recebido' as const,
        subtotal,
        taxa_entrega: taxaEntrega,
        desconto: 0,
        total,
        custo_total: custoTotal,
        lucro,
        forma_pagamento: formaPagamento,
        observacao,
        cupom: '',
      };

      const { data: pedido, error: pedErr } = await supabase.from('pedidos').insert(pedidoData).select().maybeSingle();
      if (pedErr) throw pedErr;
      const pedidoId = (pedido as Pedido)?.id;
      if (!pedidoId) throw new Error('Falha ao criar pedido');

      const { error: itensErr } = await supabase.from('itens_pedido').insert(itensBase.map((i) => ({ ...i, pedido_id: pedidoId })));
      if (itensErr) throw itensErr;

      // Register in caixa
      await supabase.from('caixa').insert({
        tipo: 'entrada',
        descricao: `Pedido #${numero} - ${pedidoData.cliente_nome}`,
        valor: total,
        forma_pagamento: formaPagamento,
        pedido_id: pedidoId,
        data: new Date().toISOString().slice(0, 10),
      });

      const fullPedido = { ...pedidoData, id: pedidoId, itens: cart, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), avaliacao: 0 } as Pedido;

      if (printCozinha && config) printReceipt(fullPedido, config, 'cozinha');
      if (printCaixa && config) printReceipt(fullPedido, config, 'caixa');

      setPedidoOffline(false);
      setUltimoPedido(fullPedido);
      setStep('sucesso');
      onOrderComplete();
    } catch (e) {
      // Provavelmente caiu a internet no meio do processo — não perde o
      // pedido, salva na fila local para sincronizar depois.
      salvarPedidoOffline(custoTotal, lucro, itensBase);
    }
  };

  // Salva o pedido no navegador (localStorage) para envio automático assim
  // que a internet voltar. Mostra um número temporário (não é o número
  // sequencial oficial — esse só existe quando sincroniza com o servidor).
  const salvarPedidoOffline = (custoTotal: number, lucro: number, itensBase: Record<string, any>[]) => {
    const clienteNome = cliente?.nome || novoCliente.nome || 'Consumidor';
    const pedidoData = {
      cliente_id: cliente?.id || null,
      cliente_nome: clienteNome,
      cliente_telefone: cliente?.telefone || novoCliente.telefone || '',
      cliente_endereco: cliente?.endereco || novoCliente.endereco || '',
      cliente_bairro: cliente?.bairro || novoCliente.bairro || bairro || '',
      tipo,
      status: 'recebido' as const,
      subtotal,
      taxa_entrega: taxaEntrega,
      desconto: 0,
      total,
      custo_total: custoTotal,
      lucro,
      forma_pagamento: formaPagamento,
      observacao,
      cupom: '',
    };

    const entry = queueOfflinePedido({ pedidoData, itens: itensBase, caixaDescricaoPrefixo: 'Pedido' });

    // Número apenas de exibição/impressão enquanto não sincroniza (últimos 4
    // dígitos do horário) — o número oficial e sequencial só existe após a
    // sincronização com o servidor.
    const localNumero = Number(String(Date.now()).slice(-4));
    const fullPedido = {
      ...pedidoData,
      numero: localNumero,
      id: entry.localId,
      itens: cart,
      created_at: entry.createdAt,
      updated_at: entry.createdAt,
      avaliacao: 0,
    } as unknown as Pedido;

    if (printCozinha && config) printReceipt(fullPedido, config, 'cozinha');
    if (printCaixa && config) printReceipt(fullPedido, config, 'caixa');

    setPedidoOffline(true);
    setUltimoPedido(fullPedido);
    setStep('sucesso');
    onOrderComplete();
  };

  const reset = () => {
    setCart([]);
    setCliente(null);
    setNovoCliente({ nome: '', telefone: '', endereco: '', bairro: '', cep: '', referencia: '' });
    setBairro('');
    setObservacao('');
    setFormaPagamento('Dinheiro');
    setStep('produtos');
    setUltimoPedido(null);
  };

  // === SUCESSO ===
  if (step === 'sucesso') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fadeIn">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${pedidoOffline ? 'bg-amber-500/20' : 'bg-green-500/20'}`}>
          {pedidoOffline ? <CloudOff size={48} className="text-amber-400" /> : <Check size={48} className="text-green-400" />}
        </div>
        {pedidoOffline ? (
          <>
            <h2 className="text-2xl font-black text-amber-400">PEDIDO SALVO (SEM INTERNET)</h2>
            <p className="text-neutral-400 mt-2 text-sm text-center max-w-sm">
              Sem conexão no momento — o pedido foi guardado no aparelho e será enviado automaticamente ao banco assim que a internet voltar.
              O número oficial será gerado na sincronização.
            </p>
          </>
        ) : (
          <h2 className="text-3xl font-black text-white">PEDIDO #{ultimoPedido?.numero}</h2>
        )}
        <p className="text-neutral-400 mt-2">Total: <span className="text-white font-bold text-xl">{brl(ultimoPedido?.total || 0)}</span></p>
        <div className="flex gap-3 mt-6">
          {config && ultimoPedido && (
            <>
              <button onClick={() => printReceipt(ultimoPedido, config, 'cozinha')} className="flex items-center gap-2 bg-neutral-800 text-white px-5 py-3 rounded-xl font-medium hover:bg-neutral-700">
                <Printer size={20} /> Cozinha
              </button>
              <button onClick={() => printReceipt(ultimoPedido, config, 'caixa')} className="flex items-center gap-2 bg-neutral-800 text-white px-5 py-3 rounded-xl font-medium hover:bg-neutral-700">
                <Printer size={20} /> Caixa
              </button>
            </>
          )}
          <button onClick={reset} className="flex items-center gap-2 bg-[#E50914] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#f6121d]">
            <Plus size={20} /> Novo Pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header with cart button */}
      <div className="flex items-center justify-between gap-3 sticky top-0 lg:top-[57px] z-10 bg-[#0A0A0A] py-2">
        <h2 className="text-2xl font-bold text-white">Balcão Rápido</h2>
        <button
          onClick={() => setStep('carrinho')}
          className="relative flex items-center gap-2 bg-[#E50914] text-white px-5 py-3 rounded-xl font-bold text-lg active:scale-95"
        >
          <ShoppingCart size={22} />
          Carrinho
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-[#22c55e] text-black text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">
              {cart.reduce((s, c) => s + c.quantidade, 0)}
            </span>
          )}
        </button>
      </div>

      {step === 'produtos' && (
        <>
          {/* Search & filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl pl-10 pr-4 py-3 text-white text-lg focus:border-[#E50914] focus:outline-none"
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCatFiltro('todas')}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${catFiltro === 'todas' ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}
            >Todos</button>
            {categorias.map((c) => (
              <button
                key={c}
                onClick={() => setCatFiltro(c)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${catFiltro === c ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}
              >{c}</button>
            ))}
          </div>

          {/* Product grid - GIANT buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProductClick(p)}
                className="group bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-4 text-left hover:border-[#E50914] active:scale-95 transition-all min-h-[110px] flex flex-col justify-between"
              >
                <div>
                  <p className="text-white font-bold text-base leading-tight">{p.nome}</p>
                  <p className="text-neutral-500 text-xs mt-0.5">{p.categoria_nome}</p>
                </div>
                <div className="flex items-end justify-between mt-2">
                  <span className="text-[#E50914] font-black text-xl">{brl(p.preco)}</span>
                  {p.foto && (
                    <img
                      src={p.foto}
                      alt={p.nome}
                      loading="lazy"
                      className="w-14 h-14 rounded-lg object-cover aspect-square"
                    />
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Cart step */}
      {step === 'carrinho' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('produtos')} className="flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm font-medium bg-neutral-800 px-3 py-2 rounded-xl">
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3 className="text-xl font-bold text-white">Carrinho</h3>
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">Carrinho vazio</div>
          ) : (
            <>
              <div className="space-y-2">
                {cart.map((c, i) => (
                  <div key={i} className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-white font-semibold text-sm">{c.produto_nome}</p>
                      {c.adicional && <p className="text-neutral-400 text-xs">+ {c.adicional} ({brl(c.adicional_preco)})</p>}
                      {c.observacao && <p className="text-yellow-400 text-xs">Obs: {c.observacao}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(i, -1)} className="w-8 h-8 bg-neutral-800 text-white rounded-lg flex items-center justify-center"><Minus size={16} /></button>
                      <span className="text-white font-bold w-6 text-center">{c.quantidade}</span>
                      <button onClick={() => updateQty(i, 1)} className="w-8 h-8 bg-neutral-800 text-white rounded-lg flex items-center justify-center"><Plus size={16} /></button>
                    </div>
                    <span className="text-[#22c55e] font-bold w-20 text-right">{brl(c.quantidade * (c.preco_unitario + c.adicional_preco))}</span>
                    <button onClick={() => removeFromCart(i)} className="text-neutral-500 hover:text-red-400"><X size={18} /></button>
                  </div>
                ))}
              </div>

              {/* Type selector */}
              <div className="flex gap-2">
                <button onClick={() => setTipo('balcao')} className={`flex-1 py-3 rounded-xl font-semibold ${tipo === 'balcao' ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}>Balcão</button>
                <button onClick={() => setTipo('delivery')} className={`flex-1 py-3 rounded-xl font-semibold ${tipo === 'delivery' ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}>Entrega</button>
              </div>

              {tipo === 'delivery' && (
                <div>
                  <label className="text-neutral-400 text-sm">Bairro</label>
                  <select value={bairro} onChange={(e) => setBairro(e.target.value)} className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mt-1 focus:border-[#E50914] focus:outline-none">
                    <option value="">Selecione...</option>
                    {taxas.map((t) => <option key={t.id} value={t.bairro}>{t.bairro} - {brl(t.taxa)}</option>)}
                  </select>
                </div>
              )}

              {/* Totals */}
              <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-neutral-400"><span>Subtotal</span><span className="text-white">{brl(subtotal)}</span></div>
                {tipo === 'delivery' && <div className="flex justify-between text-neutral-400"><span>Entrega</span><span className="text-white">{brl(taxaEntrega)}</span></div>}
                <div className="flex justify-between text-xl font-bold border-t border-essenza-dark-border pt-2"><span className="text-white">Total</span><span className="text-[#22c55e]">{brl(total)}</span></div>
              </div>

              <button onClick={() => setStep('cliente')} className="w-full bg-[#E50914] text-white py-4 rounded-xl font-bold text-lg active:scale-95">
                Continuar
              </button>
            </>
          )}
        </div>
      )}

      {/* Cliente step */}
      {step === 'carrinho' && null}
      {step === 'cliente' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('carrinho')} className="flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm font-medium bg-neutral-800 px-3 py-2 rounded-xl">
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3 className="text-xl font-bold text-white">Cliente</h3>
          </div>

          {/* Search existing */}
          <div className="relative">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={clienteBusca}
              onChange={(e) => buscaCliente(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl pl-10 pr-4 py-3 text-white focus:border-[#E50914] focus:outline-none"
            />
          </div>

          {clientes.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {clientes.map((c) => (
                <button key={c.id} onClick={() => { setCliente(c); setBairro(c.bairro); setClienteBusca(''); setClientes([]); setStep('pagamento'); }} className="w-full text-left bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-3 hover:border-[#E50914]">
                  <p className="text-white font-medium">{c.nome}</p>
                  <p className="text-neutral-400 text-sm flex items-center gap-1"><Phone size={12} /> {c.telefone} · {c.bairro}</p>
                </button>
              ))}
            </div>
          )}

          {/* Skip to balcao */}
          {tipo === 'balcao' && (
            <button onClick={() => { setCliente(null); setStep('pagamento'); }} className="w-full py-3 bg-neutral-800 text-white rounded-xl font-medium">
              Consumidor (sem cadastro)
            </button>
          )}

          {/* New customer form */}
          <div className="border-t border-essenza-dark-border pt-4 space-y-3">
            <p className="text-neutral-400 text-sm">Novo cliente</p>
            <input value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} placeholder="Nome" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
            <input value={novoCliente.telefone} onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} placeholder="Telefone" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
            {tipo === 'delivery' && (
              <>
                <input value={novoCliente.endereco} onChange={(e) => setNovoCliente({ ...novoCliente, endereco: e.target.value })} placeholder="Endereço" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
                <input value={novoCliente.bairro} onChange={(e) => { setNovoCliente({ ...novoCliente, bairro: e.target.value }); setBairro(e.target.value); }} placeholder="Bairro" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
              </>
            )}
          </div>

          <button onClick={() => setStep('pagamento')} className="w-full bg-[#E50914] text-white py-4 rounded-xl font-bold text-lg active:scale-95">
            Continuar
          </button>
        </div>
      )}

      {/* Pagamento step */}
      {step === 'pagamento' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('cliente')} className="flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm font-medium bg-neutral-800 px-3 py-2 rounded-xl">
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3 className="text-xl font-bold text-white">Pagamento</h3>
          </div>

          <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-4 text-center">
            <p className="text-neutral-400 text-sm">Total a Pagar</p>
            <p className="text-[#22c55e] font-black text-4xl">{brl(total)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {['Dinheiro', 'Cartão', 'Pix'].map((f) => (
              <button
                key={f}
                onClick={() => setFormaPagamento(f)}
                className={`py-4 rounded-xl font-bold text-lg ${formaPagamento === f ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}
              >{f}</button>
            ))}
          </div>

          <div>
            <label className="text-neutral-400 text-sm">Observação geral</label>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: sem cebola, troco para R$50..." className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mt-1 focus:border-[#E50914] focus:outline-none" />
          </div>

          {/* Print options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-neutral-300 text-sm">
              <input type="checkbox" checked={printCozinha} onChange={(e) => setPrintCozinha(e.target.checked)} className="w-4 h-4 accent-[#E50914]" /> Imprimir Cozinha
            </label>
            <label className="flex items-center gap-2 text-neutral-300 text-sm">
              <input type="checkbox" checked={printCaixa} onChange={(e) => setPrintCaixa(e.target.checked)} className="w-4 h-4 accent-[#E50914]" /> Imprimir Caixa
            </label>
          </div>

          <button onClick={() => setShowSenhaAdmin(true)} className="w-full bg-green-500 hover:bg-green-600 text-white py-5 rounded-2xl font-black text-xl active:scale-95">
            FECHAR PEDIDO
          </button>
          <button onClick={() => setStep('carrinho')} className="w-full py-3 text-neutral-400 text-sm">Voltar</button>
        </div>
      )}

      {/* Sabor selector modal (half/half) */}
      {showSabores && (
        <SaborModal
          produto={showSabores}
          produtos={produtos}
          sabor1={sabor1}
          sabor2={sabor2}
          setSabor1={setSabor1}
          setSabor2={setSabor2}
          adicionais={adicionais}
          selectedAdicional={selectedAdicional}
          setSelectedAdicional={setSelectedAdicional}
          itemObs={itemObs}
          setItemObs={setItemObs}
          onConfirm={confirmSabor}
          onClose={() => setShowSabores(null)}
        />
      )}

      {showSenhaAdmin && (
        <SenhaAdminModal
          title="Autorizar Lançamento"
          description="Confirme a senha para finalizar o pedido"
          confirmLabel="Finalizar Pedido"
          senhaEsperada={config?.senha_tabela || '9876'}
          onConfirm={() => { setShowSenhaAdmin(false); fecharPedido(); }}
          onCancel={() => setShowSenhaAdmin(false)}
        />
      )}
    </div>
  );
}

function SaborModal({ produto, produtos, sabor1, sabor2, setSabor1, setSabor2, adicionais, selectedAdicional, setSelectedAdicional, itemObs, setItemObs, onConfirm, onClose }: {
  produto: Produto;
  produtos: Produto[];
  sabor1: Produto | null;
  sabor2: Produto | null;
  setSabor1: (p: Produto | null) => void;
  setSabor2: (p: Produto | null) => void;
  adicionais: Adicional[];
  selectedAdicional: Adicional | null;
  setSelectedAdicional: (a: Adicional | null) => void;
  itemObs: string;
  setItemObs: (s: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const mesmoTamanho = produtos.filter((p) => p.categoria_nome === produto.categoria_nome);
  const precoFinal = sabor2 ? Math.max(sabor1?.preco || 0, sabor2.preco) : sabor1?.preco || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg">{produto.categoria_nome}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white"><X size={20} /></button>
        </div>

        <p className="text-neutral-400 text-sm mb-2">Sabor 1 {sabor2 ? '(meio a meio)' : ''}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
          {mesmoTamanho.map((p) => (
            <button
              key={p.id}
              onClick={() => setSabor1(p)}
              className={`p-3 rounded-xl text-left ${sabor1?.id === p.id ? 'bg-[#E50914] text-white' : 'bg-neutral-900 text-neutral-300 border border-essenza-dark-border'}`}
            >
              <p className="font-medium text-sm">{p.nome}</p>
              <p className="text-xs opacity-70">{brl(p.preco)}</p>
            </button>
          ))}
        </div>

        <p className="text-neutral-400 text-sm mb-2">Sabor 2 (opcional)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
          {mesmoTamanho.map((p) => (
            <button
              key={p.id}
              onClick={() => setSabor2(sabor2?.id === p.id ? null : p)}
              className={`p-3 rounded-xl text-left ${sabor2?.id === p.id ? 'bg-[#E50914] text-white' : 'bg-neutral-900 text-neutral-300 border border-essenza-dark-border'}`}
            >
              <p className="font-medium text-sm">{p.nome}</p>
              <p className="text-xs opacity-70">{brl(p.preco)}</p>
            </button>
          ))}
        </div>

        <p className="text-neutral-400 text-sm mb-2">Borda / Adicional</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          <button onClick={() => setSelectedAdicional(null)} className={`p-3 rounded-xl text-left ${!selectedAdicional ? 'bg-[#E50914] text-white' : 'bg-neutral-900 text-neutral-300 border border-essenza-dark-border'}`}>
            <p className="font-medium text-sm">Nenhum</p>
          </button>
          {adicionais.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAdicional(a)}
              className={`p-3 rounded-xl text-left ${selectedAdicional?.id === a.id ? 'bg-[#E50914] text-white' : 'bg-neutral-900 text-neutral-300 border border-essenza-dark-border'}`}
            >
              <p className="font-medium text-sm">{a.nome}</p>
              <p className="text-xs opacity-70">+{brl(a.preco)}</p>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <label className="text-neutral-400 text-sm">Observação</label>
          <input value={itemObs} onChange={(e) => setItemObs(e.target.value)} placeholder="Ex: sem cebola, bem assada..." className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mt-1 focus:border-[#E50914] focus:outline-none" />
        </div>

        <div className="flex items-center justify-between bg-neutral-900 rounded-xl p-3 mb-4">
          <span className="text-neutral-400">Preço</span>
          <span className="text-[#22c55e] font-bold text-xl">{brl(precoFinal + (selectedAdicional?.preco || 0))}</span>
        </div>

        <button onClick={onConfirm} disabled={!sabor1} className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50 active:scale-95">
          ADICIONAR
        </button>
      </div>
    </div>
  );
}
