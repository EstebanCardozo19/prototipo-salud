# Notificaciones toast

El frontend usa un sistema global de notificaciones visuales (*toast*) para comunicar resultados de acciones sin bloquear la interacción del usuario. Su implementación está en `frontend/src/contexts/ToastContext.jsx` y se monta en `App.jsx` mediante `ToastProvider`.

## Diseño y comportamiento predeterminado

- Se muestran en la esquina superior derecha; en pantallas pequeñas usan el ancho disponible con márgenes de `16 px`.
- Admiten los tipos `success`, `error`, `warning` e `info`, cada uno con icono, color y barra de progreso propios.
- Desaparecen automáticamente tras **5 segundos** por defecto; la persona puede cerrarlos antes con el botón de cierre.
- Se muestran hasta cuatro notificaciones a la vez para evitar cubrir el contenido.
- Los mensajes de error y advertencia usan `role="alert"`; los demás, `role="status"`. Las animaciones se desactivan cuando el sistema indica `prefers-reduced-motion`.

## Uso

Todo componente renderizado bajo `ToastProvider` puede importar `useToast`:

```jsx
import { useToast } from '../../contexts/ToastContext';

function SaveProfileButton() {
  const { success, error, info, warning, showToast } = useToast();

  const save = async () => {
    try {
      await saveProfile();
      success('Tus cambios fueron guardados.', { title: 'Perfil actualizado' });
    } catch {
      error('No fue posible guardar los cambios.', { title: 'Intenta nuevamente' });
    }
  };
}
```

### API

| Método | Parámetros | Uso |
|---|---|---|
| `success(message, options)` | `message`, `{ title?, duration? }` | Confirmación de una acción completada |
| `error(message, options)` | `message`, `{ title?, duration? }` | Error de una acción o de comunicación |
| `warning(message, options)` | `message`, `{ title?, duration? }` | Advertencia que requiere atención |
| `info(message, options)` | `message`, `{ title?, duration? }` | Información contextual |
| `showToast(options)` | `{ message, title?, type?, duration? }` | Variante configurable |

`duration` está expresada en milisegundos. Use `duration: 0` para mantener la notificación visible hasta que se cierre manualmente.

## Integraciones actuales

- **Registro de cuenta:** `AuthScreen.jsx` muestra un toast de éxito diseñado al crear una cuenta y cambia a la pestaña de inicio de sesión.
- **Solicitud de servicio:** `ProfessionalCard.jsx` usa el mismo toast global al crear una o varias reservas.

No se debe usar `alert()` para los mensajes de producto: las nuevas notificaciones deben usar `useToast()` para conservar el diseño y comportamiento unificados.