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

      const itensMap: Record<string, ItemPedido[]> = {};
      for (const p of pedsData) {
        const { data: itensData } = await supabase
          .from('itens_pedido')
          .select('*')
          .eq('pedido_id', p.id);
        itensMap[p.id] = (itensData as ItemPedido[]) || [];
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
