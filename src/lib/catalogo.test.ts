import { describe, expect, it } from 'vitest';
import { podeMeioAMeio, saboresPizza, ehSalvaBordas } from './catalogo';
import { consumoMassa } from './massa';
import type { Produto } from '../types';

const produto = (categoria_nome: string, tamanho = '', nome = 'Mussarela') => ({ categoria_nome, tamanho, nome } as Produto);
describe('regras do cardápio oficial', () => {
  it('permite apenas pizzas G no meio a meio e cruza linhas do mesmo tamanho', () => {
    const grande = produto('Pizzas artesanais', 'G');
    const essenza = produto('Pizzas Linha Essenza', 'G', 'Pepperoni Essenza');
    const pequena = produto('Pizzas artesanais', 'P');
    const esfiha = produto('Esfirras salgadas');
    expect(podeMeioAMeio(grande)).toBe(true);
    expect(podeMeioAMeio(pequena)).toBe(false);
    expect(podeMeioAMeio(esfiha)).toBe(false);
    expect(saboresPizza([grande, essenza, pequena, esfiha], grande)).toEqual([grande, essenza]);
  });
  it('conta a massa dos combos na categoria separada e não consome massa no Salva Bordas', () => {
    expect(consumoMassa(produto('Combos', '', 'Combo Duo'), 2)).toEqual({ pizza: 0, esfiha: 4 });
    expect(consumoMassa(produto('Combos', '', 'Combo Solo'), 3)).toEqual({ pizza: 0, esfiha: 3 });
    const salva = produto('Adicionais', '100ml', 'Salva Bordas 100ml');
    expect(ehSalvaBordas(salva)).toBe(true);
    expect(consumoMassa(salva, 2)).toEqual({ pizza: 0, esfiha: 0 });
  });
});
