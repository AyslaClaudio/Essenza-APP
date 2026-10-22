import { SABORES_SALVA_BORDAS } from '../lib/catalogo';

export function SalvaBordasModal({ onConfirm, onClose }: { onConfirm: (sabor: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label="Sabor do Salva Bordas" className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg">Salva Bordas · 100 ml</h3>
        <p className="text-sm text-neutral-600">Escolha o sabor do copinho:</p>
        {SABORES_SALVA_BORDAS.map((sabor) => <button key={sabor} onClick={() => onConfirm(sabor)} className="w-full border border-red-200 rounded-xl p-3 text-[#B91C1C] font-semibold">{sabor}</button>)}
        <button onClick={onClose} className="w-full p-2 text-neutral-500">Cancelar</button>
      </div>
    </div>
  );
}
