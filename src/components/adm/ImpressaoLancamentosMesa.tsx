import { useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';
import { agruparLancamentosMesa } from '../../lib/lancamentosMesa';
import { printMesaComanda, type ModoImpressaoMesa } from '../../lib/print';
import { impressoraConectada } from '../../lib/bluetoothPrinter';
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
  const [aviso, setAviso] = useState('');
  const [modo, setModo] = useState<ModoImpressaoMesa>('auto');
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [repetir, setRepetir] = useState<{ mesa: MesaImpressao; id: string; itens: ItemMesa[] } | null>(null);
  const trava = useRef(false);

  const imprimir = async (mesa: MesaImpressao, id: string, itens: ItemMesa[], escolha = modo) => {
    if (!config || trava.current) return;
    trava.current = true;
    setImprimindo(id);
    setFeedbackId(id);
    setErro('');
    setAviso('');
    setRepetir(null);
    try {
      // Os itens já estão carregados: o clique chega diretamente à impressão
      // do navegador sem uma consulta assíncrona que possa bloquear o diálogo.
      const destino = escolha === 'auto' ? (impressoraConectada() ? 'bluetooth' : 'navegador') : escolha;
      const via = await printMesaComanda(mesa.numero, itens, config, destino);
      setAviso(via === 'bluetooth' ? 'Dados enviados à impressora Bluetooth. Confira a saída do papel.' : 'Impressão solicitada ao navegador. Selecione a impressora e confirme no diálogo.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível solicitar a impressão. Confira a impressora e tente novamente.');
      setRepetir({ mesa, id, itens });
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
      <label className="flex flex-wrap gap-2 items-center text-sm">Como imprimir
        <select value={modo} onChange={(e) => setModo(e.target.value as ModoImpressaoMesa)} className="border rounded-lg px-3 py-2 bg-white">
          <option value="auto">Automático</option>
          <option value="navegador">Navegador (USB / impressora do computador)</option>
          <option value="bluetooth">Bluetooth conectado neste aparelho</option>
        </select>
      </label>
      {!config && <p role="alert" className="text-sm text-amber-700">Aguarde o carregamento das configurações da impressão.</p>}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      {aviso && <p role="status" className="text-sm text-neutral-700">{aviso}</p>}
      {repetir && <button disabled={imprimindo !== null} onClick={() => { void imprimir(repetir.mesa, repetir.id, repetir.itens, 'navegador'); }} className="border border-red-200 text-[#B91C1C] rounded-lg px-3 py-2 text-sm">Abrir impressão do navegador</button>}
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
              {feedbackId === grupo.id && erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
              {feedbackId === grupo.id && aviso && <p role="status" className="text-sm text-neutral-700">{aviso}</p>}
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
