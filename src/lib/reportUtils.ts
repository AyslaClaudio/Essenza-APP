import type { Pedido, ItemPedido } from '../types';

export interface KPIs {
  faturamento: number;
  custoTotal: number;
  lucroTotal: number;
  lucroLiquido: number;
  ticketMedio: number;
  margemMedia: number;
  pedidosCount: number;
  margensIndividuais: number[];
  pedidosEntregues: number;
  pedidosCancelados: number;
  pedidosEmAndamento: number;
}

export interface KPIsPorTipo {
  [tipo: string]: KPIs;
}

export interface ProdutoAnalise {
  nome: string;
  quantidade: number;
  custo: number;
  venda: number;
  lucro: number;
  margem: number;
}

export function calcularKPIs(pedidos: Pedido[]): KPIs {
  const faturamento = pedidos.reduce((s, p) => s + Number(p.total), 0);
  const custoTotal = pedidos.reduce((s, p) => s + Number(p.custo_total), 0);
  const lucroTotal = pedidos.reduce((s, p) => s + Number(p.lucro), 0);
  const pedidosCount = pedidos.length;
  const ticketMedio = pedidosCount > 0 ? faturamento / pedidosCount : 0;
  const margemMedia = faturamento > 0 ? (lucroTotal / faturamento) * 100 : 0;

  const margensIndividuais = pedidos
    .filter((p) => Number(p.total) > 0)
    .map((p) => (Number(p.lucro) / Number(p.total)) * 100);

  const pedidosEntregue = pedidos.filter((p) => p.status === 'entregue').length;
  const pedidosCancelado = pedidos.filter((p) => p.status === 'cancelado').length;
  const pedidosEmAndamento = pedidosCount - pedidosEntregue - pedidosCancelado;

  return {
    faturamento,
    custoTotal,
    lucroTotal,
    lucroLiquido: lucroTotal,
    ticketMedio,
    margemMedia,
    pedidosCount,
    margensIndividuais,
    pedidosEntregues: pedidosEntregue,
    pedidosCancelados: pedidosCancelado,
    pedidosEmAndamento,
  };
}

export function agruparPorTipo(pedidos: Pedido[]): KPIsPorTipo {
  const grupos: Record<string, Pedido[]> = {};

  pedidos.forEach((p) => {
    const tipo = p.tipo || 'indefinido';
    if (!grupos[tipo]) grupos[tipo] = [];
    grupos[tipo].push(p);
  });

  const kpis: KPIsPorTipo = {};
  Object.keys(grupos).forEach((tipo) => {
    kpis[tipo] = calcularKPIs(grupos[tipo]);
  });

  return kpis;
}

export function agruparPorFormaPagamento(pedidos: Pedido[]): KPIsPorTipo {
  const grupos: Record<string, Pedido[]> = {};

  pedidos.forEach((p) => {
    const forma = p.forma_pagamento || 'indefinido';
    if (!grupos[forma]) grupos[forma] = [];
    grupos[forma].push(p);
  });

  const kpis: KPIsPorTipo = {};
  Object.keys(grupos).forEach((forma) => {
    kpis[forma] = calcularKPIs(grupos[forma]);
  });

  return kpis;
}

export function analisarProdutos(
  pedidos: Pedido[],
  itensMap: Record<string, ItemPedido[]>
): ProdutoAnalise[] {
  const produtoMap: Record<string, ProdutoAnalise> = {};

  pedidos.forEach((p) => {
    const itens = itensMap[p.id] || [];
    itens.forEach((item) => {
      const key = item.produto_nome;
      if (!produtoMap[key]) {
        produtoMap[key] = {
          nome: item.produto_nome,
          quantidade: 0,
          custo: 0,
          venda: 0,
          lucro: 0,
          margem: 0,
        };
      }
      produtoMap[key].quantidade += item.quantidade;
      produtoMap[key].custo += item.quantidade * item.custo_unitario;
      produtoMap[key].venda += item.quantidade * (item.preco_unitario + item.adicional_preco);
      produtoMap[key].lucro = produtoMap[key].venda - produtoMap[key].custo;
      produtoMap[key].margem = produtoMap[key].venda > 0
        ? (produtoMap[key].lucro / produtoMap[key].venda) * 100
        : 0;
    });
  });

  return Object.values(produtoMap).sort((a, b) => b.lucro - a.lucro);
}

export function calcularEstatisticasMargem(kpis: KPIs) {
  const margens = kpis.margensIndividuais;
  if (margens.length === 0) {
    return { minima: 0, maxima: 0, media: 0, mediana: 0 };
  }

  const sorted = [...margens].sort((a, b) => a - b);
  const minima = sorted[0];
  const maxima = sorted[sorted.length - 1];
  const media = margens.reduce((s, m) => s + m, 0) / margens.length;
  const mediana = sorted[Math.floor(sorted.length / 2)];

  return { minima, maxima, media, mediana };
}
