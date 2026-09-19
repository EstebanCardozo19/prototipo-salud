# Usuarios del Sistema

## Cómo regenerar todos los usuarios

```powershell
# 1. Levantar la base de datos
docker compose up db -d

# 2. Activar el entorno virtual
.\venv\Scripts\Activate

# 3. Levantar el backend (crea las tablas automáticamente)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 4. En otra terminal, con el venv activado, cargar los datos
python seed_full.py
```pip install -r requirements.txt


`seed_full.py` es autocontenido: aplica todas las migraciones de columnas
(incluyendo `photo_url`) y luego inserta todos los usuarios desde cero.

---

## Administrador

| Email | Contraseña | Rol |
|-------|-----------|-----|
| admin@salud.com | admin123 | admin |

---

## Familiares (5) — contraseña: `familia123`

| Email | Nombre |
|-------|--------|
| familia1@test.com | Carlos Pérez Gómez |                                                                                                                                                                                                                                                                                                                                                                          
| familia2@test.com | Martha Rodríguez Luna |
| familia3@test.com | Andrés Martínez Díaz |
| familia4@test.com | Lucía Hernández Vargas |
| familia5@test.com | Roberto Sánchez Mejía |

---

## Cuidadores (15) — contraseña: `cuidador123`

| Email | Nombre | Localidad | Especialidades principales |
|-------|--------|-----------|---------------------------|
| maria.lopez@cuidar.com | María Fernanda López | Usaquén | Alzheimer, Demencia |
| carlos.rodriguez@cuidar.com | Carlos Andrés Rodríguez | Chapinero | Parkinson, Rehabilitación |
| ana.martinez@cuidar.com | Ana Lucía Martínez | Suba | Paliativos, Oncología |
| jorge.diaz@cuidar.com | Jorge Enrique Díaz | Kennedy | Diabetes, Nutrición |
| laura.gomez@cuidar.com | Laura Patricia Gómez | Engativá | Postoperatorio, Heridas |
| roberto.vargas@cuidar.com | Roberto Alejandro Vargas | Fontibón | EPOC, Oxigenoterapia |
| sandra.castillo@cuidar.com | Sandra Milena Castillo | Usaquén | Geriatría, Compañía |
| diego.morales@cuidar.com | Diego Fernando Morales | Chapinero | ACV, Rehabilitación neuro |
| claudia.ruiz@cuidar.com | Claudia Marcela Ruiz | Suba | Hipertensión, Cardiología |
| andres.herrera@cuidar.com | Andrés Felipe Herrera | Bosa | Fracturas, Movilidad |
| patricia.monsalve@cuidar.com | Patricia Elena Monsalve | Teusaquillo | Salud mental, Depresión |
| hector.pena@cuidar.com | Héctor Julio Peña | Kennedy | Higiene personal |
| valentina.restrepo@cuidar.com | Valentina Restrepo Arias | Barrios Unidos | Compañía diurna |
| luz.ospina@cuidar.com | Luz Marina Ospina | Suba | Cuidado nocturno |
| camilo.bermudez@cuidar.com | Camilo José Bermúdez | Fontibón | Alzheimer temprano, Memoria |

---

## Enfermeros (8) — contraseña: `enfermero123`

| Email | Nombre | Especialidad | Institución | Localidad |
|-------|--------|-------------|-------------|-----------|
| enf.gomez@salud.com | Enf. Ricardo Gómez Arias | Geriatría | Hospital San Ignacio | Chapinero |
| enf.salazar@salud.com | Enf. Patricia Salazar Vélez | Neurología | Fundación Santa Fe | Usaquén |
| enf.ruiz@salud.com | Enf. Andrés Felipe Ruiz | Cardiología | Clínica del Country | Suba |
| enf.moreno@salud.com | Enf. Claudia Moreno Pinzón | Psiquiatría | Clínica de la Paz | Teusaquillo |
| enf.hernandez@salud.com | Enf. Julio Hernández Castañeda | Cuidados Paliativos | Hospital San José | Kennedy |
| enf.torres@salud.com | Enf. Diana Torres Quintero | Neumología | Hospital Santa Clara | Engativá |
| enf.castro@salud.com | Enf. Miguel Castro Rojas | Ortopedia | Clínica Marly | Fontibón |
| enf.varela@salud.com | Enf. Sofía Varela Mendoza | Nefrología | Fresenius Medical | Bosa |

---

## Notas

- Las fotos de perfil se suben desde el endpoint `POST /api/upload/profile-photo`
  y se guardan en `uploads/profiles/`. La URL queda en el campo `photo_url` del usuario.
- `seed_full.py` borra y recrea **todos** los datos cada vez que se ejecuta.
- Las tablas las crea el backend automáticamente al arrancar (`SQLModel.metadata.create_all`).
