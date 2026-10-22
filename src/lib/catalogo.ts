import type { Produto } from '../types';

export const ehPizza = (p: Produto) => /pizza/i.test(p.categoria_nome);
export const ehSalvaBordas = (p: Produto) => /salva\s*bordas/i.test(p.nome);
export const podeMeioAMeio = (p: Produto) => ehPizza(p) && p.tamanho === 'G';
export const saboresPizza = (produtos: Produto[], base: Produto) => produtos.filter((p) => ehPizza(p) && p.tamanho === base.tamanho);
export const SABORES_SALVA_BORDAS = ['Chocolate Cremoso', 'Doce de Leite'];
