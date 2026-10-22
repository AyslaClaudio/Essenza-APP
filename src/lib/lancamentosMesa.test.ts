import { describe, expect, it } from 'vitest';
import { agruparLancamentosMesa } from './lancamentosMesa';
import type { ItemMesa } from '../types';

const item = (id: string, created_at: string, lancamento_id?: string, mesa_id = 'mesa-1') => ({ id, created_at, lancamento_id, mesa_id } as ItemMesa);
describe('comandas por lançamento', () => {
  it('mantém itens enviados juntos na mesma comanda e separa o envio seguinte', () => {
    const pizza = item('pizza', '2026-10-22T20:00:00Z', 'envio-1');
    const refri = item('refri', '2026-10-22T20:00:00.001Z', 'envio-1');
    const esfiha = item('esfiha', '2026-10-22T20:01:00Z', 'envio-2');
    const grupos = agruparLancamentosMesa([pizza, refri, esfiha]);
    expect(grupos.map((g) => g.itens.map((i) => i.id))).toEqual([['esfiha'], ['pizza', 'refri']]);
  });
  it('recupera lançamentos antigos pelo horário exato, sem misturar mesas', () => {
    const grupos = agruparLancamentosMesa([
      item('a', '2026-10-22T20:00:00Z'), item('b', '2026-10-22T20:00:00Z'),
      item('c', '2026-10-22T20:00:01Z'), item('d', '2026-10-22T20:00:00Z', undefined, 'mesa-2'),
    ]);
    expect(grupos).toHaveLength(3);
    expect(grupos.find((g) => g.itens.some((i) => i.id === 'a'))?.itens.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
