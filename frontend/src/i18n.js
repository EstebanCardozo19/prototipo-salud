/**
 * i18n.js — Sistema de traducciones ES / EN basado en JSON
 * Uso: import { useTranslation } from './i18n'
 *      const { t, lang, setLang } = useTranslation()
 *      t('auth.login')  →  "Iniciar Sesión" | "Sign In"
 */
import { useState, useCallback } from 'react';
import es from './locales/es.json';
import en from './locales/en.json';

const LANG_KEY = 'salud_lang';

export const locales = { es, en };

// Compatibilidad con accesos directos
export const translations = {
  roles: Object.fromEntries(
    Object.keys(es.roles).map(k => [k, { es: es.roles[k], en: en.roles[k] }])
  ),
  specialties: Object.fromEntries(
    Object.keys(es.specialties).map(k => [k, { es: es.specialties[k], en: en.specialties[k] }])
  ),
  mobility: Object.fromEntries(
    Object.keys(es.mobility).map(k => [k, { es: es.mobility[k], en: en.mobility[k] }])
  ),
  bookingStatus: Object.fromEntries(
    Object.keys(es.bookingStatus).map(k => [k, { es: es.bookingStatus[k], en: en.bookingStatus[k] }])
  ),
  eps: {
    list: {
      es: es.eps.list,
      en: en.eps.list
    }
  },
  prepaid: {
    list: {
      es: es.prepaid.list,
      en: en.prepaid.list
    }
  }
};

/**
 * Hook principal de i18n.
 * Devuelve { t, lang, setLang, langs }
 */
export function useTranslation() {
  const [lang, setLangState] = useState(
    () => localStorage.getItem(LANG_KEY) || 'es'
  );

  const setLang = useCallback((l) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback((key, vars = {}) => {
    const parts = key.split('.');
    const dict = locales[lang] || locales.es;
    let node = dict;
    for (const p of parts) {
      if (node == null) break;
      node = node[p];
    }
    // Fallback a español si no se encuentra en el idioma seleccionado
    if (node == null && lang !== 'es') {
      node = locales.es;
      for (const p of parts) {
        if (node == null) break;
        node = node[p];
      }
    }
    if (node == null) return key;
    const str = typeof node === 'string' ? node : String(node);
    // Interpolación simple: {n}, {name}, {price}, etc.
    return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }, [lang]);

  return { t, lang, setLang, langs: ['es', 'en'] };
}

// Acceso directo sin hook
export function getT(lang = 'es') {
  return (key, vars = {}) => {
    const parts = key.split('.');
    const dict = locales[lang] || locales.es;
    let node = dict;
    for (const p of parts) {
      if (node == null) break;
      node = node[p];
    }
    if (node == null && lang !== 'es') {
      node = locales.es;
      for (const p of parts) {
        if (node == null) break;
        node = node[p];
      }
    }
    if (node == null) return key;
    const str = typeof node === 'string' ? node : String(node);
    return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  };
}
