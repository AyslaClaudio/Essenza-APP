import { useEffect, useState } from 'react';
import { Wheat, Save, AlertTriangle, RefreshCw } from 'lucide-react';
import { useMassaHoje } from '../../../hooks/useMassaHoje';

// Quadro do Dashboard onde a atendente lança quantas massas de pizza e de
// esfirra foram preparadas hoje. O saldo (o que ainda resta pra vender) é
// calculado ao vivo — o mesmo hook alimenta o aviso mostrado no Balcão e no
// lançamento de itens da Mesa, então o número aqui é sempre o mesmo que
// aparece na hora de lançar o pedido.
export function ContagemMassas() {
  const {
    loading, pizzaInicial, esfihaInicial, pizzaConsumido, esfihaConsumido,
    pizzaRestante, esfihaRestante, salvarContagem,
  } = useMassaHoje();

  const [pizzaInput, setPizzaInput] = useState('');
  const [esfihaInput, setEsfihaInput] = useState('');
  const [salvando, setSalvando] = useState<'pizza' | 'esfiha' | null>(null);
  const [editandoPizza, setEditandoPizza] = useState(false);
  const [editandoEsfiha, setEditandoEsfiha] = useState(false);

  // Sincroniza os campos com o valor salvo, mas só enquanto o usuário não
  // estiver digitando — senão o polling/realtime apagaria o que ele está
  // escrevendo no meio da edição.
  useEffect(() => { if (!editandoPizza) setPizzaInput(String(pizzaInicial || '')); }, [pizzaInicial, editandoPizza]);
  useEffect(() => { if (!editandoEsfiha) setEsfihaInput(String(esfihaInicial || '')); }, [esfihaInicial, editandoEsfiha]);

  const salvar = async (tipo: 'pizza' | 'esfiha', valor: string) => {
    const n = Math.max(0, Math.round(Number(valor) || 0));
    setSalvando(tipo);
    try {
      await salvarContagem(tipo, n);
    } catch {
      alert('Erro ao salvar a contagem. Tente novamente.');
    } finally {
      setSalvando(null);
      if (tipo === 'pizza') setEditandoPizza(false); else setEditandoEsfiha(false);
    }
  };

  const Linha = ({
    label, valorInput, setValorInput, setEditando, inicial, consumido, restante, tipo,
  }: {
    label: string;
    valorInput: string;
    setValorInput: (v: string) => void;
    setEditando: (v: boolean) => void;
    inicial: number;
    consumido: number;
    restante: number;
    tipo: 'pizza' | 'esfiha';
  }) => {
    const pct = inicial > 0 ? Math.min(100, (consumido / inicial) * 100) : 0;
    const acabou = inicial > 0 && restante <= 0;
    const pouco = inicial > 0 && !acabou && restante <= Math.max(1, Math.round(inicial * 0.15));
    return (
      <div className="bg-[#FBF6EF] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[#26211E] font-semibold">{label}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={valorInput}
              onChange={(e) => { setEditando(true); setValorInput(e.target.value); }}
              onFocus={() => setEditando(true)}
              placeholder="Qtd hoje"
              className="w-24 bg-white border border-[#EFE9E0] rounded-lg px-3 py-1.5 text-sm text-[#26211E] focus:border-[#B91C1C] focus:outline-none"
            />
            <button
              onClick={() => salvar(tipo, valorInput)}
              disabled={salvando === tipo}
              className="flex items-center gap-1.5 bg-[#B91C1C] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#991B1B] disabled:opacity-50"
            >
              {salvando === tipo ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />} Salvar
            </button>
          </div>
        </div>

        {inicial > 0 && (
          <>
            <div className="h-2 bg-white rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: acabou ? '#EF4444' : pouco ? '#F59E0B' : '#22C55E' }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#8A8A8A]">Vendidas hoje: <b className="text-[#26211E]">{consumido}</b> de {inicial}</span>
              <span className={`font-bold ${acabou ? 'text-red-600' : pouco ? 'text-amber-600' : 'text-[#22C55E]'}`}>
                {acabou ? 'ACABOU' : `${restante} restantes`}
              </span>
            </div>
            {acabou && (
              <p className="flex items-center gap-1.5 text-red-600 text-xs font-medium">
                <AlertTriangle size={13} /> Sem massa de {label.toLowerCase()} disponível — o app avisa ao tentar lançar no Balcão/Mesa.
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-[#EFE9E0] rounded-2xl p-5 shadow-[0_2px_12px_rgba(38,33,30,0.04)]">
      <div className="flex items-center gap-2 mb-4">
        <Wheat size={16} className="text-[#B91C1C]" />
        <h3 className="text-[#26211E] font-semibold">Contagem de Massas de Hoje</h3>
        {loading && <RefreshCw size={13} className="animate-spin text-[#B91C1C]" />}
      </div>
      <p className="text-[#8A8A8A] text-xs mb-4">
        Lance aqui quanta massa de pizza e de esfirra foi preparada hoje. O saldo desconta automaticamente conforme os pedidos entram (Balcão, Mesa e Site).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Linha
          label="Massa de Pizza" tipo="pizza"
          valorInput={pizzaInput} setValorInput={setPizzaInput}
          setEditando={setEditandoPizza}
          inicial={pizzaInicial} consumido={pizzaConsumido} restante={pizzaRestante}
        />
        <Linha
          label="Massa de Esfirra" tipo="esfiha"
          valorInput={esfihaInput} setValorInput={setEsfihaInput}
          setEditando={setEditandoEsfiha}
          inicial={esfihaInicial} consumido={esfihaConsumido} restante={esfihaRestante}
        />
      </div>
    </div>
  );
}
