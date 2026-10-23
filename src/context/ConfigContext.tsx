import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Configuracao } from '../types';
import { buscarConfiguracaoLoja } from '../lib/configuracaoLoja';

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
    // Pode existir um cadastro inicial e outro salvo posteriormente. Sem
    // limitar a consulta, maybeSingle falha e todos os consumidores recebem null.
    const { data, error } = await buscarConfiguracaoLoja(supabase);
    if (!error) setConfig(data as Configuracao | null);
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
