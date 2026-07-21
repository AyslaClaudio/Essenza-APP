import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, UploadCloud } from 'lucide-react';
import { subscribeOfflineQueue, syncOfflineQueue, type OfflinePedidoPayload } from '../lib/offlineQueue';

/**
 * Faixa fixa que aparece quando o app está sem internet e/ou há pedidos
 * feitos offline aguardando para serem enviados ao banco. Some sozinha quando
 * tudo volta ao normal e a fila esvazia.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<OfflinePedidoPayload[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => subscribeOfflineQueue(setQueue), []);

  // Tenta sincronizar a fila periodicamente enquanto online e houver pendências
  useEffect(() => {
    if (!online || queue.length === 0) return;
    const id = setInterval(async () => {
      setSyncing(true);
      await syncOfflineQueue();
      setSyncing(false);
    }, 8000);
    return () => clearInterval(id);
  }, [online, queue.length]);

  if (online && queue.length === 0) return null;

  return (
    <div
      className={`sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white ${
        !online ? 'bg-red-600' : 'bg-amber-600'
      }`}
    >
      {!online ? (
        <>
          <WifiOff size={14} />
          Sem conexão com a internet — os pedidos estão sendo salvos no aparelho e serão enviados automaticamente quando a internet voltar.
        </>
      ) : (
        <>
          <UploadCloud size={14} className={syncing ? 'animate-pulse' : ''} />
          Sincronizando {queue.length} {queue.length === 1 ? 'pedido' : 'pedidos'} feito{queue.length === 1 ? '' : 's'} offline...
        </>
      )}
      {queue.length > 0 && online && (
        <button
          onClick={async () => {
            setSyncing(true);
            await syncOfflineQueue();
            setSyncing(false);
          }}
          className="ml-2 underline flex items-center gap-1"
        >
          <RefreshCw size={12} /> tentar agora
        </button>
      )}
    </div>
  );
}
