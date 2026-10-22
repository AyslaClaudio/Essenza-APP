import type { ItemMesa } from '../types';

export function agruparLancamentosMesa(itens: ItemMesa[]) {
  const grupos = new Map<string, { id: string; created_at: string; itens: ItemMesa[] }>();
  for (const item of itens) {
    // Inserts antigos usavam now() na mesma transação: o timestamp exato
    // permite recuperá-los sem misturar lançamentos separados por segundos.
    const chave = `${item.mesa_id}:${item.lancamento_id || item.created_at || item.id}`;
    const grupo = grupos.get(chave) || { id: chave, created_at: item.created_at, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
