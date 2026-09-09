import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import type { Pedido, ItemPedido } from '../types';
import { dateTimeToISO, startOfDay, endOfDay } from '../lib/dateUtils';

interface UsePedidosPeriodoOptions {
  dataInicio: Date;
  dataFim: Date;
  filtro?: {
    tipo?: 'balcao' | 'delivery' | 'cliente';
    status?: string;
  };
}

interface PedidoComItens extends Pedido {
  itens?: ItemPedido[];
}

interface UsePedidosPeriodoReturn {
  pedidos: PedidoComItens[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  total: number;
}

export function usePedidosPeriodo({
  dataInicio,
  dataFim,
  filtro,
}: UsePedidosPeriodoOptions): UsePedidosPeriodoReturn {
  const [pedidos, setPedidos] = useState<PedidoComItens[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const inicio = dateTimeToISO(startOfDay(dataInicio));
      const fim = dateTimeToISO(endOfDay(dataFim));

      let query = supabase
        .from('pedidos')
        .select('*')
        .gte('created_at', inicio)
        .lte('created_at', fim)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: false });

      if (filtro?.tipo) {
        query = query.eq('tipo', filtro.tipo);
      }

      if (filtro?.status) {
        query = query.eq('status', filtro.status);
      }

      const { data, error: err } = await query;

      if (err) {
        throw err;
      }

      const pedsData = (data as Pedido[]) || [];

      // Busca os itens de TODOS os pedidos numa única query (antes eram N
      // queries em série, uma por pedido — em período com 100+ pedidos isso
      // sozinho levava vários segundos só pra abrir o relatório).
      const itensMap: Record<string, ItemPedido[]> = {};
      const ids = pedsData.map((p) => p.id);
      if (ids.length > 0) {
        const { data: itensData } = await supabase
          .from('itens_pedido')
          .select('*')
          .in('pedido_id', ids);
        (itensData as ItemPedido[] | null || []).forEach((item) => {
          if (!itensMap[item.pedido_id]) itensMap[item.pedido_id] = [];
          itensMap[item.pedido_id].push(item);
        });
      }

      const pedidosComItens: PedidoComItens[] = pedsData.map((p) => ({
        ...p,
        itens: itensMap[p.id] || [],
      }));

      setPedidos(pedidosComItens);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar pedidos';
      logger.error(`Erro em usePedidosPeriodo: ${msg}`, err instanceof Error ? err : undefined);
      setError(msg);
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, filtro]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    pedidos,
    loading,
    error,
    refetch: fetch,
    total: pedidos.length,
  };
}
