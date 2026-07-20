import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Usuario, Role } from '../types';

interface AuthCtx {
  usuario: Usuario | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          const { data } = await supabase
            .from('usuarios')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle();
          setUsuario(data as Usuario | null);
        } else {
          setUsuario(null);
        }
        setLoading(false);
      })();
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
  };

  return (
    <Ctx.Provider value={{ usuario, loading, signIn, signOut }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}

export function canEditProducts(role: Role | undefined): boolean {
  return role === 'gerente';
}
