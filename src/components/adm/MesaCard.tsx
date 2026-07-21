import { useEffect, useState } from 'react';
import { Clock, Users } from 'lucide-react';
import { brl } from '../../lib/format';
import type { Mesa } from '../../types';

/**
 * Card visual de uma mesa no grid.
 * Cor por status: Verde = Livre, Amarelo = Ocupada, Vermelho = Fechando.
 * Mostra número da mesa, tempo aberta e subtotal acumulado.
 */

// Estilos por status (borda, fundo, texto e "bolinha" de status)
const STATUS_STYLE: Record<Mesa['status'], { ring: string; dot: string; label: string; text: string }> = {
  livre:    { ring: 'border-green-600/40 hover:border-green-500',  dot: 'bg-green-500',  label: 'Livre',    text: 'text-green-500' },
  ocupada:  { ring: 'border-amber-500/50 hover:border-amber-400',  dot: 'bg-amber-500',  label: 'Ocupada',  text: 'text-amber-500' },
  fechando: { ring: 'border-red-600/60 hover:border-red-500',      dot: 'bg-red-500',    label: 'Fechando', text: 'text-red-500' },
};

// Calcula "há quanto tempo" a mesa está aberta, em formato curto (ex: "1h 12m", "8m")
function elapsedLabel(aberturaAt: string | null): string {
  if (!aberturaAt) return '--';
  const diffMs = Date.now() - new Date(aberturaAt).getTime();
  const totalMin = Math.max(0, Math.floor(diffMs / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function MesaCard({ mesa, onClick }: { mesa: Mesa; onClick: () => void }) {
  const style = STATUS_STYLE[mesa.status];

  // Subtotal acumulado dos itens já lançados na mesa
  const subtotal = (mesa.itens || []).reduce(
    (s, i) => s + i.quantidade * (i.preco_unitario + i.adicional_preco),
    0,
  );
  const qtdItens = (mesa.itens || []).reduce((s, i) => s + i.quantidade, 0);

  // Atualiza o "tempo aberto" a cada minuto sem precisar recarregar do banco
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (mesa.status === 'livre') return;
    const id = setInterval(() => forceTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, [mesa.status]);

  return (
    <button
      onClick={onClick}
      className={`bg-essenza-dark-card border-2 ${style.ring} rounded-2xl p-4 text-left transition-all active:scale-95 flex flex-col gap-3 min-h-[130px]`}
    >
      <div className="flex items-center justify-between">
        <span className="text-white font-black text-2xl leading-none">{mesa.numero}</span>
        <span className={`flex items-center gap-1.5 text-xs font-bold ${style.text}`}>
          <span className={`w-2 h-2 rounded-full ${style.dot} ${mesa.status !== 'livre' ? 'animate-pulse' : ''}`} />
          {style.label}
        </span>
      </div>

      {mesa.status === 'livre' ? (
        <span className="text-neutral-600 text-sm mt-auto">Toque para abrir</span>
      ) : (
        <div className="mt-auto space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-400 text-xs">
            <Clock size={12} /> {elapsedLabel(mesa.abertura_at)}
            <span className="text-neutral-600">•</span>
            <Users size={12} /> {qtdItens} {qtdItens === 1 ? 'item' : 'itens'}
          </div>
          <p className="text-[#22c55e] font-bold text-lg leading-none">{brl(subtotal)}</p>
        </div>
      )}
    </button>
  );
}
