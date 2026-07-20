import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Configuracao } from '../types';

interface ConfigCtx {
  config: Configuracao | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ConfigCtx>({} as ConfigCtx);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Configuracao | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data } = await supabase.from('configuracoes').select('*').maybeSingle();
    setConfig(data as Configuracao | null);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  return <Ctx.Provider value={{ config, loading, refresh }}>{children}</Ctx.Provider>;
}

export function useConfig() {
  return useContext(Ctx);
}
