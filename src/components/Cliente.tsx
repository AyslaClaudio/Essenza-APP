import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useConfig } from '../context/ConfigContext';
import { brl } from '../lib/format';
import type { Produto, Cliente, TaxaEntrega, Adicional, ItemPedido } from '../types';
import { ShoppingCart, Search, X, Plus, Minus, Check, ChevronLeft, Star } from 'lucide-react';
import { ProductPlaceholder, usaImagemPadrao } from './ProductPlaceholder';

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
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);


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

  const isCombo = (p: Produto) => p.categoria_nome.includes('Combo');

  const handleProductClick = (produto: Produto) => {
    if (produto.categoria_nome.includes('Pizza') || isCombo(produto)) {
      setShowSabores(produto);
      // Pizza: já pré-seleciona o sabor clicado (atalho). Combo: o clicado é o
      // combo em si, não um sabor — o cliente escolhe a(s) esfirra(s) do zero.
      setSabor1(isCombo(produto) ? null : produto);
      setSabor2(null);
      setSelectedAdicional(null);
      setItemObs('');
    } else if (produto.categoria_nome.includes('Esfirra')) {
      // Prefixa a categoria no nome pra não confundir na comanda da cozinha
      // (esfirra e pizza podem ter sabores com nome parecido).
      addToCart({
        id: '', pedido_id: '', produto_id: produto.id, produto_nome: `Esfirra: ${produto.nome}`,
        quantidade: 1, preco_unitario: produto.preco, custo_unitario: produto.custo,
        observacao: '', sabor1: '', sabor2: '', adicional: '', adicional_preco: 0, produto,
      });
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

    if (isCombo(showSabores)) {
      // Combo: preço fixo do combo (não deriva do preço das esfirras — o combo
      // já é a promoção), sabores só identificam pro cozinha o que preparar.
      const nome = sabor2
        ? `${showSabores.nome} - ${sabor1.nome} / ${sabor2.nome}`
        : `${showSabores.nome} - ${sabor1.nome}`;
      addToCart({
        id: '', pedido_id: '', produto_id: showSabores.id, produto_nome: nome,
        quantidade: 1, preco_unitario: showSabores.preco, custo_unitario: showSabores.custo,
        observacao: itemObs, sabor1: sabor1.nome, sabor2: sabor2?.nome || '',
        adicional: '', adicional_preco: 0,
        produto: showSabores,
      });
      setShowSabores(null); setSabor1(null); setSabor2(null); setItemObs('');
      return;
    }

    const isHalf = sabor2 !== null;
    const preco = isHalf ? Math.max(sabor1.preco, sabor2!.preco) : sabor1.preco;
    const custo = isHalf ? (sabor1.custo + sabor2!.custo) / 2 : sabor1.custo;
    const nome = isHalf ? `Pizza ${sabor1.tamanho} ${sabor1.nome} / ${sabor2!.nome}` : `Pizza ${sabor1.tamanho} ${sabor1.nome}`;
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
    if (cart.length === 0 || !cliente.nome || enviando) return;
    setEnviando(true);
    setErroEnvio(null);
    try {
      // Uma RPC só faz cliente+pedido+itens+caixa numa transação atômica no
      // servidor (mesmo padrão do fechamento de mesa). Antes eram 3 inserts
      // separados pedindo a linha de volta (`.select()`) — só que o cliente
      // anônimo não pode LER pedidos (RLS, correto por privacidade), e pedir
      // a linha de volta depois de inserir faz o Postgres recusar a
      // transação INTEIRA. Resultado: nada era salvo e a tela ainda assim
      // mostrava "Pedido Recebido!", porque o erro não era checado.
      const itensPayload = cart.map((c) => ({
        produto_id: c.produto_id, produto_nome: c.produto_nome, quantidade: c.quantidade,
        preco_unitario: c.preco_unitario, custo_unitario: c.custo_unitario, observacao: c.observacao,
        sabor1: c.sabor1, sabor2: c.sabor2, adicional: c.adicional, adicional_preco: c.adicional_preco,
      }));
      const { data, error } = await supabase.rpc('criar_pedido_cliente', {
        p_cliente_nome: cliente.nome,
        p_cliente_telefone: cliente.telefone,
        p_cliente_endereco: cliente.endereco,
        p_cliente_bairro: cliente.bairro || bairro,
        p_taxa_entrega: taxaEntrega,
        p_forma_pagamento: formaPagamento,
        p_observacao: observacao,
        p_itens: itensPayload,
      }).maybeSingle();
      if (error) throw error;
      const numero = (data as { numero: number } | null)?.numero;
      if (!numero) throw new Error('Pedido não foi salvo — tente novamente.');

      setUltimoNum(numero);
      setStep('sucesso');
      setCart([]);
    } catch (e) {
      setErroEnvio('Não foi possível enviar seu pedido. Verifique sua internet e tente novamente — se o problema continuar, chame no telefone da loja.');
    } finally {
      setEnviando(false);
    }
  };

  if (step === 'sucesso') {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-center px-4">
        <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
          <Check size={48} className="text-green-600" />
        </div>
        <h1 className="font-display text-3xl font-bold text-neutral-900 text-center">Pedido Recebido!</h1>
        <p className="text-neutral-500 mt-2 text-center">Seu pedido <span className="text-[#16A34A] font-bold">#{ultimoNum}</span> foi confirmado.</p>
        <p className="text-neutral-500 text-sm mt-1 text-center">Acompanhe o status: Confirmado {'>'} Entregue</p>
        <button onClick={() => { setStep('menu'); setCliente({ nome: '', telefone: '', endereco: '', bairro: '', cep: '', referencia: '' }); }} className="mt-8 bg-[#16A34A] text-white px-8 py-3 rounded-xl font-bold">
          Fazer Novo Pedido
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#F7F7F5]/95 backdrop-blur border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="ESSENZA" className="w-9 h-9 rounded-lg object-cover shadow-sm" />
            <div>
              <h1 className="font-display font-bold text-neutral-900 text-lg leading-none tracking-wide">ESSENZA</h1>
              <p className="text-neutral-500 text-[10px] tracking-[0.15em] uppercase">Pizza Napoletana</p>
            </div>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 bg-[#16A34A] text-white px-3.5 py-2 rounded-xl font-semibold text-sm active:scale-95 hover:bg-red-600 hover:shadow-md transition-all"
          >
            <ShoppingCart size={18} />
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-essenza-italia-green text-white text-xs font-black w-5 h-5 rounded-full flex items-center justify-center">
                {cart.reduce((s, c) => s + c.quantidade, 0)}
              </span>
            )}
          </button>
        </div>
        <div className="h-[3px] flex">
          <span className="flex-1 bg-essenza-italia-green" />
          <span className="flex-1 bg-white" />
          <span className="flex-1 bg-essenza-italia-red" />
        </div>
      </header>

      {/* Hero banner */}
      {config?.logo ? (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <img src={config.logo} alt="ESSENZA" className="w-full h-40 object-cover rounded-2xl" />
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br from-essenza-terracotta/15 via-white to-essenza-olive/10 p-6">
            <span className="inline-flex items-center gap-1.5 text-essenza-italia-green text-xs font-bold tracking-[0.2em] uppercase mb-2">
              🇮🇹 Essência da pizza napolitana
            </span>
            <h2 className="font-display text-neutral-900 font-bold text-3xl leading-tight">As melhores pizzas da cidade</h2>
            <p className="text-neutral-500 text-sm mt-2">Massa de fermentação lenta (24h a 48h), ingredientes frescos, sabor inigualável.</p>
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
            className="w-full bg-neutral-100 border border-neutral-200 rounded-xl pl-10 pr-4 py-3 text-neutral-900 focus:border-[#16A34A] focus:outline-none"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="max-w-4xl mx-auto px-4 mt-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCatFiltro('todas')} className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${catFiltro === 'todas' ? 'bg-[#16A34A] text-white' : 'bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-600'}`}>Todos</button>
          {categorias.map((c) => (
            <button key={c} onClick={() => setCatFiltro(c)} className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${catFiltro === c ? 'bg-[#16A34A] text-white' : 'bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-600'}`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Product cards */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-7 pb-24">
        {categorias.filter((c) => catFiltro === 'todas' || catFiltro === c).map((cat) => {
          const items = filtered.filter((p) => p.categoria_nome === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <h3 className="font-display text-neutral-900 font-semibold text-xl mb-3">{cat}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProductClick(p)}
                    className="group relative bg-white border border-neutral-200 rounded-2xl overflow-hidden text-left hover:border-[#16A34A]/60 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 active:scale-95 transition-all"
                  >
                    <div className="relative aspect-square w-full overflow-hidden">
                      {p.foto && !usaImagemPadrao(p.categoria_nome) ? (
                        <img
                          src={p.foto}
                          alt={p.nome}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                      ) : (
                        <ProductPlaceholder categoriaNome={p.categoria_nome} className="w-full h-full" />
                      )}
                      {p.destaque && (
                        <span className="absolute top-2 left-2 flex items-center gap-1 bg-essenza-gold text-black text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wide">
                          <Star size={10} fill="currentColor" /> Destaque
                        </span>
                      )}
                      <span className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-[#16A34A] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                        <Plus size={18} />
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="text-neutral-900 font-semibold text-sm leading-tight line-clamp-2">{p.nome}</p>
                      <p className="text-[#16A34A] font-black text-lg mt-1.5">{brl(p.preco)}</p>
                    </div>
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
          <div className="relative w-full max-w-md bg-[#F7F7F5] border-l border-neutral-200 h-full overflow-y-auto animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#F7F7F5] border-b border-neutral-200 p-4 flex items-center justify-between">
              <h3 className="text-neutral-900 font-bold text-lg">Carrinho</h3>
              <button onClick={() => setShowCart(false)} className="text-neutral-500 hover:text-neutral-900"><X size={22} /></button>
            </div>
            <div className="p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-center text-neutral-500 py-12">Carrinho vazio</p>
              ) : (
                <>
                  {cart.map((c, i) => (
                    <div key={i} className="bg-white border border-neutral-200 rounded-xl p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-neutral-900 font-medium text-sm">{c.produto_nome}</p>
                          {c.adicional && <p className="text-neutral-500 text-xs">+ {c.adicional}</p>}
                          {c.observacao && <p className="text-amber-700 text-xs">Obs: {c.observacao}</p>}
                        </div>
                        <button onClick={() => removeFromCart(i)} className="text-neutral-500 hover:text-red-600"><X size={16} /></button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQty(i, -1)} className="w-8 h-8 bg-neutral-200 text-neutral-900 rounded-lg flex items-center justify-center"><Minus size={16} /></button>
                          <span className="text-neutral-900 font-bold w-6 text-center">{c.quantidade}</span>
                          <button onClick={() => updateQty(i, 1)} className="w-8 h-8 bg-neutral-200 text-neutral-900 rounded-lg flex items-center justify-center"><Plus size={16} /></button>
                        </div>
                        <span className="text-[#22c55e] font-bold">{brl(c.quantidade * (c.preco_unitario + c.adicional_preco))}</span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-neutral-200 pt-3 space-y-1">
                    <div className="flex justify-between text-neutral-500 text-sm"><span>Subtotal</span><span className="text-neutral-900">{brl(subtotal)}</span></div>
                    <div className="flex justify-between text-neutral-500 text-sm"><span>Entrega</span><span className="text-neutral-900">{brl(taxaEntrega)}</span></div>
                    <div className="flex justify-between font-bold text-lg border-t border-neutral-200 pt-2"><span className="text-neutral-900">Total</span><span className="text-[#22c55e]">{brl(total)}</span></div>
                  </div>
                  <button onClick={() => { setShowCart(false); setStep('checkout'); }} className="w-full bg-[#16A34A] text-white py-4 rounded-xl font-bold text-lg active:scale-95">
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
        <div className="fixed inset-0 z-50 bg-[#F7F7F5] overflow-y-auto">
          <div className="sticky top-0 bg-[#F7F7F5] border-b border-neutral-200 p-4 flex items-center gap-3">
            <button onClick={() => setStep('menu')} className="text-neutral-500 hover:text-neutral-900"><ChevronLeft size={24} /></button>
            <h3 className="text-neutral-900 font-bold text-lg">Finalizar Pedido</h3>
          </div>
          <div className="max-w-md mx-auto p-4 space-y-4">
            {/* Customer data */}
            <div className="space-y-3">
              <h4 className="text-neutral-900 font-semibold">Seus dados</h4>
              <input value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} placeholder="Nome completo" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#16A34A] focus:outline-none" />
              <input value={cliente.telefone} onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })} placeholder="Telefone / WhatsApp" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#16A34A] focus:outline-none" />
              <input value={cliente.endereco} onChange={(e) => setCliente({ ...cliente, endereco: e.target.value })} placeholder="Endereço (rua, número)" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#16A34A] focus:outline-none" />
              <select value={cliente.bairro || bairro} onChange={(e) => { setCliente({ ...cliente, bairro: e.target.value }); setBairro(e.target.value); }} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#16A34A] focus:outline-none">
                <option value="">Selecione o bairro...</option>
                {taxas.map((t) => <option key={t.id} value={t.bairro}>{t.bairro} - Entrega {brl(t.taxa)}</option>)}
              </select>
              <input value={cliente.referencia} onChange={(e) => setCliente({ ...cliente, referencia: e.target.value })} placeholder="Ponto de referência (opcional)" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#16A34A] focus:outline-none" />
            </div>

            {/* Payment */}
            <div className="space-y-3">
              <h4 className="text-neutral-900 font-semibold">Pagamento</h4>
              <div className="grid grid-cols-3 gap-2">
                {['Pix', 'Cartão', 'Dinheiro'].map((f) => (
                  <button key={f} onClick={() => setFormaPagamento(f)} className={`py-3 rounded-xl font-medium ${formaPagamento === f ? 'bg-[#16A34A] text-white' : 'bg-neutral-200 text-neutral-500'}`}>{f}</button>
                ))}
              </div>
            </div>

            <div>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (ex: sem cebola, troco para R$50)" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#16A34A] focus:outline-none" />
            </div>

            {/* Summary */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-neutral-500 text-sm"><span>Subtotal</span><span className="text-neutral-900">{brl(subtotal)}</span></div>
              <div className="flex justify-between text-neutral-500 text-sm"><span>Entrega</span><span className="text-neutral-900">{brl(taxaEntrega)}</span></div>
              <div className="flex justify-between font-bold text-lg border-t border-neutral-200 pt-2"><span className="text-neutral-900">Total</span><span className="text-[#22c55e]">{brl(total)}</span></div>
            </div>

            {erroEnvio && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{erroEnvio}</p>
            )}
            <button onClick={finalizar} disabled={!cliente.nome || !cliente.telefone || !cliente.endereco || cart.length === 0 || enviando} className="w-full bg-green-500 hover:bg-green-600 text-white py-5 rounded-2xl font-black text-lg disabled:opacity-50 active:scale-95">
              {enviando ? 'ENVIANDO...' : 'CONFIRMAR PEDIDO'}
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
  const isCombo = produto.categoria_nome.includes('Combo');
  const comboDuo = isCombo && produto.nome.toLowerCase().includes('duo');
  const opcoesSabor = isCombo ? produtos.filter((p) => p.categoria_nome.includes('Esfirra') && !p.categoria_nome.includes('Combo')) : produtos.filter((p) => p.categoria_nome === produto.categoria_nome);
  const precoFinal = isCombo ? produto.preco : (sabor2 ? Math.max(sabor1?.preco || 0, sabor2.preco) : sabor1?.preco || 0);
  const podeConfirmar = isCombo ? !!sabor1 && (!comboDuo || !!sabor2) : !!sabor1;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-neutral-200 rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-neutral-900 font-bold text-xl">{isCombo ? `Monte seu ${produto.nome}` : 'Monte sua Pizza'}</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900"><X size={20} /></button>
        </div>

        <p className="text-neutral-500 text-sm mb-2">{isCombo ? `Esfirra${comboDuo ? ' 1' : ''}` : 'Sabor 1'}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
          {opcoesSabor.map((p) => (
            <button key={p.id} onClick={() => setSabor1(p)} className={`p-3 rounded-xl text-left transition-colors ${sabor1?.id === p.id ? 'bg-[#16A34A] text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:border-neutral-600'}`}>
              <p className="font-medium text-sm">{p.nome}</p>
              {!isCombo && <p className="text-xs opacity-70">{brl(p.preco)}</p>}
            </button>
          ))}
        </div>

        {(!isCombo || comboDuo) && (
          <>
            <p className="text-neutral-500 text-sm mb-2">{isCombo ? 'Esfirra 2' : 'Sabor 2 — meio a meio (cobra o mais caro)'}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
              {opcoesSabor.map((p) => (
                <button key={p.id} onClick={() => setSabor2(sabor2?.id === p.id ? null : p)} className={`p-3 rounded-xl text-left transition-colors ${sabor2?.id === p.id ? 'bg-[#16A34A] text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:border-neutral-600'}`}>
                  <p className="font-medium text-sm">{p.nome}</p>
                  {!isCombo && <p className="text-xs opacity-70">{brl(p.preco)}</p>}
                </button>
              ))}
            </div>
          </>
        )}

        {!isCombo && adicionais.length > 0 && (
          <>
            <p className="text-neutral-500 text-sm mb-2">Adicionais</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              <button onClick={() => setSelectedAdicional(null)} className={`p-3 rounded-xl text-left transition-colors ${!selectedAdicional ? 'bg-[#16A34A] text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:border-neutral-600'}`}>
                <p className="font-medium text-sm">Nenhum</p>
              </button>
              {adicionais.map((a) => (
                <button key={a.id} onClick={() => setSelectedAdicional(a)} className={`p-3 rounded-xl text-left transition-colors ${selectedAdicional?.id === a.id ? 'bg-[#16A34A] text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:border-neutral-600'}`}>
                  <p className="font-medium text-sm">{a.nome}</p>
                  <p className="text-xs opacity-70">+{brl(a.preco)}</p>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mb-4">
          <input value={itemObs} onChange={(e) => setItemObs(e.target.value)} placeholder="Observação (ex: sem cebola)" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#16A34A] focus:outline-none" />
        </div>

        <div className="flex items-center justify-between bg-neutral-100 rounded-xl p-3 mb-4">
          <span className="text-neutral-500">Preço</span>
          <span className="text-[#22c55e] font-bold text-xl">{brl(precoFinal + (selectedAdicional?.preco || 0))}</span>
        </div>

        <button onClick={onConfirm} disabled={!podeConfirmar} className="w-full bg-green-500 hover:bg-green-600 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50 active:scale-95 transition-colors">
          ADICIONAR
        </button>
      </div>
    </div>
  );
}
