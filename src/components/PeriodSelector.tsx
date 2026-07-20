import { useState } from 'react';
import { Calendar } from 'lucide-react';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  dateToISO,
  formatDateRange,
} from '../lib/dateUtils';

interface PeriodSelectorProps {
  onPeriodChange: (periodo: { dataInicio: Date; dataFim: Date }) => void;
  defaultPeriod?: 'dia' | 'semana' | 'mes' | 'custom';
}

type PeriodType = 'dia' | 'semana' | '7dias' | '30dias' | 'mes' | 'custom';

export function PeriodSelector({ onPeriodChange, defaultPeriod = 'mes' }: PeriodSelectorProps) {
  const now = new Date();

  const periodos: Record<Exclude<PeriodType, 'custom'>, { label: string; getData: () => [Date, Date] }> = {
    dia: {
      label: 'Hoje',
      getData: () => [startOfDay(now), endOfDay(now)],
    },
    semana: {
      label: 'Esta Semana',
      getData: () => [startOfWeek(now), endOfWeek(now)],
    },
    '7dias': {
      label: 'Últimos 7 Dias',
      getData: () => [addDays(now, -7), endOfDay(now)],
    },
    '30dias': {
      label: 'Últimos 30 Dias',
      getData: () => [addDays(now, -30), endOfDay(now)],
    },
    mes: {
      label: 'Este Mês',
      getData: () => [startOfMonth(now), endOfMonth(now)],
    },
  };

  const [activePeriod, setActivePeriod] = useState<PeriodType>(defaultPeriod as PeriodType || 'mes');
  const [dataInicio, setDataInicio] = useState(dateToISO(startOfMonth(now)));
  const [dataFim, setDataFim] = useState(dateToISO(endOfMonth(now)));
  const [showCustom, setShowCustom] = useState(defaultPeriod === 'custom');

  const handlePeriodClick = (period: Exclude<PeriodType, 'custom'>) => {
    setActivePeriod(period);
    const [inicio, fim] = periodos[period].getData();
    onPeriodChange({ dataInicio: inicio, dataFim: fim });
    setShowCustom(false);
  };

  const handleCustomChange = () => {
    const inicio = new Date(`${dataInicio}T00:00:00`);
    const fim = new Date(`${dataFim}T23:59:59`);
    onPeriodChange({ dataInicio: inicio, dataFim: fim });
  };

  const handleCustomToggle = () => {
    setShowCustom(!showCustom);
    if (!showCustom) {
      setActivePeriod('custom');
    }
  };

  const [inicio, fim] = activePeriod === 'custom'
    ? [new Date(`${dataInicio}T00:00:00`), new Date(`${dataFim}T23:59:59`)]
    : periodos[activePeriod].getData();
  const displayRange = formatDateRange(inicio, fim);

  return (
    <div className="space-y-3">
      {/* Quick select buttons */}
      <div className="flex gap-2 overflow-x-auto pb-2 flex-wrap">
        {(['dia', 'semana', '7dias', '30dias', 'mes'] as const).map((period) => (
          <button
            key={period}
            onClick={() => handlePeriodClick(period)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activePeriod === period
                ? 'bg-[#E50914] text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            {periodos[period].label}
          </button>
        ))}
        <button
          onClick={handleCustomToggle}
          className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
            activePeriod === 'custom'
              ? 'bg-[#E50914] text-white'
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          }`}
        >
          <Calendar size={16} /> Customizado
        </button>
      </div>

      {/* Display current range */}
      <div className="text-neutral-400 text-sm">
        Período: <span className="text-white font-medium">{displayRange}</span>
      </div>

      {/* Custom date picker */}
      {showCustom && (
        <div className="bg-neutral-900/50 border border-essenza-dark-border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-neutral-400 text-xs uppercase block mb-2">Data Inicial</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full bg-neutral-900 border border-essenza-dark-border rounded-lg px-3 py-2 text-white focus:border-[#E50914] focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="text-neutral-400 text-xs uppercase block mb-2">Data Final</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full bg-neutral-900 border border-essenza-dark-border rounded-lg px-3 py-2 text-white focus:border-[#E50914] focus:outline-none text-sm"
              />
            </div>
          </div>
          <button
            onClick={handleCustomChange}
            className="w-full bg-[#E50914] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#f6121d] active:scale-95"
          >
            Aplicar Período
          </button>
        </div>
      )}
    </div>
  );
}
