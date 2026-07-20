import { useState } from 'react';
import { Lock, AlertTriangle, ShieldCheck } from 'lucide-react';

interface SenhaAdminModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  senhaEsperada: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function SenhaAdminModal({
  title,
  description,
  confirmLabel = 'Confirmar',
  senhaEsperada,
  onConfirm,
  onCancel,
  danger = false,
}: SenhaAdminModalProps) {
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    if (senha === senhaEsperada) {
      onConfirm();
    } else {
      setError('Senha incorreta. Ação negada.');
    }
  };

  const iconBg = danger ? 'bg-red-500/20' : 'bg-[#E50914]/20';
  const iconColor = danger ? 'text-red-400' : 'text-[#E50914]';
  const Icon = danger ? AlertTriangle : ShieldCheck;
  const btnBg = danger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-[#E50914] hover:bg-[#f6121d] text-white';

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon size={24} className={iconColor} />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">{title}</h3>
            <p className="text-neutral-400 text-sm">{description}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-neutral-400 text-sm flex items-center gap-1.5 mb-1.5">
            <Lock size={14} /> Senha do Administrador
          </label>
          <input
            type="password"
            value={senha}
            onChange={(e) => { setSenha(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            placeholder="Digite a senha para autorizar"
            className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white focus:border-[#E50914] focus:outline-none"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 text-neutral-300 rounded-xl font-medium">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!senha}
            className={`flex-1 py-3 rounded-xl font-bold disabled:opacity-50 ${btnBg}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
