import { useEffect, useState, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Avisa quando existe uma versão mais nova do app publicada (deploy novo no
 * Vercel) e o usuário ainda está com a versão antiga aberta — comum em
 * pizzaria: o app fica de um dia pro outro numa aba/atalho aberto.
 *
 * Não usa service worker (mais simples e sem risco de cache "grudado"):
 * a cada alguns minutos busca o `index.html` de novo (sem cache) e compara
 * o nome do arquivo JS principal (o Vite muda esse nome — hash no arquivo —
 * a cada build) com o que está rodando agora. Se mudou, é porque saiu deploy
 * novo, e mostra o aviso pra recarregar.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

function scriptSrcFromHtml(html: string): string | null {
  const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
  return match ? match[1] : null;
}

export function UpdateBanner() {
  const [novaVersao, setNovaVersao] = useState(false);
  const versaoAtualRef = useRef<string | null>(
    typeof document !== 'undefined'
      ? document.querySelector('script[type="module"]')?.getAttribute('src') || null
      : null,
  );

  useEffect(() => {
    // Sem versão inicial detectada (ex: ambiente de dev) — não tem o que comparar.
    if (!versaoAtualRef.current) return;

    const check = async () => {
      try {
        const res = await fetch('/', { cache: 'no-store' });
        const html = await res.text();
        const versaoNova = scriptSrcFromHtml(html);
        if (versaoNova && versaoNova !== versaoAtualRef.current) {
          setNovaVersao(true);
        }
      } catch {
        // Sem internet no momento do check — tenta de novo no próximo ciclo, sem alarme falso.
      }
    };

    const id = setInterval(check, CHECK_INTERVAL_MS);
    // Também verifica quando a aba volta a ficar visível (ex: celular que estava em segundo plano)
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!novaVersao) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-neutral-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[92vw]">
      <span className="text-sm font-medium">Uma nova versão do app está disponível.</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 bg-[#16A34A] hover:bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors"
      >
        <RefreshCw size={14} /> Atualizar agora
      </button>
    </div>
  );
}
