import { createContext, useContext, useState, useEffect } from 'react';
import translations from '../translations';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // ── Theme (dark | light) ──────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('esms-theme') || 'dark';
  });

  // ── Language (en | ur) ───────────────────────────────────────────────
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('esms-lang') || 'en';
  });

  // Apply theme class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    localStorage.setItem('esms-theme', theme);
  }, [theme]);

  // Apply lang + dir to <html> element
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
    localStorage.setItem('esms-lang', lang);
  }, [lang]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  const t = (key) => translations[lang]?.[key] ?? translations['en']?.[key] ?? key;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, lang, setLang, t }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
