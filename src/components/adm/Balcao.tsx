import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl, todayISO } from '../../lib/format';
import { printReceipt, printMesaComanda } from '../../lib/print';
import type { Produto, Cliente, ItemPedido, TaxaEntrega, Adicional, Pedido, Mesa, ItemMesa } from '../../types';
import { Search, Plus, Minus, X, ShoppingCart, Printer, Check, Phone, ArrowLeft, CloudOff, LayoutGrid } from 'lucide-react';
import { ProductPlaceholder, usaImagemPadrao } from '../ProductPlaceholder';
import { queueOfflinePedido } from '../../lib/offlineQueue';

interface CartItem extends ItemPedido {
  produto: Produto;
}

// Compara bairros ignorando espaços nas pontas e maiúscula/minúscula — o
// cadastro de cliente e a tabela de taxas às vezes têm o mesmo bairro escrito
// com pequenas diferenças, e uma comparação exata fazia o frete sumir (caía
// pro padrão de R$0 sem avisar ninguém).
const normalizaBairro = (s: string) => s.trim().toLowerCase();

// Nome sem acento, espaço extra e maiúscula — usado pra reconhecer o mesmo
// cliente na busca e não criar "João" / "Joao" / "joão " como 3 cadastros.
const normalizaNome = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

// Tira o que quebra a sintaxe do filtro .or() do PostgREST (parêntese,
// vírgula, aspas) — era isso que dava erro quando o atendente digitava um
// telefone tipo "(88) 9...". Também colapsa espaços.
const sanitizaBusca = (s: string) => s.replace(/[(),"*]/g, ' ').replace(/\s+/g, ' ').trim();

export function Balcao({ onOrderComplete }: { onOrderComplete: () => void }) {
  const { config } = useConfig();
  const [step, setStep] = useState<'produtos' | 'carrinho' | 'cliente' | 'pagamento' | 'sucesso'>('produtos');
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [filtro, setFiltro] = useState('');
  const [catFiltro, setCatFiltro] = useState('todas');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteBusca, setClienteBusca] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tipo, setTipo] = useState<'balcao' | 'delivery' | 'mesa'>('balcao');
  const [taxas, setTaxas] = useState<TaxaEntrega[]>([]);
  const [bairro, setBairro] = useState('');
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [mesaSelecionada, setMesaSelecionada] = useState<string | null>(null);
  const [mesaLancada, setMesaLancada] = useState<number | null>(null);
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
    const [p, a, t, m] = await Promise.all([
      supabase.from('produtos').select('*').eq('ativo', true).order('categoria_nome').order('nome'),
      supabase.from('adicionais').select('*').eq('ativo', true).order('nome'),
      supabase.from('taxa_entrega').select('*').eq('ativo', true).order('bairro'),
      supabase.from('mesas').select('id, numero, status, abertura_at').order('numero'),
    ]);
    setProdutos((p.data as Produto[]) || []);
    setAdicionais((a.data as Adicional[]) || []);
    setTaxas((t.data as TaxaEntrega[]) || []);
    setMesas((m.data as Mesa[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Busca cliente por nome (prioridade) ou telefone — com atraso de 300ms pra
  // não disparar a cada tecla, texto limpo pra não quebrar o filtro do
  // PostgREST, e estado de "buscando" pra dar retorno visual.
  const buscaCliente = (val: string) => {
    setClienteBusca(val);
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    const termo = sanitizaBusca(val);
    if (termo.length < 2) {
      setClientes([]);
      setBuscandoCliente(false);
      return;
    }
    setBuscandoCliente(true);
    buscaTimer.current = setTimeout(async () => {
      try {
        const soDigitos = termo.replace(/\D/g, '');
        const filtros = [`nome.ilike.%${termo}%`];
        if (soDigitos.length >= 3) filtros.push(`telefone.ilike.%${soDigitos}%`);
        const { data, error } = await supabase
          .from('clientes')
          .select('id, nome, telefone, endereco, bairro, cep, referencia')
          .or(filtros.join(','))
          .limit(10);
        if (error) throw error;
        setClientes((data as Cliente[]) || []);
      } catch {
        setClientes([]);
      } finally {
        setBuscandoCliente(false);
      }
    }, 300);
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
  const taxaEncontrada = tipo === 'delivery' ? taxas.find((t) => normalizaBairro(t.bairro) === normalizaBairro(bairro)) : undefined;
  const bairroSemTaxaCadastrada = tipo === 'delivery' && !!bairro.trim() && !taxaEncontrada;
  const taxaEntrega = tipo === 'delivery' ? (taxaEncontrada?.taxa ?? config?.taxa_fixa_entrega ?? 0) : 0;
  const total = subtotal + taxaEntrega;

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
        id: '',
        pedido_id: '',
        produto_id: produto.id,
        produto_nome: `Esfirra: ${produto.nome}`,
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

    if (isCombo(showSabores)) {
      // Combo: preço fixo do combo (não deriva do preço das esfirras — o combo
      // já é a promoção), sabores só identificam pro cozinha o que preparar.
      const nome = sabor2 ? `${showSabores.nome} - ${sabor1.nome} / ${sabor2.nome}` : `${showSabores.nome} - ${sabor1.nome}`;
      addToCart({
        id: '',
        pedido_id: '',
        produto_id: showSabores.id,
        produto_nome: nome,
        quantidade: 1,
        preco_unitario: showSabores.preco,
        custo_unitario: showSabores.custo,
        observacao: itemObs,
        sabor1: sabor1.nome,
        sabor2: sabor2?.nome || '',
        adicional: '',
        adicional_preco: 0,
        produto: showSabores,
      });
      setShowSabores(null);
      setSabor1(null);
      setSabor2(null);
      setItemObs('');
      return;
    }

    const isHalfHalf = sabor2 !== null;
    // Half/half: charge the more expensive one
    const preco = isHalfHalf ? Math.max(sabor1.preco, sabor2!.preco) : sabor1.preco;
    const custo = isHalfHalf ? (sabor1.custo + sabor2!.custo) / 2 : sabor1.custo;
    const nome = isHalfHalf ? `Pizza ${sabor1.tamanho} ${sabor1.nome} / ${sabor2!.nome}` : `Pizza ${sabor1.tamanho} ${sabor1.nome}`;
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

      // Get or create cliente — nome é o que importa (telefone é opcional).
      // "Consumidor" é o rótulo genérico do balcão sem nome: não vira cadastro.
      let clienteId = cliente?.id || null;
      const nomeNovo = novoCliente.nome.trim();
      if (!cliente && nomeNovo && normalizaNome(nomeNovo) !== 'consumidor') {
        // Antes de criar, procura um cliente já salvo com o mesmo nome
        // normalizado — evita "João" / "Joao" virarem cadastros diferentes.
        const { data: existentes } = await supabase
          .from('clientes')
          .select('id, nome, telefone')
          .ilike('nome', nomeNovo)
          .limit(5);
        const match = (existentes as Cliente[] | null || []).find(
          (e) => normalizaNome(e.nome) === normalizaNome(nomeNovo),
        );
        if (match) {
          clienteId = match.id;
          // Completa o telefone no cadastro se ele estava vazio e agora veio um.
          if (!match.telefone && novoCliente.telefone.trim()) {
            await supabase.from('clientes').update({ telefone: novoCliente.telefone.trim() }).eq('id', match.id);
          }
        } else {
          const { data: nc, error: cliErr } = await supabase.from('clientes').insert(novoCliente).select().maybeSingle();
          if (cliErr) throw cliErr;
          clienteId = (nc as Cliente)?.id || null;
        }
      }

      const pedidoData = {
        numero,
        cliente_id: clienteId,
        cliente_nome: cliente?.nome || novoCliente.nome || 'Consumidor',
        cliente_telefone: cliente?.telefone || novoCliente.telefone || '',
        cliente_endereco: cliente?.endereco || novoCliente.endereco || '',
        cliente_bairro: cliente?.bairro || novoCliente.bairro || bairro || '',
        tipo,
        status: 'confirmado' as const,
        subtotal,
        taxa_entrega: taxaEntrega,
        desconto: 0,
        total,
        custo_total: custoTotal,
        lucro,
        forma_pagamento: formaPagamento,
        observacao,
        cupom: '',
        imprimir_cozinha: printCozinha,
        imprimir_caixa: printCaixa,
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
        data: todayISO(),
      });

      const fullPedido = { ...pedidoData, id: pedidoId, itens: cart, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), avaliacao: 0 } as Pedido;

      // Não imprime aqui: o INSERT acima já dispara o listener central em
      // Adm.tsx (Realtime), que imprime na impressora conectada — de
      // qualquer terminal (PC, celular) que tenha lançado o pedido. Sem essa
      // separação, lançar pelo próprio PC com a impressora conectada
      // imprimiria a comanda duas vezes.

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

  // Lança os itens do carrinho direto numa mesa do salão (em vez de fechar um
  // pedido). A mesa é fechada depois pelo módulo Mesas com o fluxo padrão
  // (RPC fechar_mesa → pedido tipo=mesa + caixa). Mesma mecânica que o
  // MesaDetalhe.handleAddItens usa quando lança item pelo salão.
  const lancarNaMesa = async () => {
    if (cart.length === 0 || !mesaSelecionada) return;
    const mesa = mesas.find((m) => m.id === mesaSelecionada);
    if (!mesa) return;
    if (!navigator.onLine) {
      alert('Lançar na mesa precisa de internet. Tente de novo quando a conexão voltar.');
      return;
    }
    try {
      const novos = cart.map((c) => ({
        mesa_id: mesa.id,
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
      const { data: inserted, error } = await supabase.from('itens_mesa').insert(novos).select();
      if (error) throw error;

      if (mesa.status === 'livre') {
        await supabase.from('mesas').update({ status: 'ocupada', abertura_at: new Date().toISOString() }).eq('id', mesa.id);
      } else if (mesa.status === 'fechando') {
        await supabase.from('mesas').update({ status: 'ocupada' }).eq('id', mesa.id);
      }

      if (config && inserted && inserted.length > 0) {
        printMesaComanda(mesa.numero, inserted as ItemMesa[], config);
      }

      setMesaLancada(mesa.numero);
      setCart([]);
      setStep('sucesso');
      onOrderComplete();
    } catch (e: any) {
      alert('Erro ao lançar na mesa: ' + (e?.message || 'tente novamente'));
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
      status: 'confirmado' as const,
      subtotal,
      taxa_entrega: taxaEntrega,
      desconto: 0,
      total,
      custo_total: custoTotal,
      lucro,
      forma_pagamento: formaPagamento,
      observacao,
      cupom: '',
      // Já imprime local aqui embaixo (linhas do printCozinha/printCaixa) —
      // marca como "não imprimir de novo" pra quando sincronizar, senão o
      // listener central duplicaria a comanda que já saiu na hora.
      imprimir_cozinha: false,
      imprimir_caixa: false,
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
    setClienteBusca('');
    setClientes([]);
    setBuscandoCliente(false);
    setBairro('');
    setObservacao('');
    setFormaPagamento('Dinheiro');
    setTipo('balcao');
    setMesaSelecionada(null);
    setMesaLancada(null);
    setStep('produtos');
    setUltimoPedido(null);
    load();
  };

  // === SUCESSO ===
  if (step === 'sucesso') {
    // Variante Mesa: itens foram pra uma mesa do salão, não viraram pedido.
    if (mesaLancada !== null) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fadeIn">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mb-4 bg-green-500/20">
            <LayoutGrid size={44} className="text-green-600" />
          </div>
          <h2 className="text-3xl font-black text-neutral-900">MESA {mesaLancada}</h2>
          <p className="text-neutral-500 mt-2 text-center max-w-sm">
            Itens lançados e comanda enviada pra cozinha. A conta fecha pelo módulo <b className="text-neutral-700">Mesas</b>, como sempre.
          </p>
          <button onClick={reset} className="mt-6 flex items-center gap-2 bg-[#F26522] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#f6121d]">
            <Plus size={20} /> Novo Pedido
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fadeIn">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${pedidoOffline ? 'bg-amber-500/20' : 'bg-green-500/20'}`}>
          {pedidoOffline ? <CloudOff size={48} className="text-amber-700" /> : <Check size={48} className="text-green-600" />}
        </div>
        {pedidoOffline ? (
          <>
            <h2 className="text-2xl font-black text-amber-700">PEDIDO SALVO (SEM INTERNET)</h2>
            <p className="text-neutral-500 mt-2 text-sm text-center max-w-sm">
              Sem conexão no momento — o pedido foi guardado no aparelho e será enviado automaticamente ao banco assim que a internet voltar.
              O número oficial será gerado na sincronização.
            </p>
          </>
        ) : (
          <h2 className="text-3xl font-black text-neutral-900">PEDIDO #{ultimoPedido?.numero}</h2>
        )}
        <p className="text-neutral-500 mt-2">Total: <span className="text-neutral-900 font-bold text-xl">{brl(ultimoPedido?.total || 0)}</span></p>
        <div className="flex gap-3 mt-6">
          {config && ultimoPedido && (
            <>
              <button onClick={() => printReceipt(ultimoPedido, config, 'cozinha')} className="flex items-center gap-2 bg-neutral-200 text-neutral-900 px-5 py-3 rounded-xl font-medium hover:bg-neutral-700">
                <Printer size={20} /> Cozinha
              </button>
              <button onClick={() => printReceipt(ultimoPedido, config, 'caixa')} className="flex items-center gap-2 bg-neutral-200 text-neutral-900 px-5 py-3 rounded-xl font-medium hover:bg-neutral-700">
                <Printer size={20} /> Caixa
              </button>
            </>
          )}
          <button onClick={reset} className="flex items-center gap-2 bg-[#F26522] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#f6121d]">
            <Plus size={20} /> Novo Pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header — o carrinho principal agora é a barra flutuante embaixo */}
      <div className="flex items-center justify-between gap-3 sticky top-0 lg:top-[57px] z-10 bg-[#FBF6EF] py-2">
        <h2 className="text-2xl font-bold text-neutral-900">Balcão Rápido</h2>
        {step !== 'produtos' && (
          <button onClick={() => setStep('produtos')} className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 text-sm font-medium bg-neutral-200 px-3 py-2 rounded-xl">
            <ArrowLeft size={16} /> Cardápio
          </button>
        )}
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
                className="w-full bg-neutral-100 border border-neutral-200 rounded-xl pl-10 pr-4 py-3 text-neutral-900 text-lg focus:border-[#F26522] focus:outline-none"
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCatFiltro('todas')}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${catFiltro === 'todas' ? 'bg-[#F26522] text-white' : 'bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-neutral-900'}`}
            >Todos</button>
            {categorias.map((c) => (
              <button
                key={c}
                onClick={() => setCatFiltro(c)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${catFiltro === c ? 'bg-[#F26522] text-white' : 'bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-neutral-900'}`}
              >{c}</button>
            ))}
          </div>

          {/* Product grid - GIANT buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProductClick(p)}
                className="group bg-white border border-neutral-200 rounded-2xl p-4 text-left hover:border-[#F26522]/70 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 active:scale-95 transition-all min-h-[110px] flex flex-col justify-between"
              >
                <div>
                  <p className="text-neutral-900 font-bold text-base leading-tight">{p.nome}</p>
                  <p className="text-neutral-500 text-xs mt-0.5">{p.categoria_nome}</p>
                </div>
                <div className="flex items-end justify-between mt-2">
                  <span className="text-[#F26522] font-black text-xl">{brl(p.preco)}</span>
                  {p.foto && !usaImagemPadrao(p.categoria_nome) ? (
                    <img
                      src={p.foto}
                      alt={p.nome}
                      loading="lazy"
                      className="w-14 h-14 rounded-lg object-cover aspect-square transition-transform duration-200 group-hover:scale-110"
                    />
                  ) : (
                    <ProductPlaceholder categoriaNome={p.categoria_nome} className="w-14 h-14 rounded-lg aspect-square" />
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
            <button onClick={() => setStep('produtos')} className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 text-sm font-medium bg-neutral-200 px-3 py-2 rounded-xl">
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3 className="text-xl font-bold text-neutral-900">Carrinho</h3>
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">Carrinho vazio</div>
          ) : (
            <>
              <div className="space-y-2">
                {cart.map((c, i) => (
                  <div key={i} className="bg-white border border-neutral-200 rounded-xl p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-neutral-900 font-semibold text-sm">{c.produto_nome}</p>
                      {c.adicional && <p className="text-neutral-500 text-xs">+ {c.adicional} ({brl(c.adicional_preco)})</p>}
                      {c.observacao && <p className="text-amber-700 text-xs">Obs: {c.observacao}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(i, -1)} className="w-8 h-8 bg-neutral-200 text-neutral-900 rounded-lg flex items-center justify-center"><Minus size={16} /></button>
                      <span className="text-neutral-900 font-bold w-6 text-center">{c.quantidade}</span>
                      <button onClick={() => updateQty(i, 1)} className="w-8 h-8 bg-neutral-200 text-neutral-900 rounded-lg flex items-center justify-center"><Plus size={16} /></button>
                    </div>
                    <span className="text-[#22c55e] font-bold w-20 text-right">{brl(c.quantidade * (c.preco_unitario + c.adicional_preco))}</span>
                    <button onClick={() => removeFromCart(i)} className="text-neutral-500 hover:text-red-600"><X size={18} /></button>
                  </div>
                ))}
              </div>

              <button onClick={() => setStep('produtos')} className="w-full flex items-center justify-center gap-2 border border-[#F26522] text-[#F26522] rounded-xl py-2.5 font-semibold hover:bg-[#FDECE3]">
                <Plus size={18} /> Adicionar mais itens
              </button>

              {/* Type selector */}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setTipo('balcao')} className={`py-3 rounded-xl font-semibold ${tipo === 'balcao' ? 'bg-[#F26522] text-white' : 'bg-neutral-200 text-neutral-500'}`}>Balcão</button>
                <button onClick={() => setTipo('delivery')} className={`py-3 rounded-xl font-semibold ${tipo === 'delivery' ? 'bg-[#F26522] text-white' : 'bg-neutral-200 text-neutral-500'}`}>Entrega</button>
                <button onClick={() => setTipo('mesa')} className={`py-3 rounded-xl font-semibold ${tipo === 'mesa' ? 'bg-[#F26522] text-white' : 'bg-neutral-200 text-neutral-500'}`}>Mesa</button>
              </div>

              {tipo === 'delivery' && (
                <div>
                  <label className="text-neutral-500 text-sm">Bairro</label>
                  <select value={taxaEncontrada?.bairro ?? bairro} onChange={(e) => setBairro(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mt-1 focus:border-[#F26522] focus:outline-none">
                    <option value="">Selecione...</option>
                    {taxas.map((t) => <option key={t.id} value={t.bairro}>{t.bairro} - {brl(t.taxa)}</option>)}
                  </select>
                  {bairroSemTaxaCadastrada && (
                    <p className="text-amber-600 text-xs mt-1.5">
                      "{bairro}" não tem taxa de entrega cadastrada — cobrando o valor padrão da loja ({brl(config?.taxa_fixa_entrega || 0)}). Selecione o bairro certo na lista acima se for diferente.
                    </p>
                  )}
                </div>
              )}

              {tipo === 'mesa' && (
                <div>
                  <label className="text-neutral-500 text-sm">Mesa</label>
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {mesas.map((m) => {
                      const sel = mesaSelecionada === m.id;
                      const ocupada = m.status !== 'livre';
                      return (
                        <button
                          key={m.id}
                          onClick={() => setMesaSelecionada(m.id)}
                          className={`py-3 rounded-xl font-bold text-center border transition-colors ${
                            sel ? 'bg-[#F26522] text-white border-[#F26522]'
                            : ocupada ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-white text-neutral-700 border-neutral-200'
                          }`}
                        >
                          {m.numero}
                          <span className="block text-[10px] font-medium opacity-80">{ocupada ? 'em uso' : 'livre'}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-neutral-500 text-xs mt-2">Os itens entram na mesa. A conta fecha pelo módulo Mesas, com o fluxo de sempre.</p>
                </div>
              )}

              {/* Totals */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-neutral-500"><span>Subtotal</span><span className="text-neutral-900">{brl(subtotal)}</span></div>
                {tipo === 'delivery' && <div className="flex justify-between text-neutral-500"><span>Entrega</span><span className="text-neutral-900">{brl(taxaEntrega)}</span></div>}
                <div className="flex justify-between text-xl font-bold border-t border-neutral-200 pt-2"><span className="text-neutral-900">Total</span><span className="text-[#22c55e]">{brl(tipo === 'mesa' ? subtotal : total)}</span></div>
              </div>

              {tipo === 'mesa' ? (
                <button
                  onClick={lancarNaMesa}
                  disabled={!mesaSelecionada}
                  className="w-full bg-[#F26522] text-white py-4 rounded-xl font-bold text-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                >
                  {mesaSelecionada ? `Lançar na Mesa ${mesas.find((m) => m.id === mesaSelecionada)?.numero ?? ''}` : 'Selecione uma mesa'}
                </button>
              ) : (
                <button onClick={() => setStep('cliente')} className="w-full bg-[#F26522] text-white py-4 rounded-xl font-bold text-lg active:scale-95">
                  Continuar
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Cliente step — nome é o que importa; telefone é opcional */}
      {step === 'carrinho' && null}
      {step === 'cliente' && (() => {
        const nomeOk = !!cliente || !!novoCliente.nome.trim();
        const entregaOk = tipo !== 'delivery' || (!!novoCliente.endereco.trim() && !!novoCliente.bairro);
        const podeContinuar = nomeOk && entregaOk;
        return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('carrinho')} className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 text-sm font-medium bg-neutral-200 px-3 py-2 rounded-xl">
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3 className="text-xl font-bold text-neutral-900">Cliente</h3>
          </div>

          {/* Cliente já selecionado */}
          {cliente ? (
            <div className="bg-white border border-[#F26522] rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-neutral-900 font-medium">{cliente.nome}</p>
                {(cliente.telefone || cliente.bairro) && (
                  <p className="text-neutral-500 text-sm flex items-center gap-1">
                    <Phone size={12} /> {cliente.telefone || 'sem telefone'}{cliente.bairro ? ` · ${cliente.bairro}` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => { setCliente(null); setClienteBusca(''); }} className="text-neutral-400 hover:text-neutral-900"><X size={18} /></button>
            </div>
          ) : (
            <>
              {/* Nome do cliente = busca + cadastro no mesmo campo */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-neutral-500 text-sm">Nome do cliente</label>
                  <button
                    onClick={() => { setNovoCliente({ ...novoCliente, nome: 'Consumidor' }); setClienteBusca(''); setClientes([]); }}
                    className="text-xs font-medium text-[#F26522] hover:underline"
                  >
                    Consumidor
                  </button>
                </div>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    autoFocus
                    value={novoCliente.nome || clienteBusca}
                    onChange={(e) => { setNovoCliente({ ...novoCliente, nome: e.target.value }); buscaCliente(e.target.value); }}
                    placeholder="Digite o nome (ou telefone)"
                    className="w-full bg-neutral-100 border border-neutral-200 rounded-xl pl-10 pr-4 py-3 text-neutral-900 focus:border-[#F26522] focus:outline-none"
                  />
                </div>

                {buscandoCliente && <p className="text-neutral-400 text-xs mt-1.5 pl-1">Buscando cadastro...</p>}
                {!buscandoCliente && clientes.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto">
                    {clientes.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setCliente(c); setBairro(c.bairro); setNovoCliente({ ...novoCliente, nome: '' }); setClienteBusca(''); setClientes([]); }}
                        className="w-full text-left bg-white border border-neutral-200 rounded-xl p-2.5 hover:border-[#F26522]"
                      >
                        <p className="text-neutral-900 font-medium text-sm">{c.nome}</p>
                        <p className="text-neutral-500 text-xs flex items-center gap-1"><Phone size={11} /> {c.telefone || 'sem telefone'}{c.bairro ? ` · ${c.bairro}` : ''}</p>
                      </button>
                    ))}
                  </div>
                )}
                {!buscandoCliente && clienteBusca.trim().length >= 2 && clientes.length === 0 && (
                  <p className="text-neutral-400 text-xs mt-1.5 pl-1">Nenhum cadastro — vai ser salvo como cliente novo.</p>
                )}
              </div>

              {/* Telefone opcional */}
              <input
                value={novoCliente.telefone}
                onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })}
                placeholder="Telefone (opcional)"
                inputMode="tel"
                className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#F26522] focus:outline-none"
              />

              {tipo === 'delivery' && (
                <>
                  <input value={novoCliente.endereco} onChange={(e) => setNovoCliente({ ...novoCliente, endereco: e.target.value })} placeholder="Endereço" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#F26522] focus:outline-none" />
                  <select value={novoCliente.bairro} onChange={(e) => { setNovoCliente({ ...novoCliente, bairro: e.target.value }); setBairro(e.target.value); }} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 focus:border-[#F26522] focus:outline-none">
                    <option value="">Bairro...</option>
                    {taxas.map((t) => <option key={t.id} value={t.bairro}>{t.bairro} - {brl(t.taxa)}</option>)}
                  </select>
                </>
              )}
            </>
          )}

          <button
            onClick={() => setStep('pagamento')}
            disabled={!podeContinuar}
            className="w-full bg-[#F26522] text-white py-4 rounded-xl font-bold text-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
            Continuar
          </button>
          {!podeContinuar && (
            <p className="text-center text-neutral-500 text-xs">
              {!nomeOk ? 'Informe o nome do cliente (ou toque em "Consumidor").' : 'Preencha endereço e bairro para a entrega.'}
            </p>
          )}
        </div>
        );
      })()}

      {/* Pagamento step */}
      {step === 'pagamento' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('cliente')} className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 text-sm font-medium bg-neutral-200 px-3 py-2 rounded-xl">
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3 className="text-xl font-bold text-neutral-900">Pagamento</h3>
          </div>

          {tipo === 'delivery' && (
            <div>
              <label className="text-neutral-500 text-sm">Bairro (confira antes de fechar)</label>
              <select value={taxaEncontrada?.bairro ?? bairro} onChange={(e) => setBairro(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mt-1 focus:border-[#F26522] focus:outline-none">
                <option value="">Selecione...</option>
                {taxas.map((t) => <option key={t.id} value={t.bairro}>{t.bairro} - {brl(t.taxa)}</option>)}
              </select>
              {bairroSemTaxaCadastrada ? (
                <p className="text-amber-600 text-xs mt-1.5">
                  "{bairro}" não tem taxa de entrega cadastrada — cobrando o valor padrão da loja ({brl(config?.taxa_fixa_entrega || 0)}). Selecione o bairro certo se for diferente.
                </p>
              ) : !bairro.trim() ? (
                <p className="text-amber-600 text-xs mt-1.5">Nenhum bairro selecionado — cobrando o valor padrão da loja ({brl(config?.taxa_fixa_entrega || 0)}) de entrega. Selecione o bairro do cliente.</p>
              ) : null}
            </div>
          )}

          <div className="bg-white border border-neutral-200 rounded-2xl p-4 text-center">
            <p className="text-neutral-500 text-sm">Total a Pagar</p>
            <p className="text-[#22c55e] font-black text-4xl">{brl(total)}</p>
            {tipo === 'delivery' && <p className="text-neutral-500 text-xs mt-1">Subtotal {brl(subtotal)} + Entrega {brl(taxaEntrega)}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {['Dinheiro', 'Cartão', 'Pix'].map((f) => (
              <button
                key={f}
                onClick={() => setFormaPagamento(f)}
                className={`py-4 rounded-xl font-bold text-lg ${formaPagamento === f ? 'bg-[#F26522] text-white' : 'bg-neutral-200 text-neutral-500'}`}
              >{f}</button>
            ))}
          </div>

          <div>
            <label className="text-neutral-500 text-sm">Observação geral</label>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: sem cebola, troco para R$50..." className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mt-1 focus:border-[#F26522] focus:outline-none" />
          </div>

          {/* Print options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-neutral-700 text-sm">
              <input type="checkbox" checked={printCozinha} onChange={(e) => setPrintCozinha(e.target.checked)} className="w-4 h-4 accent-[#F26522]" /> Imprimir Cozinha
            </label>
            <label className="flex items-center gap-2 text-neutral-700 text-sm">
              <input type="checkbox" checked={printCaixa} onChange={(e) => setPrintCaixa(e.target.checked)} className="w-4 h-4 accent-[#F26522]" /> Imprimir Caixa
            </label>
          </div>

          <button onClick={fecharPedido} className="w-full bg-green-500 hover:bg-green-600 text-white py-5 rounded-2xl font-black text-xl active:scale-95">
            FECHAR PEDIDO
          </button>
          <button onClick={() => setStep('carrinho')} className="w-full py-3 text-neutral-500 text-sm">Voltar</button>
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

      {/* Carrinho flutuante — fica sempre à mão enquanto escolhe os produtos.
          Os itens ficam salvos no carrinho; dá pra ir e voltar adicionando
          mais sem perder nada. Fica acima da barra de navegação no mobile. */}
      {step === 'produtos' && cart.length > 0 && (
        <button
          onClick={() => setStep('carrinho')}
          className="fixed z-30 bottom-20 lg:bottom-6 left-3 right-3 lg:left-auto lg:right-8 lg:w-96 bg-[#F26522] text-white rounded-2xl shadow-[0_8px_24px_rgba(242,101,34,0.35)] px-4 py-3 flex items-center justify-between active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center gap-2 font-semibold">
            <span className="relative">
              <ShoppingCart size={22} />
              <span className="absolute -top-2 -right-2 bg-white text-[#F26522] text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                {cart.reduce((s, c) => s + c.quantidade, 0)}
              </span>
            </span>
            Ver carrinho
          </span>
          <span className="font-black text-lg">{brl(subtotal)}</span>
        </button>
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
          <h3 className="text-neutral-900 font-bold text-lg">{isCombo ? produto.nome : produto.categoria_nome}</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900"><X size={20} /></button>
        </div>

        <p className="text-neutral-500 text-sm mb-2">{isCombo ? `Esfirra${comboDuo ? ' 1' : ''}` : `Sabor 1 ${sabor2 ? '(meio a meio)' : ''}`}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
          {opcoesSabor.map((p) => (
            <button
              key={p.id}
              onClick={() => setSabor1(p)}
              className={`p-3 rounded-xl text-left ${sabor1?.id === p.id ? 'bg-[#F26522] text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'}`}
            >
              <p className="font-medium text-sm">{p.nome}</p>
              {!isCombo && <p className="text-xs opacity-70">{brl(p.preco)}</p>}
            </button>
          ))}
        </div>

        {(!isCombo || comboDuo) && (
          <>
            <p className="text-neutral-500 text-sm mb-2">{isCombo ? 'Esfirra 2' : 'Sabor 2 (opcional)'}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
              {opcoesSabor.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSabor2(sabor2?.id === p.id ? null : p)}
                  className={`p-3 rounded-xl text-left ${sabor2?.id === p.id ? 'bg-[#F26522] text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'}`}
                >
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
              <button onClick={() => setSelectedAdicional(null)} className={`p-3 rounded-xl text-left ${!selectedAdicional ? 'bg-[#F26522] text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'}`}>
                <p className="font-medium text-sm">Nenhum</p>
              </button>
              {adicionais.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAdicional(a)}
                  className={`p-3 rounded-xl text-left ${selectedAdicional?.id === a.id ? 'bg-[#F26522] text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'}`}
                >
                  <p className="font-medium text-sm">{a.nome}</p>
                  <p className="text-xs opacity-70">+{brl(a.preco)}</p>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mb-4">
          <label className="text-neutral-500 text-sm">Observação</label>
          <input value={itemObs} onChange={(e) => setItemObs(e.target.value)} placeholder="Ex: sem cebola, bem assada..." className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 mt-1 focus:border-[#F26522] focus:outline-none" />
        </div>

        <div className="flex items-center justify-between bg-neutral-100 rounded-xl p-3 mb-4">
          <span className="text-neutral-500">Preço</span>
          <span className="text-[#22c55e] font-bold text-xl">{brl(precoFinal + (selectedAdicional?.preco || 0))}</span>
        </div>

        <button onClick={onConfirm} disabled={!podeConfirmar} className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50 active:scale-95">
          ADICIONAR
        </button>
      </div>
    </div>
  );
}
