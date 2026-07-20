import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { MesaCard } from './MesaCard';
import { MesaDetalhe } from './MesaDetalhe';
import { LayoutGrid, RefreshCw } from 'lucide-react';
import type { Mesa, ItemMesa, Produto } from '../../types';

/**
 * Módulo "Mesas" — atendimento do salão.
 * Mostra um grid de mesas coloridas por status (Livre/Ocupada/Fechando). Como o app
 * usa navegação por abas (sem router), o detalhe da mesa é renderizado no lugar do grid
 * ao selecionar um card, com botão de voltar.
 */
export function Mesas() {
  const { config } = useConfig();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Carrega as mesas junto com seus itens (para calcular subtotal/qtd no card)
  const loadMesas = useCallback(async () => {
    const { data } = await supabase
      .from('mesas')
      .select('*, itens_mesa(*)')
      .order('numero', { ascending: true });

    // O join vem como `itens_mesa`; normalizamos para `itens` do tipo Mesa
    const norm = (data || []).map((m: any) => ({ ...m, itens: (m.itens_mesa as ItemMesa[]) || [] }));
    setMesas(norm as Mesa[]);
    setLoading(false);
  }, []);

  // Carrega os produtos ativos uma vez (usado no modal "Adicionar Item")
  const loadProdutos = useCallback(async () => {
    const { data } = await supabase.from('produtos').select('*').eq('ativo', true).order('nome');
    setProdutos((data as Produto[]) || []);
  }, []);

  useEffect(() => {
    loadMesas();
    loadProdutos();
    // Atualiza o grid a cada 20s para refletir mudanças de outros atendentes
    const id = setInterval(loadMesas, 20000);
    return () => clearInterval(id);
  }, [loadMesas, loadProdutos]);

  const selectedMesa = mesas.find((m) => m.id === selectedId) || null;

  // Contadores por status para o resumo do topo
  const livres = mesas.filter((m) => m.status === 'livre').length;
  const ocupadas = mesas.filter((m) => m.status !== 'livre').length;

  // ----- Visão de detalhe -----
  if (selectedMesa) {
    return (
      <MesaDetalhe
        mesa={selectedMesa}
        produtos={produtos}
        config={config}
        onBack={() => setSelectedId(null)}
        onChanged={loadMesas}
      />
    );
  }

  // ----- Visão de grid -----
  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid size={24} className="text-[#E50914]" />
          <h2 className="text-2xl font-bold text-white">Mesas do Salão</h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-green-500 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500" /> {livres} livres
          </span>
          <span className="flex items-center gap-1.5 text-amber-500 font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> {ocupadas} em uso
          </span>
          <button
            onClick={loadMesas}
            className="p-2 rounded-lg border border-essenza-dark-border text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-neutral-500 flex items-center justify-center gap-2">
          <RefreshCw size={16} className="animate-spin" /> Carregando mesas...
        </div>
      ) : mesas.length === 0 ? (
        <div className="p-12 text-center text-neutral-500 bg-essenza-dark-card border border-essenza-dark-border rounded-2xl">
          Nenhuma mesa cadastrada. Rode a migration de mesas no banco para criar as mesas do salão.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {mesas.map((mesa) => (
            <MesaCard key={mesa.id} mesa={mesa} onClick={() => setSelectedId(mesa.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
