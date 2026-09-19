// ─── Funciones auxiliares ────────────────────────────────────

import { translations } from '../i18n';

// Helpers para etiquetas traducidas
export function getSpecialtyLabel(key, lang) {
  return translations.specialties[key]?.[lang] || translations.specialties[key]?.es || key;
}

export function getRoleLabel(role, lang) {
  return translations.roles[role]?.[lang] || translations.roles[role]?.es || role;
}

export function getMobilityLabel(value, lang) {
  return translations.mobility[value]?.[lang] || translations.mobility[value]?.es || value;
}

export function getEpsList(lang) {
  return translations.eps.list[lang] || translations.eps.list.es;
}

export function getPrepaidList(lang) {
  return translations.prepaid.list[lang] || translations.prepaid.list.es;
}

// Parseo de listas
export function parseList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

export function joinList(arr) {
  if (!arr || arr.length === 0) return '';
  return arr.join(', ');
}

// Detecta género por nombre — normaliza tildes
export function guessGender(name = '') {
  if (!name) return '?';
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const first = normalize(name.trim().split(' ')[0]);
  const femPrefixes = [
    'maria', 'ana', 'laura', 'claudia', 'sandra', 'patricia', 'valentina',
    'luz', 'diana', 'sofia', 'andrea', 'carmen', 'rosa', 'isabel', 'monica',
    'paula', 'marcela', 'alejandra', 'natalia', 'lorena', 'beatriz', 'pilar',
    'olga', 'lucy'
  ];
  return femPrefixes.some(n => first.startsWith(n)) ? 'F' : 'M';
}
