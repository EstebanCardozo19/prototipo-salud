import { useEffect, useState } from 'react';
import Spinner from '../common/Spinner';
import MedicationsPanel from './MedicationsPanel';

/**
 * Pantalla "Rutinas y medicamentos" del familiar (y del profesional asignado).
 *
 * Flujo:
 *   1. Se muestra la lista de fichas clínicas del usuario (familia) o las fichas
 *      de pacientes con un servicio aprobado (profesional).
 *   2. Al seleccionar una ficha se abre MedicationsPanel para esa ficha.
 */
export default function MedicationsScreen({ user, token }) {
  const isFamily = user.role === 'family';

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const url = isFamily ? '/api/clinical-records/' : '/api/bookings/my-assignments';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Error al cargar');
        const data = await res.json();

        if (isFamily) {
          setRecords(data);
        } else {
          const seen = new Set();
          const unique = [];
          for (const b of data) {
            if (b.clinical_record_id && !seen.has(b.clinical_record_id)) {
              seen.add(b.clinical_record_id);
              unique.push({
                id: b.clinical_record_id,
                patient_name: b.patient_name || 'Paciente',
                patient_age: b.patient_age || '?',
              });
            }
          }
          setRecords(unique);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          setError('El servidor tardó demasiado en responder. Verifica que el backend esté activo.');
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user.id]);

  if (selected) {
    return (
      <MedicationsPanel
        record={selected}
        token={token}
        user={user}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header compacto */}
      <div className="px-5 py-3 border-b border-[#c3c6d6]/30 bg-white shrink-0">
        <h2 className="text-[16px] font-bold text-[#17324d] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#0040a1] text-[20px]">medication</span>
          Rutinas y medicamentos
        </h2>
        <p className="text-[12px] text-[#536779] mt-0.5">
          {isFamily
            ? 'Selecciona un familiar para gestionar sus medicamentos y rutinas.'
            : 'Selecciona un paciente con un servicio aprobado para ver o proponer medicamentos.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="material-symbols-outlined text-[52px] text-[#c3c6d6] mb-3">medication</span>
            <p className="text-[16px] font-semibold text-[#424654]">
              {isFamily ? 'No tienes familiares registrados' : 'No tienes pacientes asignados'}
            </p>
            {isFamily && (
              <p className="text-[13px] text-[#737785] mt-1">
                Primero crea una ficha clínica en "Mis pacientes"
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {records.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-4 text-left hover:border-[#0040a1]/40 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#dae2ff] to-[#c5d0f5] text-[#0040a1] flex items-center justify-center text-lg font-bold shrink-0">
                    {(r.patient_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[14px] text-[#17324d] truncate">{r.patient_name}</p>
                    <p className="text-[11px] text-[#536779]">{r.patient_age} años</p>
                  </div>
                  <span className="material-symbols-outlined text-[#0040a1] text-[18px] group-hover:translate-x-0.5 transition-transform shrink-0">
                    chevron_right
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
