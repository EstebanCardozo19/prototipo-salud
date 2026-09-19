# Cuenta y preferencias — `AccountPanel.jsx`

Panel de gestión personal del usuario. Accesible desde "Mi Cuenta" en la nav.

## Tabs disponibles

| Tab | Roles | Descripción |
|---|---|---|
| Perfil | Todos | Editar nombre, ver email (no editable), foto |
| Seguridad | Todos | Cambiar contraseña |
| Preferencias | Todos | Ciudad, idioma, notificaciones |
| Mi Familia | Solo `family` | Monta `FamilyPatientPanel` completo |

---

## Tab Perfil — foto de perfil

El avatar en el sidebar y en el header de perfil son clickeables → abren el `<input type="file" hidden>`.

**Subida** (`handlePhotoChange`):
1. Crea `FormData` con el archivo
2. `POST /api/upload/profile-photo` con `Authorization: Bearer {token}`
3. Respuesta contiene `{ photo_url: "/uploads/profiles/user_X_abc.jpg" }`
4. Actualiza estado local, `localStorage.user.photo_url` y llama `onUserUpdate()`
5. Formatos aceptados: jpeg, png, webp. Máx 5 MB (validado en backend)

**Eliminación** (`handleDeletePhoto`):
- `DELETE /api/upload/profile-photo`
- Limpia `photo_url` de estado y localStorage

**Importante**: las fotos se sirven desde `/uploads/profiles/...`. El proxy de Vite redirige `/uploads` al backend en desarrollo.

---

## Tab Seguridad

Formulario con 3 campos: contraseña actual, nueva, confirmación.  
`PUT /api/auth/change-password { current_password, new_password }`.  
Validación client-side: nueva === confirmación antes de enviar.

---

## Tab Preferencias

### Ciudad/Localidad preferida
- Selectores de ciudad y localidad de Colombia
- Preview de la preferencia activa con botón para limpiar
- **Accesos rápidos desde familiares**: si el familiar tiene fichas con `city` registrada, muestra cards clickeables para aplicar esa ubicación
- Al guardar → `localStorage('salud_user_prefs')` y dispara `CustomEvent('salud:prefsChanged')` para que `SearchPanel` actualice sus filtros en tiempo real

### Selector de idioma
Dos botones grandes: 🇨🇴 Español y 🇺🇸 English.  
Click → `setLang(code)` → persiste en `localStorage('salud_lang')` → re-render global inmediato.

### Notificaciones
Toggles para Email y SMS (guardados en `salud_user_prefs`, pendiente de integración con backend de notificaciones).

---

## Persistencia de preferencias

```js
// Clave: 'salud_user_prefs'
{
  prefCity: "Bogotá D.C.",
  prefLocality: "Chapinero",
  notifEmail: true,
  notifSms: false
}

// Clave: 'salud_lang'  (gestionada por i18n.js)
"es" | "en"

// Clave: 'user'  (gestionada por App.jsx)
{ id, email, full_name, role, photo_url }

// Clave: 'salud_need_templates'  (gestionada por BookingModal)
["Paciente con Alzheimer...", "Cuidado post-operatorio..."]
```
