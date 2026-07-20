import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { brl } from '../../../lib/format';

/**
 * Gráfico de rosca — Custo vs Lucro do período.
 * Usa os dados reais que o app já grava em cada pedido (custo_total e lucro),
 * a "Tabela v12" da operação. Verde = Lucro, Vermelho = Custo.
 */
export function GraficoRosca({ custo, lucro }: { custo: number; lucro: number }) {
  const data = [
    { nome: 'Lucro', valor: Math.max(0, lucro), cor: '#22c55e' },
    { nome: 'Custo', valor: Math.max(0, custo), cor: '#E50914' },
  ];
  const totalBruto = custo + lucro;
  const margem = totalBruto > 0 ? (lucro / totalBruto) * 100 : 0;
  const semDados = totalBruto === 0;

  return (
    <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-5">
      <h3 className="text-white font-bold mb-4">Custo vs Lucro</h3>
      {semDados ? (
        <p className="text-neutral-500 text-sm text-center py-12">Sem dados no período.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative" style={{ width: 150, height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="valor" nameKey="nome" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
                  {data.map((d, i) => <Cell key={i} fill={d.cor} />)}
                </Pie>
                <Tooltip
                  formatter={(v: any, n: any) => [brl(Number(v)), n]}
                  contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Margem no centro da rosca */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-white font-black text-xl leading-none">{margem.toFixed(0)}%</span>
              <span className="text-[10px] text-neutral-500">margem</span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-green-500" />
              <span className="text-neutral-400">Lucro:</span>
              <span className="text-white font-semibold">{brl(lucro)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-[#E50914]" />
              <span className="text-neutral-400">Custo:</span>
              <span className="text-white font-semibold">{brl(custo)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
