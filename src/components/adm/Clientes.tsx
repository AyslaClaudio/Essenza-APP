import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import { Search, Phone, MapPin, Users } from 'lucide-react';

/**
 * Painel de Clientes — não existia nenhuma tela pra isso no app. Agrega os
 * pedidos por NOME (normalizado: sem acento/espaço/maiúscula), já que no
 * Balcão o nome é o dado obrigatório e o telefone é opcional. Pedidos sem
 * nome ou marcados como "Consumidor" ficam de fora (não é cliente
 * identificável). Nada de tabela nova: tudo já está em `pedidos`.
 */
const normalizaNome = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

interface ClienteStats {
  chave: string;
  nome: string;
  telefone: string;
  bairro: string;
  pedidos: number;
  totalGasto: number;
  ticketMedio: number;
  ultimaCompra: string;
  diasSemComprar: number;
}

type Filtro = 'todos' | 'recorrentes' | 'novos' | 'sumidos';

const DIAS_SUMIDO = 21;
const META_FIDELIDADE = 10;

export function Clientes() {
  const { config } = useConfig();
  const [stats, setStats] = useState<ClienteStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('pedidos')
      .select('cliente_nome, cliente_telefone, cliente_bairro, total, created_at, status')
      .neq('status', 'cancelado')
      .order('created_at', { ascending: true });

    const pedidos = (data as any[]) || [];
    const map = new Map<string, ClienteStats>();

    for (const p of pedidos) {
      const nome = (p.cliente_nome || '').trim();
      const chave = normalizaNome(nome);
      // Sem nome ou "Consumidor" (rótulo genérico do balcão) não é cliente identificável.
      if (!chave || chave === 'consumidor') continue;
      const telefone = (p.cliente_telefone || '').trim();
      const total = Number(p.total) || 0;
      const existing = map.get(chave);
      if (existing) {
        existing.pedidos += 1;
        existing.totalGasto += total;
        existing.ultimaCompra = p.created_at;
        if (p.cliente_bairro) existing.bairro = p.cliente_bairro;
        if (telefone) existing.telefone = telefone;
        if (nome) existing.nome = nome;
      } else {
        map.set(chave, {
          chave,
          nome: nome || 'Cliente',
          telefone,
          bairro: p.cliente_bairro || '',
          pedidos: 1,
          totalGasto: total,
          ticketMedio: total,
          ultimaCompra: p.created_at,
          diasSemComprar: 0,
        });
      }
    }

    const hoje = Date.now();
    const lista = [...map.values()]
      .map((c) => ({
        ...c,
        ticketMedio: c.totalGasto / c.pedidos,
        diasSemComprar: Math.floor((hoje - new Date(c.ultimaCompra).getTime()) / 86400000),
      }))
      .sort((a, b) => b.totalGasto - a.totalGasto);

    setStats(lista);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtrados = stats.filter((c) => {
    const b = busca.trim().toLowerCase();
    const matchBusca = !b || c.nome.toLowerCase().includes(b) || c.telefone.includes(b);
    if (!matchBusca) return false;
    if (filtro === 'recorrentes') return c.pedidos > 1;
    if (filtro === 'novos') return c.pedidos === 1;
    if (filtro === 'sumidos') return c.diasSemComprar >= DIAS_SUMIDO;
    return true;
  });

  const totalClientes = stats.length;
  const recorrentes = stats.filter((c) => c.pedidos > 1).length;
  const sumidos = stats.filter((c) => c.diasSemComprar >= DIAS_SUMIDO).length;
  const pedidosTotal = stats.reduce((s, c) => s + c.pedidos, 0);
  const ticketMedioGeral = pedidosTotal > 0 ? stats.reduce((s, c) => s + c.totalGasto, 0) / pedidosTotal : 0;

  const fidelidadeAtiva = !!config?.fidelidade_ativo;

  return (
    <div className="space-y-4 animate-fadeIn">
      <h2 className="text-2xl font-bold text-neutral-900">Clientes</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Clientes identificados" value={String(totalClientes)} />
        <StatCard label="Recorrentes" value={String(recorrentes)} color="text-[#22c55e]" />
        <StatCard label={`Sumidos (${DIAS_SUMIDO}+ dias)`} value={String(sumidos)} color="text-amber-600" />
        <StatCard label="Ticket médio por cliente" value={brl(ticketMedioGeral)} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full bg-neutral-100 border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-900 focus:border-[#B91C1C] focus:outline-none"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {([
            { id: 'todos', label: 'Todos' },
            { id: 'recorrentes', label: 'Recorrentes' },
            { id: 'novos', label: 'Novos (1 pedido)' },
            { id: 'sumidos', label: 'Sumidos' },
          ] as { id: Filtro; label: string }[]).map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${filtro === f.id ? 'bg-[#B91C1C] text-white' : 'bg-neutral-200 text-neutral-500'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-center py-8">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <Users size={32} className="mx-auto mb-2 opacity-40" />
          {stats.length === 0
            ? 'Nenhum cliente identificado ainda. Conforme o Balcão for registrando o nome dos clientes, esse painel vai preencher.'
            : 'Nenhum cliente encontrado com esse filtro.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((c) => (
            <div key={c.chave} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-neutral-900 font-semibold">{c.nome}</p>
                  {c.pedidos > 1 && (
                    <span className="text-[10px] font-bold uppercase bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">Recorrente</span>
                  )}
                  {c.pedidos === 1 && (
                    <span className="text-[10px] font-bold uppercase bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full">Novo</span>
                  )}
                  {c.diasSemComprar >= DIAS_SUMIDO && (
                    <span className="text-[10px] font-bold uppercase bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-full">Sumido há {c.diasSemComprar}d</span>
                  )}
                </div>
                <p className="text-neutral-500 text-xs flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1"><Phone size={12} /> {c.telefone || 'sem telefone'}</span>
                  {c.bairro && <span className="flex items-center gap-1"><MapPin size={12} /> {c.bairro}</span>}
                </p>
                {fidelidadeAtiva && (
                  <div className="mt-2 max-w-[220px]">
                    <div className="flex justify-between text-[10px] text-neutral-500 mb-0.5">
                      <span>Fidelidade (estimativa por nº de pedidos)</span>
                      <span>{c.pedidos % META_FIDELIDADE}/{META_FIDELIDADE}</span>
                    </div>
                    <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#F59E0B]" style={{ width: `${((c.pedidos % META_FIDELIDADE) / META_FIDELIDADE) * 100}%` }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-6 sm:text-right shrink-0">
                <div>
                  <p className="text-neutral-500 text-xs">Pedidos</p>
                  <p className="text-neutral-900 font-bold">{c.pedidos}</p>
                </div>
                <div>
                  <p className="text-neutral-500 text-xs">Total gasto</p>
                  <p className="text-[#22c55e] font-bold">{brl(c.totalGasto)}</p>
                </div>
                <div>
                  <p className="text-neutral-500 text-xs">Ticket médio</p>
                  <p className="text-neutral-900 font-bold">{brl(c.ticketMedio)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-4">
      <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-black text-xl ${color || 'text-neutral-900'}`}>{value}</p>
    </div>
  );
}
