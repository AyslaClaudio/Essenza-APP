import { useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';
import { agruparLancamentosMesa } from '../../lib/lancamentosMesa';
import { printMesaComanda } from '../../lib/print';
import type { ItemMesa } from '../../types';

export interface MesaImpressao {
  id: string;
  numero: number;
  garcom: string;
  itens_mesa: ItemMesa[];
}

export function ImpressaoLancamentosMesa({ mesas }: { mesas: MesaImpressao[] }) {
  const { config } = useConfig();
  const [imprimindo, setImprimindo] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const trava = useRef(false);

  const imprimir = async (mesa: MesaImpressao, id: string, itens: ItemMesa[]) => {
    if (!config || trava.current) return;
    trava.current = true;
    setImprimindo(id);
    setErro('');
    try {
      // Os itens já estão carregados: o clique chega diretamente à impressão
      // do navegador sem uma consulta assíncrona que possa bloquear o diálogo.
      await printMesaComanda(mesa.numero, itens, config);
    } catch {
      setErro('Não foi possível solicitar a impressão. Confira a impressora e tente novamente.');
    } finally {
      trava.current = false;
      setImprimindo(null);
    }
  };

  const ocupadas = mesas.filter((mesa) => mesa.itens_mesa.length > 0);
  return (
    <section className="bg-white border border-[#EFE9E0] rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-sm flex items-center gap-2"><Printer size={18} className="text-[#B91C1C]" />Imprimir lançamentos das mesas</h3>
      <p className="text-xs text-neutral-500">Abra a mesa, confira os itens e imprima somente o lançamento escolhido. Disponível enquanto a conta estiver aberta.</p>
      {!config && <p role="alert" className="text-sm text-amber-700">Aguarde o carregamento das configurações da impressão.</p>}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      {!ocupadas.length && <p className="text-sm text-neutral-500">Nenhuma mesa com itens lançados.</p>}
      {ocupadas.map((mesa) => {
        const grupos = agruparLancamentosMesa(mesa.itens_mesa);
        return <details key={mesa.id} className="border border-neutral-200 rounded-xl p-3">
          <summary className="cursor-pointer font-semibold text-sm">Mesa {mesa.numero} · {grupos.length} lançamento(s){mesa.garcom ? ` · ${mesa.garcom}` : ''} — Ver lançamentos</summary>
          <div className="space-y-3 mt-3">
            {grupos.map((grupo, indice) => <div key={grupo.id} className="bg-neutral-50 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <p className="text-sm font-semibold">Lançamento {grupos.length - indice} · {new Date(grupo.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                <button onClick={() => { void imprimir(mesa, grupo.id, grupo.itens); }} disabled={!config || imprimindo !== null} className="flex items-center gap-2 bg-[#B91C1C] text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"><Printer size={15} />{imprimindo === grupo.id ? 'Enviando...' : 'Imprimir lançamento'}</button>
              </div>
              <ul className="space-y-1 text-sm">
                {grupo.itens.map((item) => <li key={item.id}>
                  <p>{item.quantidade}x {item.produto_nome}</p>
                  {(item.sabor1 || item.sabor2) && <p className="text-xs text-neutral-600">Sabores: {[item.sabor1, item.sabor2].filter(Boolean).join(' / ')}</p>}
                  {item.adicional && <p className="text-xs text-neutral-600">Adicional: {item.adicional}</p>}
                  {item.observacao && <p className="text-xs text-amber-700">Obs.: {item.observacao}</p>}
                </li>)}
              </ul>
            </div>)}
          </div>
        </details>;
      })}
    </section>
  );
}
