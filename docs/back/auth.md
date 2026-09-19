# Auth — `app/auth.py` · `app/routers/auth_router.py`

## Qué hace

Maneja registro, login, generación/validación de JWT y protección de endpoints por rol.

---

## `app/auth.py` — Núcleo de autenticación

### Configuración
```python
SECRET_KEY  = env("JWT_SECRET_KEY")   # cambiar en producción
ALGORITHM   = "HS256"
EXPIRY      = 24 horas
```

### Funciones

| Función | Descripción |
|---|---|
| `hash_password(pwd)` | Genera hash bcrypt del password |
| `verify_password(plain, hashed)` | Compara password con su hash |
| `create_access_token(data)` | Firma JWT con `sub=user_id`, `email`, `role` |
| `decode_token(token)` | Decodifica JWT, lanza 401 si inválido o expirado |
| `get_current_user(token, session)` | **Dependencia FastAPI** — busca el usuario en DB a partir del token. Lanza 401 si no existe o está inactivo |
| `require_role(*roles)` | **Factory de dependencia** — retorna función que lanza 403 si el usuario no tiene el rol requerido |

### Schemas Pydantic

| Schema | Campos |
|---|---|
| `RegisterRequest` | email, password, full_name, role |
| `LoginRequest` | email, password |
| `UserResponse` | id, email, full_name, role, is_active, photo_url |
| `Token` | access_token, token_type |
| `TokenData` | user_id, email, role (del JWT decodificado) |

---

## `app/routers/auth_router.py` — Endpoints `/api/auth`

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| POST | `/register` | No | Crea usuario. Si `role=caregiver`, también crea `CaregiverProfile` vacío con estado `pending` |
| POST | `/login` | No | Verifica credenciales → retorna `{ access_token, user }` |
| GET | `/me` | JWT | Retorna datos del usuario autenticado |
| PUT | `/change-password` | JWT | Verifica password actual, guarda nuevo hash |

### Flujo de login
```
POST /api/auth/login { email, password }
  → busca User por email
  → verify_password(plain, hash)
  → create_access_token({ sub: user.id, email, role })
  → retorna Token + UserResponse
```

### Cómo proteger un endpoint
```python
# Cualquier usuario autenticado
@router.get("/me")
def endpoint(current_user: User = Depends(get_current_user)):

# Solo un rol específico
@router.post("/something")
def endpoint(current_user: User = Depends(require_role(UserRole.family))):

# Múltiples roles
@router.put("/decide")
def endpoint(current_user: User = Depends(require_role(UserRole.caregiver, UserRole.nurse))):
```

---

## Frontend — flujo de sesión

El token y los datos del usuario se guardan en `localStorage`:
- `localStorage.token` → string JWT
- `localStorage.user` → JSON con `UserResponse`

`App.jsx` los lee al montar. `handleLogout()` los elimina y limpia el estado.  
`onUserUpdate(u)` sincroniza cambios de nombre o foto entre componentes y localStorage.
