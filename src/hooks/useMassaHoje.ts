import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { startOfDay, endOfDay, dateTimeToISO } from '../lib/dateUtils';
import { todayISO } from '../lib/format';
import { consumoMassa, type ProdutoMassaInfo } from '../lib/massa';
import type { MassaTipo } from '../types';

// Controle de massa do dia (pizza/esfirra): quanto foi lançado de manhã e
// quanto já foi vendido (Balcão + Mesa + Site), pra saber em tempo real
// quanto ainda resta. O consumo não depende de uma tabela de baixa própria —
// é somado direto dos itens já lançados hoje (itens_pedido de pedidos não
// cancelados + itens_mesa, que cobre mesas ainda abertas — ao fechar, o item
// migra pra itens_pedido e some de itens_mesa, então nunca conta em dobro).
export function useMassaHoje() {
  const [loading, setLoading] = useState(true);
  const [pizzaInicial, setPizzaInicial] = useState(0);
  const [esfihaInicial, setEsfihaInicial] = useState(0);
  const [pizzaConsumido, setPizzaConsumido] = useState(0);
  const [esfihaConsumido, setEsfihaConsumido] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const hoje = todayISO();
    const ini = dateTimeToISO(startOfDay());
    const fim = dateTimeToISO(endOfDay());

    const [{ data: contagens }, { data: pedidosHoje }, { data: itensMesa }, { data: produtos }] = await Promise.all([
      supabase.from('contagem_massas').select('*').eq('data', hoje),
      supabase.from('pedidos').select('id').gte('created_at', ini).lte('created_at', fim).neq('status', 'cancelado'),
      supabase.from('itens_mesa').select('produto_id, quantidade').gte('created_at', ini).lte('created_at', fim),
      supabase.from('produtos').select('id, categoria_nome, nome'),
    ]);

    const produtoMap = new Map<string, ProdutoMassaInfo>();
    (produtos || []).forEach((p: any) => produtoMap.set(p.id, p));

    const pedidoIds = (pedidosHoje || []).map((p: any) => p.id);
    let itensPedido: { produto_id: string | null; quantidade: number }[] = [];
    if (pedidoIds.length > 0) {
      const { data } = await supabase.from('itens_pedido').select('produto_id, quantidade').in('pedido_id', pedidoIds);
      itensPedido = data || [];
    }

    let pizza = 0, esfiha = 0;
    [...itensPedido, ...(itensMesa || [])].forEach((it: any) => {
      const produto = it.produto_id ? produtoMap.get(it.produto_id) : null;
      const c = consumoMassa(produto, Number(it.quantidade || 0));
      pizza += c.pizza;
      esfiha += c.esfiha;
    });
    setPizzaConsumido(pizza);
    setEsfihaConsumido(esfiha);

    const cp = (contagens as any[] || []).find((c) => c.tipo === 'pizza');
    const ce = (contagens as any[] || []).find((c) => c.tipo === 'esfiha');
    setPizzaInicial(cp?.quantidade || 0);
    setEsfihaInicial(ce?.quantidade || 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('massa-hoje-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contagem_massas' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itens_pedido' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itens_mesa' }, load)
      .subscribe();
    const id = setInterval(load, 20000);
    return () => {
      clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const salvarContagem = useCallback(async (tipo: MassaTipo, quantidade: number) => {
    const hoje = todayISO();
    const { error } = await supabase
      .from('contagem_massas')
      .upsert({ data: hoje, tipo, quantidade }, { onConflict: 'data,tipo' });
    if (error) throw error;
    await load();
  }, [load]);

  return {
    loading,
    pizzaInicial,
    esfihaInicial,
    pizzaConsumido,
    esfihaConsumido,
    pizzaRestante: pizzaInicial - pizzaConsumido,
    esfihaRestante: esfihaInicial - esfihaConsumido,
    salvarContagem,
    refresh: load,
  };
}
