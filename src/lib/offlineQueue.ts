import { supabase } from './supabase';
import { logger } from './logger';

/**
 * Fila de pedidos offline.
 *
 * Objetivo honesto: o app depende de internet (Supabase é na nuvem), então
 * "rodar 100% offline" não é possível sem um backend local. O que ESTA fila
 * garante é o cenário mais comum de pizzaria — Wi-Fi instável/caiu por alguns
 * minutos: o atendente continua batendo pedidos no Balcão normalmente, cada
 * pedido fica salvo no navegador (localStorage) e, assim que a internet
 * voltar, tudo é enviado ao banco automaticamente, na ordem em que foi criado.
 *
 * Cada pedido na fila carrega: os dados do pedido, os itens do carrinho e a
 * entrada de caixa correspondente — o mesmo que o Balcão grava quando está
 * online, só que adiado.
 */

const STORAGE_KEY = 'essenza_offline_queue';

export interface OfflinePedidoPayload {
  localId: string; // id temporário só para exibição/impressão enquanto não sincroniza
  createdAt: string;
  pedidoData: Record<string, any>; // mesmo shape do insert em `pedidos` (sem numero — é gerado na sincronização)
  itens: Array<Record<string, any>>; // shape do insert em `itens_pedido` (sem pedido_id — preenchido na sincronização)
  caixaDescricaoPrefixo: string; // ex: "Pedido" — o número real entra depois
}

type Listener = (queue: OfflinePedidoPayload[]) => void;
const listeners = new Set<Listener>();

function readQueue(): OfflinePedidoPayload[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflinePedidoPayload[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  listeners.forEach((l) => l(queue));
}

export function subscribeOfflineQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue());
  return () => listeners.delete(listener);
}

export function getOfflineQueue(): OfflinePedidoPayload[] {
  return readQueue();
}

export function queueOfflinePedido(payload: Omit<OfflinePedidoPayload, 'localId' | 'createdAt'>): OfflinePedidoPayload {
  const entry: OfflinePedidoPayload = {
    ...payload,
    localId: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

let syncing = false;

/**
 * Envia os pedidos da fila para o Supabase, um de cada vez, na ordem em que
 * foram criados. Para no primeiro erro (provavelmente ainda offline) e tenta
 * de novo depois. Retorna quantos pedidos foram sincronizados com sucesso.
 */
export async function syncOfflineQueue(): Promise<number> {
  if (syncing) return 0;
  if (!navigator.onLine) return 0;

  const queue = readQueue();
  if (queue.length === 0) return 0;

  syncing = true;
  let synced = 0;

  try {
    for (const entry of queue) {
      try {
        const { data: numData, error: numErr } = await supabase.rpc('get_next_pedido_numero').maybeSingle();
        if (numErr) throw numErr;
        const numero = (numData as number) || Math.floor(Math.random() * 100000) + 1;

        const { data: pedido, error: pedErr } = await supabase
          .from('pedidos')
          .insert({ ...entry.pedidoData, numero, observacao: `${entry.pedidoData.observacao || ''} (sincronizado offline)`.trim() })
          .select()
          .maybeSingle();
        if (pedErr || !pedido) throw pedErr || new Error('Falha ao criar pedido sincronizado');

        const pedidoId = (pedido as any).id;

        if (entry.itens.length > 0) {
          const { error: itensErr } = await supabase
            .from('itens_pedido')
            .insert(entry.itens.map((i) => ({ ...i, pedido_id: pedidoId })));
          if (itensErr) throw itensErr;
        }

        await supabase.from('caixa').insert({
          tipo: 'entrada',
          descricao: `${entry.caixaDescricaoPrefixo} #${numero} - ${entry.pedidoData.cliente_nome || 'Consumidor'}`,
          valor: entry.pedidoData.total,
          forma_pagamento: entry.pedidoData.forma_pagamento,
          pedido_id: pedidoId,
          data: new Date().toISOString().slice(0, 10),
        });

        // Sucesso: remove esse item específico da fila (não a fila inteira,
        // caso outro pedido tenha sido adicionado nesse meio tempo)
        const current = readQueue().filter((e) => e.localId !== entry.localId);
        writeQueue(current);
        synced++;
      } catch (e) {
        // Provavelmente ainda sem internet (ou erro real) — para a fila aqui
        // e tenta os demais na próxima chamada de sync.
        logger.error('Falha ao sincronizar pedido offline, tentando novamente depois', e instanceof Error ? e : undefined);
        break;
      }
    }
  } finally {
    syncing = false;
  }

  return synced;
}

// Sincroniza automaticamente sempre que a conexão volta
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncOfflineQueue();
  });
}
