import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { brl } from '../../../lib/format';

/**
 * Gráfico de barras — Faturamento dos últimos 7 dias.
 * Recebe já agregado: [{ dia: 'Seg', label: '15/07', valor: 703.1 }, ...].
 * A barra de hoje (última) é destacada em vermelho ESSENZA.
 */
export interface BarraDia {
  dia: string;    // rótulo curto do dia da semana (Seg, Ter...)
  label: string;  // data dd/mm para o tooltip
  valor: number;
}

// Tooltip escuro customizado (o padrão do Recharts é claro)
function TooltipDark({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as BarraDia;
  return (
    <div className="bg-neutral-900 border border-essenza-dark-border rounded-lg px-3 py-2 text-xs">
      <p className="text-neutral-400">{p.label}</p>
      <p className="text-[#FFD700] font-bold">{brl(p.valor)}</p>
    </div>
  );
}

export function GraficoBarras({ data }: { data: BarraDia[] }) {
  const semDados = data.every((d) => d.valor === 0);

  return (
    <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5">
      <h3 className="text-white font-bold mb-4">Faturamento — últimos 7 dias</h3>
      {semDados ? (
        <p className="text-neutral-500 text-sm text-center py-12">Sem vendas registradas no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <XAxis dataKey="dia" tick={{ fill: '#a3a3a3', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} />
            <Tooltip content={<TooltipDark />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === data.length - 1 ? '#E50914' : '#FFD700'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
