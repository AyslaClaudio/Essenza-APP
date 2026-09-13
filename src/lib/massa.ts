import type { MassaTipo } from '../types';

// Produto mínimo necessário pra classificar consumo de massa — aceita tanto
// o tipo `Produto` completo quanto a projeção enxuta (id, categoria_nome, nome)
// usada no hook de contagem, sem precisar buscar a linha inteira do produto.
export interface ProdutoMassaInfo {
  categoria_nome: string;
  nome: string;
}

// Descobre que tipo de massa um produto consome e quantas unidades por item
// vendido. Usa a mesma lógica de categoria já usada no Balcão/Mesas pra
// identificar pizza ("Pizzas P 25cm"/"Pizzas G 35cm") e esfirra ("Esfirras" e
// "Combos Esfirra" — o nome da categoria de combo também contém "Esfirra").
// Combo Duo leva 2 massas de esfirra (2 esfirras); os demais (pizza, esfirra
// avulsa, Combo Solo) levam 1 por unidade vendida.
export function massaDoProduto(produto: ProdutoMassaInfo | null | undefined): { tipo: MassaTipo; unidades: number } | null {
  if (!produto) return null;
  const cat = produto.categoria_nome || '';
  if (cat.includes('Pizza')) return { tipo: 'pizza', unidades: 1 };
  if (cat.includes('Esfirra')) {
    const isDuo = cat.includes('Combo') && produto.nome.toLowerCase().includes('duo');
    return { tipo: 'esfiha', unidades: isDuo ? 2 : 1 };
  }
  return null;
}

// Quantas massas (pizza/esfiha) um item de carrinho/pedido consome, já
// multiplicado pela quantidade vendida daquele item.
export function consumoMassa(produto: ProdutoMassaInfo | null | undefined, quantidade: number): { pizza: number; esfiha: number } {
  const info = massaDoProduto(produto);
  if (!info) return { pizza: 0, esfiha: 0 };
  const total = info.unidades * (quantidade || 0);
  return info.tipo === 'pizza' ? { pizza: total, esfiha: 0 } : { pizza: 0, esfiha: total };
}
