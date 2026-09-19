# Estado global y contextos — `src/`

## `App.jsx` — Raíz de la aplicación

Maneja la sesión del usuario y provee el contexto de idioma a toda la app.

**Estado:**
- `user` — objeto UserResponse o null. Se carga de `localStorage.user` al montar
- `token` — string JWT o null. Se carga de `localStorage.token`

**Callbacks:**

| Función | Descripción |
|---|---|
| `handleLogin(user, token)` | Persiste en localStorage y actualiza estado. Se pasa a `AuthScreen` |
| `handleLogout()` | Limpia localStorage y estado. Se pasa a `MainScreen` |
| `handleUserUpdate(user)` | Sincroniza cambios de nombre/foto. Se pasa a `AccountPanel` |

**Renderizado:**
```jsx
<LangContext.Provider value={i18n}>
  {!user ? <AuthScreen onLogin={handleLogin} />
         : <MainScreen user token onLogout onUserUpdate />}
</LangContext.Provider>
```

---

## `src/contexts/LangContext.jsx`

Define el contexto con shape `{ t, lang, setLang }` y el hook `useLang()`.  
El valor real lo inyecta `App.jsx` a través de `useTranslation()`.

Todos los componentes acceden al idioma con:
```js
const { t, lang, setLang } = useLang();
```

---

## `src/i18n.js` — Sistema de traducciones

ES/EN con persistencia en `localStorage('salud_lang')`.

| Símbolo | Descripción |
|---|---|
| `useTranslation()` | Hook completo. Retorna `{ t, lang, setLang, langs }` |
| `t(key, vars?)` | Traduce por dot-notation. Fallback a ES. Soporta `{variable}` |
| `setLang(code)` | Persiste y actualiza idioma |
| `getT(lang)` | Versión funcional sin hook (para helpers) |
| `locales` | `{ es, en }` — JSON cargados de `src/locales/` |
| `translations` | Acceso directo a roles, specialties, mobility, eps, prepaid (para `helpers.js`) |

**Archivos de locale:** `src/locales/es.json` · `src/locales/en.json`

**Cambiar idioma:** desde `AccountPanel → Preferencias`. El toggle de `TopBar` fue eliminado.

---

## `src/components/common/MainScreen.jsx`

Shell principal tras el login. Gestiona `activeNav` (qué panel mostrar).

**Renderiza:**
- `TopBar` con la navegación
- Panel activo según `activeNav`:
  - `caregivers` / `nurses` → `SearchPanel`
  - `my-requests` → `SearchPanel` en tab solicitudes
  - `account` → `AccountPanel`
  - `chat` → `ChatPanel`
  - rol `caregiver/nurse` → `ProfessionalPanel` (su dashboard)
  - rol `admin` → `AdminDashboard`

**Tabs visibles por rol:**

| Rol | Tabs disponibles |
|---|---|
| `family` | Cuidadores, Enfermeros, Mis solicitudes, Mi Cuenta |
| `caregiver/nurse` | Mis Servicios, Mi Cuenta |
| `admin` | Panel Admin, Mi Cuenta |
