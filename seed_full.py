"""
seed_full.py — Seed único y autocontenido.

Crea todas las tablas, aplica migraciones de columnas y carga
todos los usuarios (admin, familiares, cuidadores y enfermeros).

Uso:
    python seed_full.py

Requisitos:
    - PostgreSQL corriendo (docker compose up db -d)
    - Venv activado con las dependencias instaladas
    - .env con DATABASE_URL configurado
"""
import os
from dotenv import load_dotenv
load_dotenv()

from sqlmodel import SQLModel, Session
from sqlalchemy import text
from app.database import engine
from app.models import User, UserRole, CaregiverProfile, NurseProfile, NurseSpecialty, ProfileStatus, ServiceChatMessage
from app.auth import hash_password
from app.services.embedding_service import generar_embedding

def run():
    print("=" * 60)
    print("  SEED COMPLETO — Reconstruyendo datos")
    print("=" * 60)

    with engine.connect() as conn:
        # ── Extensiones ─────────────────────────────────────────
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()

    # ── Crear todas las tablas definidas en los modelos ──────────
    SQLModel.metadata.create_all(engine)

    with engine.connect() as conn:
        # ── Columnas opcionales (migraciones acumuladas) ─────────
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"))
        conn.execute(text("ALTER TABLE caregiver_profiles ADD COLUMN IF NOT EXISTS rating_avg FLOAT DEFAULT 5.0"))
        conn.execute(text("ALTER TABLE caregiver_profiles ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0"))
        conn.execute(text("ALTER TABLE nurse_profiles ADD COLUMN IF NOT EXISTS rating_avg FLOAT DEFAULT 5.0"))
        conn.execute(text("ALTER TABLE nurse_profiles ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0"))
        conn.execute(text("ALTER TABLE nurse_profiles DROP COLUMN IF EXISTS accepts_home_visits"))
        conn.execute(text("DO $$ BEGIN ALTER TYPE userrole ADD VALUE 'nurse'; EXCEPTION WHEN duplicate_object THEN null; END $$"))
        conn.execute(text("DO $$ BEGIN ALTER TYPE userrole ADD VALUE 'admin'; EXCEPTION WHEN duplicate_object THEN null; END $$"))
        conn.execute(text("DO $$ BEGIN CREATE TYPE nursespecialty AS ENUM ('general','geriatrics','neurology','cardiology','pulmonology','psychiatry','physiatry','palliative','internal_medicine','endocrinology','nephrology','orthopedics'); EXCEPTION WHEN duplicate_object THEN null; END $$"))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS nurse_profiles (
            id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
            specialty VARCHAR(30) NOT NULL DEFAULT 'general', license_number VARCHAR(50) NOT NULL DEFAULT '',
            institution VARCHAR(200), experience_years INTEGER DEFAULT 0, bio VARCHAR(500),
            location VARCHAR(100) NOT NULL DEFAULT '', hourly_rate FLOAT DEFAULT 0.0,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW())"""))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS bookings (
            id SERIAL PRIMARY KEY, family_user_id INTEGER NOT NULL REFERENCES users(id),
            professional_user_id INTEGER NOT NULL REFERENCES users(id), professional_role VARCHAR(20),
            date VARCHAR(10), start_hour INTEGER DEFAULT 8, end_hour INTEGER DEFAULT 12,
            notes VARCHAR(500), status VARCHAR(20) DEFAULT 'pending', rejection_reason VARCHAR(300),
            created_at TIMESTAMPTZ DEFAULT NOW())"""))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS availability (
            id SERIAL PRIMARY KEY, professional_user_id INTEGER NOT NULL REFERENCES users(id),
            day_of_week VARCHAR(20), start_hour INTEGER DEFAULT 8, end_hour INTEGER DEFAULT 17, is_active BOOLEAN DEFAULT true)"""))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS reviews (
            id SERIAL PRIMARY KEY, family_user_id INTEGER NOT NULL REFERENCES users(id),
            professional_user_id INTEGER NOT NULL REFERENCES users(id), booking_id INTEGER,
            rating INTEGER DEFAULT 5, comment VARCHAR(500), created_at TIMESTAMPTZ DEFAULT NOW())"""))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS clinical_records (
            id SERIAL PRIMARY KEY, family_user_id INTEGER NOT NULL REFERENCES users(id),
            patient_name VARCHAR(150), patient_age INTEGER DEFAULT 0, diagnoses JSON, medications JSON,
            allergies JSON, mobility_level VARCHAR(50), special_needs VARCHAR(1000),
            emergency_contact VARCHAR(255), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())"""))
        # ── Migraciones acumuladas: clinical_records ─────────────
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS blood_type VARCHAR(10)"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS address VARCHAR(300)"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100)"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS city VARCHAR(100)"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS floor_number INTEGER"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS is_apartment BOOLEAN"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS has_elevator BOOLEAN"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS housing_notes VARCHAR(500)"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS eps VARCHAR(150)"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS prepaid_medicine VARCHAR(150)"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS preferred_hospital VARCHAR(200)"))
        conn.execute(text("ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS takes_medications BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("UPDATE clinical_records SET takes_medications = TRUE WHERE medications IS NOT NULL"))
        # Limpiar todo
        conn.execute(text("DELETE FROM reviews"))
        conn.execute(text("DELETE FROM bookings"))
        conn.execute(text("DELETE FROM availability"))
        conn.execute(text("DELETE FROM clinical_records"))
        conn.execute(text("DELETE FROM nurse_profiles"))
        conn.execute(text("DROP TABLE IF EXISTS doctor_profiles"))
        conn.execute(text("DELETE FROM caregiver_profiles"))
        conn.execute(text("DELETE FROM users"))
        conn.commit()

    print("\n✅ Tablas limpias. Insertando usuarios...\n")

    with Session(engine) as session:
        # === ADMIN ===
        admin = User(email="admin@salud.com", password_hash=hash_password("admin123"), full_name="Administrador Sistema", role=UserRole.admin, is_active=True)
        session.add(admin); session.commit()
        print("  ✅ admin@salud.com / admin123")

        # === FAMILIARES ===
        families = [
            ("familia1@test.com", "Carlos Pérez Gómez"),
            ("familia2@test.com", "Martha Rodríguez Luna"),
            ("familia3@test.com", "Andrés Martínez Díaz"),
            ("familia4@test.com", "Lucía Hernández Vargas"),
            ("familia5@test.com", "Roberto Sánchez Mejía"),
        ]
        for email, name in families:
            u = User(email=email, password_hash=hash_password("familia123"), full_name=name, role=UserRole.family, is_active=True)
            session.add(u); session.commit()
            print(f"  ✅ {email} / familia123")

        # === CUIDADORES (todos con cuenta) ===
        cuidadores = [
            {"email": "maria.lopez@cuidar.com", "full_name": "María Fernanda López", "location": "Usaquén", "experience_years": 8, "specialties": ["Alzheimer", "Demencia", "Acompañamiento nocturno"], "hourly_rate": 45000, "bio": "Enfermera especializada en cuidado de pacientes con Alzheimer y demencia senil. Manejo de crisis nocturnas y estimulación cognitiva."},
            {"email": "carlos.rodriguez@cuidar.com", "full_name": "Carlos Andrés Rodríguez", "location": "Chapinero", "experience_years": 5, "specialties": ["Parkinson", "Rehabilitación física", "Movilidad reducida"], "hourly_rate": 40000, "bio": "Fisioterapeuta con especialización en enfermedades neurodegenerativas. Ejercicios de movilidad y prevención de caídas."},
            {"email": "ana.martinez@cuidar.com", "full_name": "Ana Lucía Martínez", "location": "Suba", "experience_years": 12, "specialties": ["Cuidados paliativos", "Oncología", "Manejo del dolor"], "hourly_rate": 55000, "bio": "Especialista en cuidados paliativos para pacientes oncológicos. Apoyo emocional a familias."},
            {"email": "jorge.diaz@cuidar.com", "full_name": "Jorge Enrique Díaz", "location": "Kennedy", "experience_years": 3, "specialties": ["Diabetes", "Nutrición geriátrica", "Control de glucemia"], "hourly_rate": 35000, "bio": "Técnico en enfermería con formación en nutrición geriátrica. Control de glucemia y dietas especiales."},
            {"email": "laura.gomez@cuidar.com", "full_name": "Laura Patricia Gómez", "location": "Engativá", "experience_years": 7, "specialties": ["Postoperatorio", "Heridas", "Recuperación quirúrgica"], "hourly_rate": 42000, "bio": "Enfermera profesional en cuidados postoperatorios. Manejo de heridas y rehabilitación temprana."},
            {"email": "roberto.vargas@cuidar.com", "full_name": "Roberto Alejandro Vargas", "location": "Fontibón", "experience_years": 10, "specialties": ["EPOC", "Oxigenoterapia", "Enfermedades respiratorias"], "hourly_rate": 48000, "bio": "Terapeuta respiratorio con experiencia en EPOC. Manejo de equipos de oxígeno y nebulizaciones."},
            {"email": "sandra.castillo@cuidar.com", "full_name": "Sandra Milena Castillo", "location": "Usaquén", "experience_years": 15, "specialties": ["Geriatría general", "Compañía", "Actividades recreativas"], "hourly_rate": 38000, "bio": "Cuidadora integral con 15 años. Actividades recreativas y estimulación mental."},
            {"email": "diego.morales@cuidar.com", "full_name": "Diego Fernando Morales", "location": "Chapinero", "experience_years": 6, "specialties": ["ACV", "Hemiplejia", "Rehabilitación neurológica"], "hourly_rate": 50000, "bio": "Fisioterapeuta neurológico en rehabilitación post-ACV y recuperación de movilidad."},
            {"email": "claudia.ruiz@cuidar.com", "full_name": "Claudia Marcela Ruiz", "location": "Suba", "experience_years": 4, "specialties": ["Hipertensión", "Cardiología", "Monitoreo de presión"], "hourly_rate": 37000, "bio": "Auxiliar de enfermería en cardiología geriátrica. Control de presión y medicamentos cardíacos."},
            {"email": "andres.herrera@cuidar.com", "full_name": "Andrés Felipe Herrera", "location": "Bosa", "experience_years": 9, "specialties": ["Fracturas", "Movilidad reducida", "Prevención de caídas"], "hourly_rate": 40000, "bio": "Especialista en adultos mayores con fracturas. Asistencia en traslados y fortalecimiento."},
            {"email": "patricia.monsalve@cuidar.com", "full_name": "Patricia Elena Monsalve", "location": "Teusaquillo", "experience_years": 11, "specialties": ["Depresión geriátrica", "Salud mental", "Acompañamiento emocional"], "hourly_rate": 43000, "bio": "Psicóloga clínica con gerontología. Acompañamiento emocional y terapia adaptada."},
            {"email": "hector.pena@cuidar.com", "full_name": "Héctor Julio Peña", "location": "Kennedy", "experience_years": 7, "specialties": ["Incontinencia", "Higiene personal", "Cuidado integral"], "hourly_rate": 36000, "bio": "Cuidador profesional en asistencia de higiene personal. Manejo de incontinencia y cuidado de piel."},
            {"email": "valentina.restrepo@cuidar.com", "full_name": "Valentina Restrepo Arias", "location": "Barrios Unidos", "experience_years": 2, "specialties": ["Compañía diurna", "Alimentación", "Paseos"], "hourly_rate": 30000, "bio": "Cuidadora joven en compañía diurna. Alimentación saludable y paseos al aire libre."},
            {"email": "luz.ospina@cuidar.com", "full_name": "Luz Marina Ospina", "location": "Suba", "experience_years": 20, "specialties": ["Cuidado nocturno", "Insomnio", "Seguridad nocturna"], "hourly_rate": 47000, "bio": "Especialista en cuidado nocturno con 20 años. Vigilancia de sueño y asistencia nocturna."},
            {"email": "camilo.bermudez@cuidar.com", "full_name": "Camilo José Bermúdez", "location": "Fontibón", "experience_years": 5, "specialties": ["Alzheimer temprano", "Estimulación cognitiva", "Memoria"], "hourly_rate": 44000, "bio": "Terapeuta ocupacional en estimulación cognitiva para Alzheimer temprano."},
        ]

        print("\n  --- Cuidadores ---")
        for c in cuidadores:
            u = User(email=c["email"], password_hash=hash_password("cuidador123"), full_name=c["full_name"], role=UserRole.caregiver, is_active=True)
            session.add(u); session.commit(); session.refresh(u)
            texto = f"{c['bio']} Especialidades: {', '.join(c['specialties'])}. Localidad: {c['location']}."
            emb = generar_embedding(texto)
            p = CaregiverProfile(user_id=u.id, experience_years=c["experience_years"], specialties=c["specialties"], hourly_rate=c["hourly_rate"], location=c["location"], bio=c["bio"], status=ProfileStatus.approved, embedding=emb)
            session.add(p); session.commit()
            print(f"  ✅ {c['email']} / cuidador123")

        enfermeros = [
            {"email": "enf.rodriguez@salud.com", "full_name": "Enf. Laura Rodríguez", "specialty": NurseSpecialty.general, "license_number": "ENF-2009-1102", "institution": "Hospital Universitario", "experience_years": 12, "bio": "Enfermera general con experiencia en cuidado de adultos mayores y administración de medicamentos.", "location": "Chapinero", "hourly_rate": 45000},
            {"email": "enf.martinez@salud.com", "full_name": "Enf. Carlos Martínez", "specialty": NurseSpecialty.geriatrics, "license_number": "ENF-2011-3456", "institution": "Fundación Cardioinfantil", "experience_years": 10, "bio": "Especialista en geriatría. Acompañamiento integral, prevención de caídas y control de signos vitales.", "location": "Usaquén", "hourly_rate": 50000},
            {"email": "enf.garcia@salud.com", "full_name": "Enf. Patricia García", "specialty": NurseSpecialty.neurology, "license_number": "ENF-2010-2891", "institution": "Fundación Santa Fe", "experience_years": 18, "bio": "Enfermera especializada en neurología. Manejo de pacientes con Alzheimer, Parkinson y ELA.", "location": "Usaquén", "hourly_rate": 60000},
            {"email": "enf.ruiz@salud.com", "full_name": "Enf. Andrés Felipe Ruiz", "specialty": NurseSpecialty.cardiology, "license_number": "ENF-2012-6743", "institution": "Clínica del Country", "experience_years": 14, "bio": "Enfermero cardiovascular. Manejo de insuficiencia cardíaca, hipertensión y arritmias en adultos mayores.", "location": "Suba", "hourly_rate": 52000},
            {"email": "enf.moreno@salud.com", "full_name": "Enf. Claudia Moreno Pinzón", "specialty": NurseSpecialty.psychiatry, "license_number": "ENF-2008-1290", "institution": "Clínica de la Paz", "experience_years": 20, "bio": "Enfermera psiquiátrica geriátrica. Depresión, ansiedad, insomnio y trastornos del comportamiento.", "location": "Teusaquillo", "hourly_rate": 55000},
            {"email": "enf.hernandez@salud.com", "full_name": "Enf. Julio Hernández Castañeda", "specialty": NurseSpecialty.palliative, "license_number": "ENF-2011-5567", "institution": "Hospital San José", "experience_years": 15, "bio": "Enfermero paliativista. Manejo del dolor crónico y cuidados al final de la vida.", "location": "Kennedy", "hourly_rate": 50000},
            {"email": "enf.torres@salud.com", "full_name": "Enf. Diana Torres Quintero", "specialty": NurseSpecialty.pulmonology, "license_number": "ENF-2013-8821", "institution": "Hospital Santa Clara", "experience_years": 10, "bio": "Enfermera neumóloga. EPOC, oxigenoterapia domiciliaria y rehabilitación pulmonar.", "location": "Engativá", "hourly_rate": 48000},
            {"email": "enf.castro@salud.com", "full_name": "Enf. Miguel Castro Rojas", "specialty": NurseSpecialty.orthopedics, "license_number": "ENF-2014-3356", "institution": "Clínica Marly", "experience_years": 8, "bio": "Enfermero ortopédico. Rehabilitación post-fractura, prótesis de cadera y rodilla.", "location": "Fontibón", "hourly_rate": 46000},
            {"email": "enf.varela@salud.com", "full_name": "Enf. Sofía Varela Mendoza", "specialty": NurseSpecialty.nephrology, "license_number": "ENF-2009-7742", "institution": "Fresenius Medical", "experience_years": 16, "bio": "Enfermera nefróloga. Pre y post-diálisis, control de líquidos, manejo de fístulas y catéteres.", "location": "Bosa", "hourly_rate": 53000},
        ]

        print("\n  --- Enfermeros ---")
        for e in enfermeros:
            u = User(email=e["email"], password_hash=hash_password("enfermero123"), full_name=e["full_name"], role=UserRole.nurse, is_active=True)
            session.add(u); session.commit(); session.refresh(u)
            texto = f"{e['bio']} Especialidad: {e['specialty'].value}. Localidad: {e['location']}."
            p = NurseProfile(user_id=u.id, specialty=e["specialty"], license_number=e["license_number"], institution=e["institution"], experience_years=e["experience_years"], bio=e["bio"], location=e["location"], hourly_rate=e["hourly_rate"], status=ProfileStatus.approved, embedding=generar_embedding(texto))
            session.add(p); session.commit()
            print(f"  ✅ {e['email']} / enfermero123")

    print("\n" + "=" * 60)
    print("  ✅ SEED COMPLETO")
    print("=" * 60)
    print("\n📋 CREDENCIALES:")
    print("  Admin:       admin@salud.com / admin123")
    print("  Familiares:  familia1@test.com ... familia5@test.com / familia123")
    print("  Cuidadores:  [email]@cuidar.com / cuidador123")
    print("  Enfermeros:  enf.[nombre]@salud.com / enfermero123")

if __name__ == "__main__":
    run()
