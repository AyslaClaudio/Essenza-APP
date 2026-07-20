import { brl } from '../../../lib/format';

/**
 * Top 5 sabores/produtos mais vendidos no período (barras horizontais).
 * Recebe já agregado e ordenado: [{ nome, quantidade, valor }].
 * Barras horizontais desenhadas com CSS (leve, sem precisar de escala do Recharts).
 */
export interface SaborTop {
  nome: string;
  quantidade: number;
  valor: number;
}

export function GraficoTopSabores({ data }: { data: SaborTop[] }) {
  const max = Math.max(1, ...data.map((d) => d.quantidade));

  return (
    <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5">
      <h3 className="text-white font-bold mb-4">Top 5 Sabores</h3>
      {data.length === 0 ? (
        <p className="text-neutral-500 text-sm text-center py-12">Sem itens vendidos no período.</p>
      ) : (
        <div className="space-y-3">
          {data.map((s, i) => (
            <div key={s.nome} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-200 truncate flex items-center gap-2">
                  <span className="text-neutral-600 font-bold w-4">{i + 1}</span>
                  {s.nome}
                </span>
                <span className="text-neutral-400 whitespace-nowrap ml-2">
                  {s.quantidade}x <span className="text-[#FFD700]">{brl(s.valor)}</span>
                </span>
              </div>
              <div className="h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#E50914] to-[#FFD700] transition-all duration-700"
                  style={{ width: `${(s.quantidade / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
