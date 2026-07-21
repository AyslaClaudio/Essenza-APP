import { useEffect, useState } from 'react';
import { Trophy, Target } from 'lucide-react';
import { brl } from '../../../lib/format';

/**
 * Barra de progresso da meta do dia.
 * Anima o preenchimento ao montar e, se a meta for batida, dispara uma animação
 * de comemoração (pulso + troféu) uma vez.
 */
export function MetaProgresso({ faturamento, meta }: { faturamento: number; meta: number }) {
  const pctReal = meta > 0 ? (faturamento / meta) * 100 : 0;
  const bateu = pctReal >= 100;
  const pctVisual = Math.min(pctReal, 100);

  // Anima da largura 0 até o valor real
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pctVisual), 120);
    return () => clearTimeout(t);
  }, [pctVisual]);

  return (
    <div className={`bg-essenza-dark-card border rounded-2xl p-6 transition-colors ${bateu ? 'border-green-500/60' : 'border-essenza-dark-border'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-neutral-300 font-semibold flex items-center gap-2">
          {bateu ? <Trophy size={18} className="text-green-500" /> : <Target size={18} className="text-[#E50914]" />}
          Meta do Dia
        </span>
        <span className="text-white font-semibold text-sm">
          {brl(faturamento)} <span className="text-neutral-500">/ {brl(meta)}</span>
        </span>
      </div>

      <div className="h-5 bg-neutral-800 rounded-full overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${
            bateu ? 'bg-gradient-to-r from-green-500 to-green-400 animate-pulse' : 'bg-gradient-to-r from-green-700 to-green-500'
          }`}
          style={{ width: `${width}%` }}
        />
        {bateu && (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white drop-shadow">
            🎉 META BATIDA! 🎉
          </span>
        )}
      </div>

      <p className={`text-sm mt-2 ${bateu ? 'text-green-500 font-semibold' : 'text-neutral-500'}`}>
        {bateu
          ? `Parabéns! Superou a meta em ${brl(faturamento - meta)}.`
          : `Faltam ${brl(Math.max(0, meta - faturamento))} para bater a meta (${pctReal.toFixed(0)}%).`}
      </p>
    </div>
  );
}
