import { createContext, useContext } from 'react';

// ─── Contexto de idioma ──────────────────────────────────────
export const LangContext = createContext({
  t: k => k,
  lang: 'es',
  setLang: () => {}
});

export function useLang() {
  return useContext(LangContext);
}
