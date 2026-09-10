import { Area, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { brl } from '../../../lib/format';

/**
 * Tendência do período — Faturamento (área vermelha) vs Despesas (área
 * cinza): custo dos produtos vendidos + custos operacionais / saídas de
 * caixa lançados no período. Bucket por dia (período curto) ou mês (longo).
 */
export interface BucketTendencia {
  label: string;
  faturamento: number;
  despesas: number;
}

function TooltipCustom({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as BucketTendencia;
  const lucro = p.faturamento - p.despesas;
  return (
    <div className="bg-white border border-[#EFE9E0] rounded-lg px-3 py-2 text-xs shadow-[0_4px_16px_rgba(38,33,30,0.1)]">
      <p className="text-[#8A8A8A] mb-0.5">{label}</p>
      <p className="text-[#DC2626] font-semibold">Faturamento {brl(p.faturamento)}</p>
      <p className="text-[#8A8A8A] font-semibold">Despesas {brl(p.despesas)}</p>
      <p className={`font-semibold ${lucro >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>Resultado {brl(lucro)}</p>
    </div>
  );
}

export function GraficoTendencia({ data }: { data: BucketTendencia[] }) {
  const semDados = data.length === 0 || data.every((d) => d.faturamento === 0 && d.despesas === 0);

  return (
    <div className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)] h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#26211E] font-semibold">Faturamento × Despesas</h3>
        <div className="flex items-center gap-3 text-xs text-[#8A8A8A]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" /> Faturamento</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#9A948C]" /> Despesas</span>
        </div>
      </div>
      {semDados ? (
        <p className="text-[#8A8A8A] text-sm text-center py-16">Sem movimento registrado no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
            <defs>
              <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#DC2626" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="despGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9A948C" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#9A948C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFE9E0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#8A8A8A', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#c4c0b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
            <Tooltip content={<TooltipCustom />} cursor={{ stroke: '#EFE9E0' }} />
            <Area type="monotone" dataKey="despesas" stroke="#9A948C" strokeWidth={2} fill="url(#despGrad)" />
            <Area type="monotone" dataKey="faturamento" stroke="#DC2626" strokeWidth={2} fill="url(#fatGrad)" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
