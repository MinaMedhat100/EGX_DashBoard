import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Theme = 'neon' | 'desk' | 'paper';
const KEY = 'egx-theme';

function initial(): Theme {
  const t = (typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme')
    : null) as Theme | null;
  return t === 'neon' || t === 'desk' || t === 'paper' ? t : 'desk';
}

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'desk',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initial);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }, []);
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(Ctx);
