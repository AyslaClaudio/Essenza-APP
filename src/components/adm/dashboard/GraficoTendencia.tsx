import { Area, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { brl } from '../../../lib/format';

/**
 * Tendência do período — duas séries: Faturamento (área laranja) e Pedidos
 * (linha verde), inspirado no "Revenue & Orders Trend" da referência.
 * Recebe já agregado por bucket (dia ou mês, dependendo do tamanho do período).
 */
export interface BucketTendencia {
  label: string;
  faturamento: number;
  pedidos: number;
}

function TooltipCustom({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as BucketTendencia;
  return (
    <div className="bg-white border border-[#EFE9E0] rounded-lg px-3 py-2 text-xs shadow-[0_4px_16px_rgba(38,33,30,0.1)]">
      <p className="text-[#8A8A8A] mb-0.5">{label}</p>
      <p className="text-[#F26522] font-semibold">{brl(p.faturamento)}</p>
      <p className="text-[#22C55E] font-semibold">{p.pedidos} pedido{p.pedidos === 1 ? '' : 's'}</p>
    </div>
  );
}

export function GraficoTendencia({ data }: { data: BucketTendencia[] }) {
  const semDados = data.length === 0 || data.every((d) => d.faturamento === 0 && d.pedidos === 0);

  return (
    <div className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)] h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#26211E] font-semibold">Tendência do período</h3>
        <div className="flex items-center gap-3 text-xs text-[#8A8A8A]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#F26522]" /> Faturamento</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" /> Pedidos</span>
        </div>
      </div>
      {semDados ? (
        <p className="text-[#8A8A8A] text-sm text-center py-16">Sem vendas registradas no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F26522" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFE9E0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#8A8A8A', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tick={{ fill: '#c4c0b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="r" orientation="right" tick={{ fill: '#c4c0b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<TooltipCustom />} cursor={{ stroke: '#EFE9E0' }} />
            <Area yAxisId="l" type="monotone" dataKey="faturamento" stroke="#F26522" strokeWidth={2} fill="url(#fatGrad)" />
            <Line yAxisId="r" type="monotone" dataKey="pedidos" stroke="#22C55E" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
