import { createContext, useContext, useState, useEffect } from 'react';
import translations from '../translations';

const ThemeContext = createContext(null);

// Words that must stay fully capitalised when a key is humanised.
const ACRONYMS = new Set([
  'bod', 'cnic', 'ntn', 'crm', 'esms', 'hr', 'po', 'grn', 'coa', 'sku',
  'pkr', 'pdf', 'url', 'id', 'ids', 'gst', 'vat', 'pos', 'usd',
]);

// Last-resort label for a key with no translation: 'bodCurrentCash' → 'BOD Current Cash'.
// Without this a missing key rendered its own raw camelCase name in the UI.
function humanizeKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (ACRONYMS.has(w.toLowerCase())
      ? w.toUpperCase()
      : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

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

  const t = (key, fallback) => translations[lang]?.[key]
    ?? translations['en']?.[key]
    ?? fallback
    ?? humanizeKey(key);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, lang, setLang, t }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
