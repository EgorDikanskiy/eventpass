import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Session, type User } from '@/api';
import { setUnauthorizedHandler, tokenStorage } from '@/api/tokenStorage';
import { queryKeys } from '@/features/queryKeys';

type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Вызывать после успешного входа/регистрации. */
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Сессия пользователя. Токен хранится в localStorage, профиль — в кэше
 * TanStack Query под ключом `me`, поэтому после сохранения профиля
 * имя в шапке обновляется само.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => tokenStorage.get());

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.profile.getMe(),
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const reset = useCallback(() => {
    tokenStorage.clear();
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (tokenStorage.get()) reset();
    });
    return () => setUnauthorizedHandler(null);
  }, [reset]);

  const signIn = useCallback(
    (session: Session) => {
      tokenStorage.set(session.token);
      queryClient.removeQueries({ queryKey: ['events'] });
      queryClient.removeQueries({ queryKey: ['tickets'] });
      queryClient.setQueryData(queryKeys.me, session.user);
      setToken(session.token);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      reset();
    }
  }, [reset]);

  const value = useMemo<AuthContextValue>(() => {
    const user = token ? (me.data ?? null) : null;
    let status: AuthStatus = 'guest';
    if (token && me.isPending) status = 'loading';
    else if (user) status = 'authenticated';
    return { status, user, signIn, signOut };
  }, [token, me.data, me.isPending, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return value;
}
