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

// ===== Fonte única de Faturamento / Custo dos Produtos / Lucro Bruto =====
// Qualquer tela que precise desses 3 números deve chamar esta função — não
// reimplementar o reduce à mão. Foi exatamente essa duplicação (Dashboard,
// Fechamento do Dia e Relatórios cada um somando pedidos por conta própria)
// que causou divergência de valores entre telas.
export interface FinanceiroBase {
  faturamento: number;
  custoTotal: number;
  lucroTotal: number;
}

export function calcularFinanceiroBase(
  pedidos: { total: number | string; custo_total: number | string; lucro: number | string }[]
): FinanceiroBase {
  return {
    faturamento: pedidos.reduce((s, p) => s + Number(p.total), 0),
    custoTotal: pedidos.reduce((s, p) => s + Number(p.custo_total), 0),
    lucroTotal: pedidos.reduce((s, p) => s + Number(p.lucro), 0),
  };
}

// Faturamento não é uma coisa só: pedido de delivery embute taxa de entrega
// (serviço de levar) junto com a venda do produto (pizza/esfirra) em cima do
// mesmo `total`. Pra saber "quanto vendemos de comida" x "quanto entrou de
// taxa de entrega" sem misturar os dois, soma-se `subtotal` (venda de
// produto, existe em pedido de qualquer tipo) separado de `taxa_entrega` (só
// > 0 em delivery). subtotal + taxa_entrega = total = Faturamento.
export interface ReceitaPorOrigem {
  vendaProdutos: number;
  taxaEntrega: number;
}

export function calcularReceitaPorOrigem(
  pedidos: { subtotal: number | string; taxa_entrega: number | string }[]
): ReceitaPorOrigem {
  return {
    vendaProdutos: pedidos.reduce((s, p) => s + Number(p.subtotal || 0), 0),
    taxaEntrega: pedidos.reduce((s, p) => s + Number(p.taxa_entrega || 0), 0),
  };
}

// Margem sobre o faturamento — fonte única (Dashboard e GraficoRosca tinham
// cada um sua própria fórmula, uma delas dividindo por custo+lucro em vez de
// faturamento).
export function calcularMargem(lucro: number, faturamento: number): number {
  return faturamento > 0 ? (lucro / faturamento) * 100 : 0;
}

// Despesa operacional real do período = soma dos lançamentos de "Custos
// Operacionais" (tabela `caixa`, tipo='saida') já filtrados pelo período pelo
// chamador. Fonte única — Fechamento do Dia e Relatórios usavam antes um
// valor fixo configurado manualmente, que nunca refletia o que era realmente
// lançado em Custos Operacionais.
export function calcularDespesaOperacional(saidasCaixa: { valor: number | string }[]): number {
  return saidasCaixa.reduce((s, e) => s + Number(e.valor), 0);
}

export function calcularKPIs(pedidos: Pedido[]): KPIs {
  const { faturamento, custoTotal, lucroTotal } = calcularFinanceiroBase(pedidos);
  const pedidosCount = pedidos.length;
  const ticketMedio = pedidosCount > 0 ? faturamento / pedidosCount : 0;
  const margemMedia = calcularMargem(lucroTotal, faturamento);

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

// ===== Lucro líquido e ponto de equilíbrio =====
// Lucro Líquido = Lucro Bruto do período − despesa operacional REAL do mesmo
// período (soma de calcularDespesaOperacional). Antes descontava um valor
// fixo configurado à mão em Configurações, que não tinha nenhuma relação com
// o que era de fato lançado em "Custos Operacionais" — a própria tela de
// Custos Operacionais já dizia ao usuário que esses lançamentos afetavam o
// Lucro Líquido dos Relatórios, o que não era verdade. Ver [[mesas-modulo]]
// sobre o histórico de bugs de inconsistência financeira deste app.

export function calcularLucroLiquido(lucroBruto: number, despesaOperacional: number): number {
  return lucroBruto - despesaOperacional;
}

// Faturamento diário necessário só para cobrir a despesa operacional média
// diária, dada a margem média do período — abaixo disso o dia fecha no
// vermelho mesmo vendendo.
export function calcularPontoEquilibrio(despesaOperacionalDiaria: number, margemMediaPct: number): number {
  if (margemMediaPct <= 0) return 0;
  return despesaOperacionalDiaria / (margemMediaPct / 100);
}

export function calcularDescontoTotal(pedidos: Pedido[]): number {
  return pedidos.reduce((s, p) => s + Number(p.desconto || 0), 0);
}

// Projeta o faturamento do período inteiro com base no ritmo até agora — só
// faz sentido quando o período selecionado ainda está em andamento (inclui hoje).
export function calcularProjecao(faturamentoAteAgora: number, diasDecorridos: number, diasTotalPeriodo: number): number {
  if (diasDecorridos <= 0) return 0;
  return (faturamentoAteAgora / diasDecorridos) * diasTotalPeriodo;
}

// ===== Pedidos por horário do dia =====

export interface PorHora {
  hora: number;
  pedidos: number;
}

export function calcularPorHora(pedidos: Pedido[]): PorHora[] {
  const contagem = new Map<number, number>();
  pedidos.forEach((p) => {
    const hora = new Date(p.created_at).getHours();
    contagem.set(hora, (contagem.get(hora) || 0) + 1);
  });
  return Array.from({ length: 24 }, (_, hora) => ({ hora, pedidos: contagem.get(hora) || 0 }));
}

// ===== Faturamento/lucro por bairro (só pedidos de entrega) =====

export function agruparPorBairro(pedidos: Pedido[]): KPIsPorTipo {
  const grupos: Record<string, Pedido[]> = {};
  pedidos
    .filter((p) => p.tipo === 'delivery')
    .forEach((p) => {
      const bairro = p.cliente_bairro?.trim() || 'Não informado';
      if (!grupos[bairro]) grupos[bairro] = [];
      grupos[bairro].push(p);
    });

  const kpis: KPIsPorTipo = {};
  Object.keys(grupos).forEach((bairro) => {
    kpis[bairro] = calcularKPIs(grupos[bairro]);
  });
  return kpis;
}

// ===== Curva ABC — classifica produtos pela contribuição acumulada de lucro =====

export interface ProdutoABC extends ProdutoAnalise {
  classe: 'A' | 'B' | 'C';
  percentualAcumulado: number;
}

export function classificarCurvaABC(produtos: ProdutoAnalise[]): ProdutoABC[] {
  const porLucro = [...produtos].sort((a, b) => b.lucro - a.lucro);
  const totalLucro = porLucro.reduce((s, p) => s + Math.max(p.lucro, 0), 0);
  let acumulado = 0;
  return porLucro.map((p) => {
    acumulado += Math.max(p.lucro, 0);
    const percentualAcumulado = totalLucro > 0 ? (acumulado / totalLucro) * 100 : 0;
    const classe: 'A' | 'B' | 'C' = percentualAcumulado <= 80 ? 'A' : percentualAcumulado <= 95 ? 'B' : 'C';
    return { ...p, classe, percentualAcumulado };
  });
}

// ===== Margem agrupada por categoria de produto (não por item individual) =====

export interface CategoriaAnalise {
  categoria: string;
  quantidade: number;
  custo: number;
  venda: number;
  lucro: number;
  margem: number;
}

export function analisarPorCategoria(
  pedidos: Pedido[],
  itensMap: Record<string, ItemPedido[]>,
  produtoCategoriaMap: Record<string, string>
): CategoriaAnalise[] {
  const mapa: Record<string, CategoriaAnalise> = {};

  pedidos.forEach((p) => {
    (itensMap[p.id] || []).forEach((item) => {
      const categoria = (item.produto_id && produtoCategoriaMap[item.produto_id]) || 'Outros';
      if (!mapa[categoria]) mapa[categoria] = { categoria, quantidade: 0, custo: 0, venda: 0, lucro: 0, margem: 0 };
      mapa[categoria].quantidade += item.quantidade;
      mapa[categoria].custo += item.quantidade * item.custo_unitario;
      mapa[categoria].venda += item.quantidade * (item.preco_unitario + item.adicional_preco);
    });
  });

  return Object.values(mapa)
    .map((c) => ({ ...c, lucro: c.venda - c.custo, margem: c.venda > 0 ? ((c.venda - c.custo) / c.venda) * 100 : 0 }))
    .sort((a, b) => b.lucro - a.lucro);
}

// ===== Novos x recorrentes dentro de um período =====
// "Novo" = a primeira compra dessa pessoa (em todo o histórico, não só no
// período) caiu dentro do período selecionado. Exige o mapa de primeira
// compra por telefone calculado sobre o histórico completo (ver Financeiro).

export interface NovosRecorrentes {
  novos: number;
  recorrentes: number;
  faturamentoNovos: number;
  faturamentoRecorrentes: number;
}

export function calcularNovosRecorrentes(
  pedidosPeriodo: Pedido[],
  primeiraCompraPorTelefone: Record<string, string>,
  periodoInicioISO: string,
  periodoFimISO: string
): NovosRecorrentes {
  const porTelefone = new Map<string, { novo: boolean; faturamento: number }>();

  pedidosPeriodo.forEach((p) => {
    const tel = p.cliente_telefone?.trim();
    if (!tel) return;
    const primeira = primeiraCompraPorTelefone[tel];
    const ehNovo = !!primeira && primeira >= periodoInicioISO && primeira <= periodoFimISO;
    const entry = porTelefone.get(tel) || { novo: ehNovo, faturamento: 0 };
    entry.faturamento += Number(p.total);
    porTelefone.set(tel, entry);
  });

  let novos = 0, recorrentes = 0, faturamentoNovos = 0, faturamentoRecorrentes = 0;
  porTelefone.forEach((v) => {
    if (v.novo) { novos++; faturamentoNovos += v.faturamento; }
    else { recorrentes++; faturamentoRecorrentes += v.faturamento; }
  });

  return { novos, recorrentes, faturamentoNovos, faturamentoRecorrentes };
}
