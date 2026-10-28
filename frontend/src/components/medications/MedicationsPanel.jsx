import { useEffect, useState } from 'react';
import Spinner from '../common/Spinner';
import MedicationFormModal from './MedicationFormModal';
import MedicationAgentChat from './MedicationAgentChat';

const FREQUENCY_LABELS = {
  every_4h:    'Cada 4 h',
  every_6h:    'Cada 6 h',
  every_8h:    'Cada 8 h',
  every_12h:   'Cada 12 h',
  every_24h:   '1 vez/día',
  twice_daily: '2 veces/día',
  three_daily: '3 veces/día',
  four_daily:  '4 veces/día',
  as_needed:   'Si es necesario',
  custom:      'Personalizado',
};

const STATUS_CONFIG = {
  active:    { label: 'Activo',    bg: 'bg-green-100',  text: 'text-green-700',  icon: 'check_circle' },
  proposed:  { label: 'Pendiente', bg: 'bg-amber-100',  text: 'text-amber-700',  icon: 'pending' },
  suspended: { label: 'Suspendido',bg: 'bg-[#f3f3f6]',  text: 'text-[#737785]',  icon: 'pause_circle' },
  rejected:  { label: 'Rechazado', bg: 'bg-red-100',    text: 'text-red-700',    icon: 'cancel' },
};

function StockBadge({ med }) {
  if (med.current_stock == null) return null;
  const low = med.low_stock;
  return (
    <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${low ? 'bg-red-100 text-red-700' : 'bg-[#f3f3f6] text-[#424654]'}`}>
      <span className="material-symbols-outlined text-[13px]">{low ? 'warning' : 'inventory_2'}</span>
      {med.current_stock} {med.stock_unit || 'uds'}
      {med.days_remaining != null && ` · ~${med.days_remaining}d`}
    </span>
  );
}

function MedicationCard({ med, canEdit, onEdit, onDelete, onStatusChange, onStockUpdate }) {
  const [editStock, setEditStock] = useState(false);
  const [stockVal, setStockVal] = useState(med.current_stock ?? '');
  const [stockSaving, setStockSaving] = useState(false);
  const cfg = STATUS_CONFIG[med.status] || STATUS_CONFIG.active;

  const handleStockSave = async () => {
    setStockSaving(true);
    await onStockUpdate(med.id, parseInt(stockVal));
    setEditStock(false);
    setStockSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-4 flex flex-col gap-3">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-[15px] text-[#17324d]">{med.name}</p>
            <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
              <span className="material-symbols-outlined text-[13px]">{cfg.icon}</span>
              {cfg.label}
            </span>
            {med.low_stock && (
              <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
                <span className="material-symbols-outlined text-[13px]">warning</span>
                Stock bajo
              </span>
            )}
          </div>
          <p className="text-[13px] text-[#536779] mt-0.5">
            {med.dose} · {FREQUENCY_LABELS[med.frequency] || med.frequency}
          </p>
          {med.schedules?.length > 0 && (
            <p className="text-[12px] text-[#8a909e] mt-0.5">
              Horarios: {med.schedules.join(', ')}
            </p>
          )}
          {med.instructions && (
            <p className="text-[12px] text-[#8a909e] italic mt-0.5">{med.instructions}</p>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(med)}
              className="w-8 h-8 rounded-xl bg-[#0040a1]/10 text-[#0040a1] flex items-center justify-center hover:bg-[#0040a1]/20 transition-all"
              title="Editar"
            >
              <span className="material-symbols-outlined text-[17px]">edit</span>
            </button>
            <button
              onClick={() => onDelete(med)}
              className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all"
              title="Eliminar"
            >
              <span className="material-symbols-outlined text-[17px]">delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Stock + período */}
      <div className="flex flex-wrap items-center gap-2">
        <StockBadge med={med} />
        {med.treatment_start_date && (
          <span className="flex items-center gap-1 text-[11px] text-[#536779] bg-[#f3f3f6] px-2 py-0.5 rounded-full">
            <span className="material-symbols-outlined text-[13px]">date_range</span>
            Desde {med.treatment_start_date}
            {med.treatment_duration_days ? ` · ${med.treatment_duration_days}d` : ' · Indefinido'}
          </span>
        )}
      </div>

      {/* Actualizar stock (inline) */}
      {canEdit && med.current_stock != null && (
        editStock ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={stockVal}
              onChange={e => setStockVal(e.target.value)}
              className="w-24 rounded-xl border border-[#cbd5df] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0040a1]"
            />
            <span className="text-[12px] text-[#536779]">{med.stock_unit || 'uds'}</span>
            <button
              onClick={handleStockSave}
              disabled={stockSaving || stockVal === ''}
              className="h-[30px] px-3 bg-[#0040a1] text-white rounded-xl text-[11px] font-bold disabled:opacity-60"
            >
              {stockSaving ? <Spinner sm /> : 'Guardar'}
            </button>
            <button onClick={() => setEditStock(false)} className="text-[12px] text-[#8a909e] hover:underline">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setStockVal(med.current_stock); setEditStock(true); }}
            className="self-start text-[12px] text-[#0040a1] hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">edit</span>
            Actualizar stock
          </button>
        )
      )}

      {/* Aprobar / rechazar propuesta (solo familia) */}
      {canEdit && med.status === 'proposed' && (
        <div className="flex gap-2 pt-1 border-t border-[#f3f3f6]">
          <p className="text-[12px] text-[#536779] flex-1">Propuesto por el profesional asignado</p>
          <button
            onClick={() => onStatusChange(med.id, 'active')}
            className="h-[30px] px-3 bg-green-600 text-white rounded-xl text-[11px] font-bold hover:bg-green-700"
          >
            Aprobar
          </button>
          <button
            onClick={() => onStatusChange(med.id, 'rejected')}
            className="h-[30px] px-3 bg-red-500 text-white rounded-xl text-[11px] font-bold hover:bg-red-600"
          >
            Rechazar
          </button>
        </div>
      )}

      {/* Suspender / reactivar */}
      {canEdit && med.status === 'active' && (
        <button
          onClick={() => onStatusChange(med.id, 'suspended')}
          className="self-start text-[12px] text-[#737785] hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">pause_circle</span>
          Suspender
        </button>
      )}
      {canEdit && med.status === 'suspended' && (
        <button
          onClick={() => onStatusChange(med.id, 'active')}
          className="self-start text-[12px] text-[#0040a1] hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">play_circle</span>
          Reactivar
        </button>
      )}
    </div>
  );
}

// ── Panel principal ──────────────────────────────────────────────────────────
export default function MedicationsPanel({ record, token, user, onBack }) {
  const isFamily  = user.role === 'family';
  const isNurse   = user.role === 'nurse';
  const canPropose = isNurse || user.role === 'caregiver';

  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | 'propose'
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showAgentChat, setShowAgentChat] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/medications/record/${record.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Error al cargar');
      setMeds(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [record.id]);

  const handleCreate = async data => {
    setSaving(true); setModalError('');
    try {
      const res = await fetch(`/api/medications/record/${record.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Error al guardar');
      const created = await res.json();
      setMeds(prev => [...prev, created]);
      setModalMode(null);
    } catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  };

  const handlePropose = async data => {
    setSaving(true); setModalError('');
    try {
      const res = await fetch(`/api/medications/record/${record.id}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Error al proponer');
      const proposed = await res.json();
      setMeds(prev => [...prev, proposed]);
      setModalMode(null);
    } catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  };

  const handleEdit = async data => {
    setSaving(true); setModalError('');
    try {
      const res = await fetch(`/api/medications/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Error al guardar');
      const updated = await res.json();
      setMeds(prev => prev.map(m => m.id === updated.id ? updated : m));
      setModalMode(null); setEditing(null);
    } catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    try {
      await fetch(`/api/medications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setMeds(prev => prev.filter(m => m.id !== id));
    } catch { /* silencioso */ }
    setConfirmDelete(null);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const res = await fetch(`/api/medications/${id}/status?new_status=${newStatus}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Error');
      const updated = await res.json();
      setMeds(prev => prev.map(m => m.id === updated.id ? updated : m));
    } catch (err) { setError(err.message); }
  };

  const handleStockUpdate = async (id, stock) => {
    try {
      const res = await fetch(`/api/medications/${id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_stock: stock }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Error');
      const updated = await res.json();
      setMeds(prev => prev.map(m => m.id === updated.id ? updated : m));
    } catch (err) { setError(err.message); }
  };

  const filtered = activeFilter === 'all'
    ? meds
    : meds.filter(m => m.status === activeFilter);

  const lowStockCount  = meds.filter(m => m.low_stock && m.status === 'active').length;
  const pendingCount   = meds.filter(m => m.status === 'proposed').length;

  return (
    <div className="flex flex-col h-full">
      {/* Barra unificada: volver + paciente + alertas + filtros + acciones */}
      <div className="px-4 py-2.5 border-b border-[#c3c6d6]/30 bg-white shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2">

        {/* Izquierda: volver + nombre + alertas */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onBack && (
            <button onClick={onBack} className="text-[#0040a1] hover:underline flex items-center gap-1 text-[13px] font-semibold shrink-0">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Volver
            </button>
          )}
          <h2 className="text-[15px] font-bold text-[#17324d] flex items-center gap-1.5 truncate">
            <span className="material-symbols-outlined text-[#0040a1] text-[18px] shrink-0">medication</span>
            <span className="truncate">{record.patient_name}</span>
            <span className="text-[#737785] font-normal text-[13px] shrink-0">· {record.patient_age} a.</span>
          </h2>
          {lowStockCount > 0 && (
            <span className="inline-flex items-center gap-1 text-red-700 font-semibold text-[12px] shrink-0">
              <span className="material-symbols-outlined text-[14px]">warning</span>
              {lowStockCount} stock bajo
            </span>
          )}
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold text-[12px] shrink-0">
              <span className="material-symbols-outlined text-[14px]">pending</span>
              {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Derecha: filtros + botones de acción */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtros */}
          <div className="flex gap-1">
            {[
              { key: 'all',       label: 'Todos'     },
              { key: 'active',    label: 'Activos'   },
              { key: 'proposed',  label: 'Pendientes'},
              { key: 'suspended', label: 'Suspendidos'},
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`h-[28px] px-2.5 rounded-lg text-[11px] font-semibold transition-all ${
                  activeFilter === f.key
                    ? 'bg-[#0040a1] text-white'
                    : 'bg-[#f3f3f6] text-[#424654] hover:bg-[#dae2ff] hover:text-[#0040a1]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Botones de acción */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowAgentChat(true)}
              className="h-[28px] px-3 bg-gradient-to-r from-[#0040a1] to-[#1a5ccf] text-white rounded-lg text-[11px] font-bold hover:opacity-90 transition-all flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">smart_toy</span>
              IA
            </button>
            {isFamily && (
              <button
                onClick={() => { setEditing(null); setModalError(''); setModalMode('create'); }}
                className="h-[28px] px-3 bg-[#0040a1] text-white rounded-lg text-[11px] font-bold hover:bg-[#003080] transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Agregar
              </button>
            )}
            {canPropose && (
              <button
                onClick={() => { setEditing(null); setModalError(''); setModalMode('propose'); }}
                className="h-[28px] px-3 bg-[#f0f4ff] text-[#0040a1] border border-[#0040a1]/30 rounded-lg text-[11px] font-bold hover:bg-[#dae2ff] transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">add_circle</span>
                Proponer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="material-symbols-outlined text-[48px] text-[#c3c6d6] mb-3">medication</span>
            <p className="text-[16px] font-semibold text-[#424654]">
              {activeFilter === 'all' ? 'No hay medicamentos registrados' : `No hay medicamentos en estado "${activeFilter}"`}
            </p>
            {isFamily && activeFilter === 'all' && (
              <p className="text-[13px] text-[#737785] mt-1">Usa "Agregar" para registrar el primer medicamento</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(med => (
              <MedicationCard
                key={med.id}
                med={med}
                canEdit={isFamily}
                onEdit={m => { setEditing(m); setModalError(''); setModalMode('edit'); }}
                onDelete={setConfirmDelete}
                onStatusChange={handleStatusChange}
                onStockUpdate={handleStockUpdate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal crear/editar/proponer */}
      {(modalMode === 'create' || modalMode === 'edit' || modalMode === 'propose') && (
        <MedicationFormModal
          initial={modalMode === 'edit' ? editing : null}
          isProposal={modalMode === 'propose'}
          onSave={modalMode === 'edit' ? handleEdit : modalMode === 'propose' ? handlePropose : handleCreate}
          onCancel={() => { setModalMode(null); setEditing(null); }}
          saving={saving}
          error={modalError}
        />
      )}

      {/* Modal confirmar eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#071426]/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-red-500 text-[26px]">delete_forever</span>
              </div>
              <div>
                <p className="font-bold text-[16px] text-[#1a1c1e]">Eliminar medicamento</p>
                <p className="text-[13px] text-[#424654]">{confirmDelete.name}</p>
              </div>
            </div>
            <p className="text-[13px] text-[#737785]">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 h-[42px] border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[14px] hover:bg-[#f3f3f6]"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.id)}
                className="flex-1 h-[42px] bg-red-500 text-white rounded-xl font-bold text-[14px] hover:bg-red-600 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agente conversacional */}
      {showAgentChat && (
        <MedicationAgentChat
          record={record}
          token={token}
          user={user}
          onCreateMedication={async (payload) => {
            const endpoint = isFamily
              ? `/api/medications/record/${record.id}`
              : `/api/medications/record/${record.id}/propose`;
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.detail || 'Error al guardar');
            }
            const created = await res.json();
            setMeds(prev => [...prev, created]);
          }}
          onClose={() => setShowAgentChat(false)}
        />
      )}
    </div>
  );
}
