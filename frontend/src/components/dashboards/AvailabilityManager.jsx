import { useEffect, useState } from 'react';
import Spinner from '../common/Spinner';
import { INPUT_CLASS, LABEL_CLASS } from '../../constants';

const DAYS = [
  ['monday', 'Lunes'], ['tuesday', 'Martes'], ['wednesday', 'Miércoles'],
  ['thursday', 'Jueves'], ['friday', 'Viernes'], ['saturday', 'Sábado'], ['sunday', 'Domingo'],
];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const formatHour = hour => `${String(hour).padStart(2, '0')}:00`;

export default function AvailabilityManager({ token }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ day_of_week: 'monday', start_hour: 8, end_hour: 17, is_active: true });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bookings/availability/me', { headers });
      setItems(response.ok ? await response.json() : []);
    } catch { setError('No fue posible cargar tu disponibilidad.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);

  const reset = () => {
    setEditingId(null);
    setForm({ day_of_week: 'monday', start_hour: 8, end_hour: 17, is_active: true });
    setError('');
  };
  const submit = async event => {
    event.preventDefault();
    if (Number(form.start_hour) === Number(form.end_hour)) {
      setError('La hora de finalización debe ser distinta de la hora de inicio.');
      return;
    }
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/bookings/availability${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST', headers,
        body: JSON.stringify({ ...form, start_hour: Number(form.start_hour), end_hour: Number(form.end_hour) }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail || 'No fue posible guardar el horario.');
      }
      reset(); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };
  const edit = item => { setEditingId(item.id); setForm(item); setError(''); };
  const remove = async id => {
    if (!window.confirm('¿Eliminar esta franja de disponibilidad?')) return;
    try {
      const response = await fetch(`/api/bookings/availability/${id}`, { method: 'DELETE', headers });
      if (!response.ok) throw new Error('No fue posible eliminar el horario.');
      await load();
    } catch (requestError) { setError(requestError.message); }
  };

  return <section className="h-full overflow-y-auto bg-[#f3f3f6]/50 p-6 md:p-8">
    <div className="max-w-5xl mx-auto grid lg:grid-cols-[360px_1fr] gap-6">
      <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-5 h-fit">
        <p className="text-[12px] font-bold uppercase tracking-[.12em] text-[#006a61]">Perfil profesional</p>
        <h1 className="text-[22px] font-bold text-[#1a1c1e] mt-1">Mi disponibilidad</h1>
        <p className="text-[13px] text-[#737785] mt-2">Agrega las franjas en que puedes atender. Si el final es menor al inicio, se registra como turno nocturno.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div><label className={LABEL_CLASS}>Día</label><select className={INPUT_CLASS} value={form.day_of_week} onChange={e => setForm({ ...form, day_of_week: e.target.value })}>{DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL_CLASS}>Inicio</label><select className={INPUT_CLASS} value={form.start_hour} onChange={e => setForm({ ...form, start_hour: e.target.value })}>{HOURS.map(hour => <option key={hour} value={hour}>{formatHour(hour)}</option>)}</select></div>
            <div><label className={LABEL_CLASS}>Fin</label><select className={INPUT_CLASS} value={form.end_hour} onChange={e => setForm({ ...form, end_hour: e.target.value })}>{HOURS.map(hour => <option key={hour} value={hour}>{formatHour(hour)}</option>)}</select></div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-[#424654]"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />Franja activa</label>
          {Number(form.end_hour) < Number(form.start_hour) && <p className="text-[12px] text-[#006a61]">Turno nocturno: termina al día siguiente.</p>}
          {error && <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">{error}</p>}
          <div className="flex gap-2"><button disabled={saving} className="flex-1 h-10 bg-[#0040a1] text-white rounded-xl text-[13px] font-bold disabled:opacity-60">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar horario'}</button>{editingId && <button type="button" onClick={reset} className="px-3 border border-[#c3c6d6] rounded-xl text-[13px] font-semibold">Cancelar</button>}</div>
        </form>
      </div>
      <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-5">
        <h2 className="font-bold text-[18px] text-[#1a1c1e]">Franjas configuradas</h2>
        {loading ? <div className="py-14 flex justify-center"><Spinner /></div> : items.length === 0 ? <div className="py-14 text-center text-[#737785]"><span className="material-symbols-outlined text-[38px]">schedule</span><p className="mt-2 text-[13px]">Aún no has configurado horarios.</p></div> : <div className="mt-4 space-y-2">{items.map(item => {
          const day = DAYS.find(([value]) => value === item.day_of_week)?.[1] || item.day_of_week;
          return <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#c3c6d6]/40 bg-[#f9f9fc] p-3"><div><p className="font-semibold text-[14px] text-[#1a1c1e]">{day} {!item.is_active && <span className="text-[11px] text-[#737785]">(inactiva)</span>}</p><p className="text-[13px] text-[#424654]">{formatHour(item.start_hour)} — {formatHour(item.end_hour)} {item.end_hour < item.start_hour && <span className="text-[#006a61]">· nocturno</span>}</p></div><div className="flex gap-1"><button onClick={() => edit(item)} className="p-2 text-[#0040a1]" aria-label="Editar horario"><span className="material-symbols-outlined text-[19px]">edit</span></button><button onClick={() => remove(item.id)} className="p-2 text-red-600" aria-label="Eliminar horario"><span className="material-symbols-outlined text-[19px]">delete</span></button></div></div>;
        })}</div>}
      </div>
    </div>
  </section>;
}