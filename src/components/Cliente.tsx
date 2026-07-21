import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useConfig } from '../context/ConfigContext';
import { brl } from '../lib/format';
import type { Produto, Cliente, TaxaEntrega, Adicional, ItemPedido } from '../types';
import { Flame, ShoppingCart, Search, X, Plus, Minus, Check, ChevronLeft } from 'lucide-react';

interface CartItem extends ItemPedido {
  produto: Produto;
}

export function Cliente() {
  const { config } = useConfig();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [taxas, setTaxas] = useState<TaxaEntrega[]>([]);
  const [filtro, setFiltro] = useState('');
  const [catFiltro, setCatFiltro] = useState('todas');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showSabores, setShowSabores] = useState<Produto | null>(null);
  const [sabor1, setSabor1] = useState<Produto | null>(null);
  const [sabor2, setSabor2] = useState<Produto | null>(null);
  const [selectedAdicional, setSelectedAdicional] = useState<Adicional | null>(null);
  const [itemObs, setItemObs] = useState('');
  const [step, setStep] = useState<'menu' | 'checkout' | 'sucesso'>('menu');
  const [cliente, setCliente] = useState({ nome: '', telefone: '', endereco: '', bairro: '', cep: '', referencia: '' });
  const [formaPagamento, setFormaPagamento] = useState('Pix');
  const [observacao, setObservacao] = useState('');
  const [ultimoNum, setUltimoNum] = useState(0);
  const [bairro, setBairro] = useState('');


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

  const categorias = [...new Set(produtos.map((p) => p.categoria_nome))];
  const filtered = produtos.filter((p) => {
    const matchFiltro = p.nome.toLowerCase().includes(filtro.toLowerCase());
    const matchCat = catFiltro === 'todas' || p.categoria_nome === catFiltro;
    return matchFiltro && matchCat;
  });

  const addToCart = (item: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.produto_nome === item.produto_nome && c.observacao === item.observacao && c.adicional === item.adicional);
      if (existing) return prev.map((c) => c === existing ? { ...c, quantidade: c.quantidade + 1 } : c);
      return [...prev, item];
    });
  };

  const updateQty = (i: number, delta: number) => {
    setCart((prev) => prev.map((c, idx) => {
      if (idx !== i) return c;
      const q = c.quantidade + delta;
      return q <= 0 ? null : { ...c, quantidade: q };
    }).filter(Boolean) as CartItem[]);
  };

  const removeFromCart = (i: number) => setCart((prev) => prev.filter((_, idx) => idx !== i));

  const handleProductClick = (produto: Produto) => {
    if (produto.categoria_nome.includes('Pizza')) {
      setShowSabores(produto);
      setSabor1(produto);
      setSabor2(null);
      setSelectedAdicional(null);
      setItemObs('');
    } else {
      addToCart({
        id: '', pedido_id: '', produto_id: produto.id, produto_nome: produto.nome,
        quantidade: 1, preco_unitario: produto.preco, custo_unitario: produto.custo,
        observacao: '', sabor1: '', sabor2: '', adicional: '', adicional_preco: 0, produto,
      });
    }
  };

  const confirmSabor = () => {
    if (!showSabores || !sabor1) return;
    const isHalf = sabor2 !== null;
    const preco = isHalf ? Math.max(sabor1.preco, sabor2!.preco) : sabor1.preco;
    const custo = isHalf ? (sabor1.custo + sabor2!.custo) / 2 : sabor1.custo;
    const nome = isHalf ? `Pizza ${sabor1.tamanho} 1/2 ${sabor1.nome} / 1/2 ${sabor2!.nome}` : `Pizza ${sabor1.tamanho} ${sabor1.nome}`;
    addToCart({
      id: '', pedido_id: '', produto_id: sabor1.id, produto_nome: nome,
      quantidade: 1, preco_unitario: preco, custo_unitario: custo,
      observacao: itemObs, sabor1: sabor1.nome, sabor2: sabor2?.nome || '',
      adicional: selectedAdicional?.nome || '', adicional_preco: selectedAdicional?.preco || 0,
      produto: sabor1,
    });
    setShowSabores(null); setSabor1(null); setSabor2(null); setSelectedAdicional(null); setItemObs('');
  };

  const subtotal = cart.reduce((s, c) => s + c.quantidade * (c.preco_unitario + c.adicional_preco), 0);
  const taxaEntrega = taxas.find((t) => t.bairro === (cliente.bairro || bairro))?.taxa || config?.taxa_fixa_entrega || 0;
  const total = subtotal + taxaEntrega;

  const finalizar = async () => {
    if (cart.length === 0 || !cliente.nome) return;
    const { data: numData } = await supabase.rpc('get_next_pedido_numero').maybeSingle();
    const numero = (numData as number) || 1;
    const custoTotal = cart.reduce((s, c) => s + c.quantidade * c.custo_unitario, 0);
    const lucro = subtotal - custoTotal;

    let clienteId: string | null = null;
    const { data: nc } = await supabase.from('clientes').insert(cliente).select().maybeSingle();
    clienteId = (nc as Cliente)?.id || null;

    const pedidoData = {
      numero, cliente_id: clienteId, cliente_nome: cliente.nome, cliente_telefone: cliente.telefone,
      cliente_endereco: cliente.endereco, cliente_bairro: cliente.bairro || bairro,
      tipo: 'cliente' as const, status: 'recebido' as const,
      subtotal, taxa_entrega: taxaEntrega, desconto: 0, total, custo_total: custoTotal, lucro,
      forma_pagamento: formaPagamento, observacao, cupom: '',
    };
    const { data: pedido } = await supabase.from('pedidos').insert(pedidoData).select().maybeSingle();
    if (pedido) {
      await supabase.from('itens_pedido').insert(cart.map((c) => ({
        pedido_id: (pedido as { id: string }).id, produto_id: c.produto_id, produto_nome: c.produto_nome,
        quantidade: c.quantidade, preco_unitario: c.preco_unitario, custo_unitario: c.custo_unitario,
        observacao: c.observacao, sabor1: c.sabor1, sabor2: c.sabor2, adicional: c.adicional, adicional_preco: c.adicional_preco,
      })));
      await supabase.from('caixa').insert({ tipo: 'entrada', descricao: `Pedido #${numero} - ${cliente.nome}`, valor: total, forma_pagamento: formaPagamento, pedido_id: (pedido as { id: string }).id, data: new Date().toISOString().slice(0, 10) });
    }
    setUltimoNum(numero);
    setStep('sucesso');
    setCart([]);
  };

  if (step === 'sucesso') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4">
        <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
          <Check size={48} className="text-green-400" />
        </div>
        <h1 className="text-3xl font-black text-white text-center">Pedido Recebido!</h1>
        <p className="text-neutral-400 mt-2 text-center">Seu pedido <span className="text-[#E50914] font-bold">#{ultimoNum}</span> foi confirmado.</p>
        <p className="text-neutral-500 text-sm mt-1 text-center">Acompanhe o status: Recebido {'>'} Preparo {'>'} Forno {'>'} Saiu {'>'} Entregue</p>
        <button onClick={() => { setStep('menu'); setCliente({ nome: '', telefone: '', endereco: '', bairro: '', cep: '', referencia: '' }); }} className="mt-8 bg-[#E50914] text-white px-8 py-3 rounded-xl font-bold">
          Fazer Novo Pedido
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/95 backdrop-blur border-b border-essenza-dark-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#E50914] flex items-center justify-center">
              <Flame size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-white text-xl leading-none">ESSENZA</h1>
              <p className="text-neutral-500 text-xs">Pizzaria</p>
            </div>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 bg-[#E50914] text-white px-4 py-2.5 rounded-xl font-semibold active:scale-95"
          >
            <ShoppingCart size={20} />
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-[#22c55e] text-black text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">
                {cart.reduce((s, c) => s + c.quantidade, 0)}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Hero banner */}
      {config?.logo ? (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <img src={config.logo} alt="ESSENZA" className="w-full h-40 object-cover rounded-2xl" />
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="bg-gradient-to-r from-[#E50914]/30 to-[#0A0A0A] rounded-2xl p-6 border border-essenza-dark-border">
            <h2 className="text-white font-black text-2xl">As melhores pizzas da cidade</h2>
            <p className="text-neutral-400 text-sm mt-1">Massa artesanal, ingredientes frescos, sabor inigualável.</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="max-w-4xl mx-auto px-4 mt-4">
        <div className="relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar no cardápio..."
            className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl pl-10 pr-4 py-3 text-white focus:border-[#E50914] focus:outline-none"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="max-w-4xl mx-auto px-4 mt-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCatFiltro('todas')} className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${catFiltro === 'todas' ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}>Todos</button>
          {categorias.map((c) => (
            <button key={c} onClick={() => setCatFiltro(c)} className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${catFiltro === c ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Product cards */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-6 pb-24">
        {categorias.filter((c) => catFiltro === 'todas' || catFiltro === c).map((cat) => {
          const items = filtered.filter((p) => p.categoria_nome === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <h3 className="text-white font-bold text-lg mb-3">{cat}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProductClick(p)}
                    className="group bg-essenza-dark-card border border-essenza-dark-border rounded-2xl overflow-hidden text-left hover:border-[#E50914] active:scale-95 transition-all flex"
                  >
                    <div className="flex-1 p-4">
                      <p className="text-white font-bold">{p.nome}</p>
                      <p className="text-neutral-500 text-xs mt-0.5">{p.categoria_nome}</p>
                      <p className="text-[#E50914] font-black text-xl mt-2">{brl(p.preco)}</p>
                    </div>
                    {p.foto ? (
                      <div className="w-28 h-28 flex-shrink-0">
                        <img src={p.foto} alt={p.nome} loading="lazy" className="w-full h-full object-cover aspect-square" />
                      </div>
                    ) : (
                      <div className="w-28 h-28 flex-shrink-0 bg-gradient-to-br from-[#E50914]/20 to-neutral-900 flex items-center justify-center">
                        <Flame size={32} className="text-[#E50914]/40" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowCart(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-md bg-[#0A0A0A] border-l border-essenza-dark-border h-full overflow-y-auto animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#0A0A0A] border-b border-essenza-dark-border p-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Carrinho</h3>
              <button onClick={() => setShowCart(false)} className="text-neutral-400 hover:text-white"><X size={22} /></button>
            </div>
            <div className="p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-center text-neutral-500 py-12">Carrinho vazio</p>
              ) : (
                <>
                  {cart.map((c, i) => (
                    <div key={i} className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">{c.produto_nome}</p>
                          {c.adicional && <p className="text-neutral-400 text-xs">+ {c.adicional}</p>}
                          {c.observacao && <p className="text-yellow-400 text-xs">Obs: {c.observacao}</p>}
                        </div>
                        <button onClick={() => removeFromCart(i)} className="text-neutral-500 hover:text-red-400"><X size={16} /></button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQty(i, -1)} className="w-8 h-8 bg-neutral-800 text-white rounded-lg flex items-center justify-center"><Minus size={16} /></button>
                          <span className="text-white font-bold w-6 text-center">{c.quantidade}</span>
                          <button onClick={() => updateQty(i, 1)} className="w-8 h-8 bg-neutral-800 text-white rounded-lg flex items-center justify-center"><Plus size={16} /></button>
                        </div>
                        <span className="text-[#22c55e] font-bold">{brl(c.quantidade * (c.preco_unitario + c.adicional_preco))}</span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-essenza-dark-border pt-3 space-y-1">
                    <div className="flex justify-between text-neutral-400 text-sm"><span>Subtotal</span><span className="text-white">{brl(subtotal)}</span></div>
                    <div className="flex justify-between text-neutral-400 text-sm"><span>Entrega</span><span className="text-white">{brl(taxaEntrega)}</span></div>
                    <div className="flex justify-between font-bold text-lg border-t border-essenza-dark-border pt-2"><span className="text-white">Total</span><span className="text-[#22c55e]">{brl(total)}</span></div>
                  </div>
                  <button onClick={() => { setShowCart(false); setStep('checkout'); }} className="w-full bg-[#E50914] text-white py-4 rounded-xl font-bold text-lg active:scale-95">
                    Finalizar Pedido
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Checkout */}
      {step === 'checkout' && (
        <div className="fixed inset-0 z-50 bg-[#0A0A0A] overflow-y-auto">
          <div className="sticky top-0 bg-[#0A0A0A] border-b border-essenza-dark-border p-4 flex items-center gap-3">
            <button onClick={() => setStep('menu')} className="text-neutral-400 hover:text-white"><ChevronLeft size={24} /></button>
            <h3 className="text-white font-bold text-lg">Finalizar Pedido</h3>
          </div>
          <div className="max-w-md mx-auto p-4 space-y-4">
            {/* Customer data */}
            <div className="space-y-3">
              <h4 className="text-white font-semibold">Seus dados</h4>
              <input value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} placeholder="Nome completo" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
              <input value={cliente.telefone} onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })} placeholder="Telefone / WhatsApp" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
              <input value={cliente.endereco} onChange={(e) => setCliente({ ...cliente, endereco: e.target.value })} placeholder="Endereço (rua, número)" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
              <select value={cliente.bairro || bairro} onChange={(e) => { setCliente({ ...cliente, bairro: e.target.value }); setBairro(e.target.value); }} className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none">
                <option value="">Selecione o bairro...</option>
                {taxas.map((t) => <option key={t.id} value={t.bairro}>{t.bairro} - Entrega {brl(t.taxa)}</option>)}
              </select>
              <input value={cliente.referencia} onChange={(e) => setCliente({ ...cliente, referencia: e.target.value })} placeholder="Ponto de referência (opcional)" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
            </div>

            {/* Payment */}
            <div className="space-y-3">
              <h4 className="text-white font-semibold">Pagamento</h4>
              <div className="grid grid-cols-3 gap-2">
                {['Pix', 'Cartão', 'Dinheiro'].map((f) => (
                  <button key={f} onClick={() => setFormaPagamento(f)} className={`py-3 rounded-xl font-medium ${formaPagamento === f ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}>{f}</button>
                ))}
              </div>
            </div>

            <div>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (ex: sem cebola, troco para R$50)" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
            </div>

            {/* Summary */}
            <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-neutral-400 text-sm"><span>Subtotal</span><span className="text-white">{brl(subtotal)}</span></div>
              <div className="flex justify-between text-neutral-400 text-sm"><span>Entrega</span><span className="text-white">{brl(taxaEntrega)}</span></div>
              <div className="flex justify-between font-bold text-lg border-t border-essenza-dark-border pt-2"><span className="text-white">Total</span><span className="text-[#22c55e]">{brl(total)}</span></div>
            </div>

            <button onClick={finalizar} disabled={!cliente.nome || !cliente.telefone || !cliente.endereco || cart.length === 0} className="w-full bg-green-500 hover:bg-green-600 text-white py-5 rounded-2xl font-black text-lg disabled:opacity-50 active:scale-95">
              CONFIRMAR PEDIDO
            </button>
          </div>
        </div>
      )}

      {/* Sabor modal */}
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
          <h3 className="text-white font-bold text-lg">Monte sua Pizza</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white"><X size={20} /></button>
        </div>

        <p className="text-neutral-400 text-sm mb-2">Sabor 1</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
          {mesmoTamanho.map((p) => (
            <button key={p.id} onClick={() => setSabor1(p)} className={`p-3 rounded-xl text-left ${sabor1?.id === p.id ? 'bg-[#E50914] text-white' : 'bg-neutral-900 text-neutral-300 border border-essenza-dark-border'}`}>
              <p className="font-medium text-sm">{p.nome}</p>
              <p className="text-xs opacity-70">{brl(p.preco)}</p>
            </button>
          ))}
        </div>

        <p className="text-neutral-400 text-sm mb-2">Sabor 2 — meio a meio (cobra o mais caro)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
          {mesmoTamanho.map((p) => (
            <button key={p.id} onClick={() => setSabor2(sabor2?.id === p.id ? null : p)} className={`p-3 rounded-xl text-left ${sabor2?.id === p.id ? 'bg-[#E50914] text-white' : 'bg-neutral-900 text-neutral-300 border border-essenza-dark-border'}`}>
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
            <button key={a.id} onClick={() => setSelectedAdicional(a)} className={`p-3 rounded-xl text-left ${selectedAdicional?.id === a.id ? 'bg-[#E50914] text-white' : 'bg-neutral-900 text-neutral-300 border border-essenza-dark-border'}`}>
              <p className="font-medium text-sm">{a.nome}</p>
              <p className="text-xs opacity-70">+{brl(a.preco)}</p>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <input value={itemObs} onChange={(e) => setItemObs(e.target.value)} placeholder="Observação (ex: sem cebola)" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none" />
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
