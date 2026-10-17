import { useState, useEffect } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import StarRating from '../common/StarRating';
import RateServiceModal from '../bookings/RateServiceModal';
import CancelServiceModal from '../bookings/CancelServiceModal';
import CancelledServiceCommentModal from '../bookings/CancelledServiceCommentModal';
import PatientCard from './PatientCard';
import PatientFormModal from './PatientFormModal';
import { EMPTY_PATIENT } from '../../constants';

const STATUS_LABEL = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Completado', cancelled: 'Cancelado' };
const STATUS_COLOR = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-blue-100 text-blue-700',
  rejected:  'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-[#f3f3f6] text-[#737785]',
};

// ── Panel principal de familiares ────────────────────────────
export default function FamilyPatientPanel({ token }) {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState('records');

  // Fichas clínicas
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Mis solicitudes
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [ratingModal, setRatingModal] = useState(null);
  const [cancellationModal, setCancellationModal] = useState(null);
  const [cancelledCommentModal, setCancelledCommentModal] = useState(null);

  useEffect(() => { loadRecords(); }, []);
  useEffect(() => { if (activeTab === 'bookings') loadBookings(); }, [activeTab]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clinical-records/', { headers: { Authorization: `Bearer ${token}` } });
      setRecords(res.ok ? await res.json() : []);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };

  const loadBookings = async () => {
    setLoadingBookings(true);
    try {
      const res = await fetch('/api/bookings/my-requests', { headers: { Authorization: `Bearer ${token}` } });
      setBookings(res.ok ? await res.json() : []);
    } catch { setBookings([]); }
    finally { setLoadingBookings(false); }
  };

  const closeModal = () => { setModalMode(null); setEditing(null); setError(''); };

  const handleCreate = async (data) => {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/clinical-records/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Error al crear'); }
      await loadRecords(); closeModal();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (data) => {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/clinical-records/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Error al actualizar'); }
      await loadRecords(); closeModal();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/clinical-records/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setConfirmDelete(null); await loadRecords();
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  const pendingRatings = bookings.filter(b => b.status === 'completed' && !b.reviewed_by_family).length;

  return (
    <div className="flex flex-col h-full bg-[#f3f3f6]">

      {/* Header + tabs */}
      <div className="px-6 sm:px-8 pt-6 bg-white border-b border-[#c3c6d6]/40 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[20px] sm:text-[22px] font-bold text-[#0040a1] flex items-center gap-3">
              <span className="material-symbols-outlined text-[24px]">folder_shared</span>
              {t('patients.title')}
            </h2>
            <p className="text-[13px] text-[#737785] mt-0.5">
              {records.length === 0 ? t('patients.subtitle') : `${records.length} ${records.length !== 1 ? t('patients.registeredPl') : t('patients.registered')}`}
            </p>
          </div>
          {activeTab === 'records' && (
            <button onClick={() => { setError(''); setModalMode('create'); }} className="h-[42px] px-4 sm:px-5 bg-[#0040a1] text-white rounded-xl font-semibold text-[14px] hover:bg-[#003080] transition-all flex items-center gap-2 shadow-md">
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span className="hidden sm:inline">{t('patients.newRecord')}</span>
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {[
            { id: 'records',  icon: 'folder_shared',  label: 'Fichas' },
            { id: 'bookings', icon: 'calendar_month', label: 'Mis solicitudes' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-[#0040a1] text-[#0040a1]' : 'border-transparent text-[#737785] hover:text-[#424654]'}`}>
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
              {tab.id === 'bookings' && pendingRatings > 0 && (
                <span className="ml-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingRatings}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══ TAB: FICHAS ══ */}
      {activeTab === 'records' && (
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-20 h-20 rounded-3xl bg-[#dae2ff] flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[42px] text-[#0040a1]">folder_open</span>
              </div>
              <p className="text-[18px] font-bold text-[#1a1c1e]">{t('patients.noRecords')}</p>
              <p className="text-[14px] text-[#737785] mt-2 mb-7 max-w-sm">{t('patients.noRecordsHint')}</p>
              <button onClick={() => setModalMode('create')} className="h-[46px] px-7 bg-[#0040a1] text-white rounded-xl font-bold text-[15px] hover:bg-[#003080] transition-all flex items-center gap-2 shadow-md">
                <span className="material-symbols-outlined text-[20px]">add</span>
                {t('patients.registerFirst')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
              {records.map(r => (
                <PatientCard key={r.id} record={r} token={token}
                  onEdit={(updatedRecord) => {
                    if (updatedRecord) {
                      setRecords(current => current.map(item => item.id === updatedRecord.id ? updatedRecord : item));
                      return;
                    }
                    setEditing(r); setError(''); setModalMode('edit');
                  }}
                  onDelete={() => setConfirmDelete(r)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: MIS SOLICITUDES ══ */}
      {activeTab === 'bookings' && (
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          {loadingBookings ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="material-symbols-outlined text-[48px] text-[#c3c6d6] mb-3">calendar_month</span>
              <p className="text-[16px] font-semibold text-[#424654]">No tienes solicitudes enviadas</p>
              <p className="text-[13px] text-[#737785] mt-1">Busca un profesional y solicita un servicio</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-2xl">
              {bookings.map(b => (
                <div key={b.id} className="bg-white border border-[#c3c6d6]/50 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-[15px] font-bold text-[#1a1c1e]">{b.professional_name || 'Profesional'}</p>
                      <p className="text-[12px] text-[#737785] capitalize">{b.professional_role} · {b.date} · {b.start_hour}:00 – {b.end_hour}:00 h</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_COLOR[b.status] || 'bg-[#f3f3f6] text-[#737785]'}`}>
                      {STATUS_LABEL[b.status] || b.status}
                    </span>
                  </div>
                  {b.rejection_reason && (
                    <p className="text-[12px] text-red-600 bg-red-50 rounded-xl px-3 py-1.5 mb-2 border border-red-100">
                      Motivo de rechazo: {b.rejection_reason}
                    </p>
                  )}
                  {b.status === 'approved' && <button onClick={() => setCancellationModal(b)} className="mt-1 h-[34px] px-4 bg-red-600 text-white rounded-xl text-[12px] font-semibold hover:bg-red-700 transition-all flex items-center gap-1.5"><span className="material-symbols-outlined text-[15px]">event_busy</span>Cancelar servicio</button>}
                  {b.status === 'cancelled' && <p className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-[#424654]"><b>Cancelado por:</b> {b.cancelled_by_name || '—'}{b.cancellation_reason && <><br /><b>Motivo:</b> {b.cancellation_reason}</>}</p>}
                  {b.status === 'cancelled' && b.cancelled_comments?.length > 0 && <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] text-[#424654]"><b>Comentarios de servicios cancelados</b>{b.cancelled_comments.map(comment => <p key={comment.id} className="mt-1.5"><span className="font-semibold">{comment.author_role === 'family' ? 'Familia' : 'Profesional'}:</span> {comment.comment}</p>)}</div>}
                  {b.status === 'cancelled' && !b.cancelled_comment_by_current_user && <button onClick={() => setCancelledCommentModal(b)} className="mt-2 h-[34px] px-4 bg-[#0040a1] text-white rounded-xl text-[12px] font-semibold hover:bg-[#003080] transition-all flex items-center gap-1.5"><span className="material-symbols-outlined text-[15px]">forum</span>Comentar experiencia</button>}
                  {b.status === 'cancelled' && b.cancelled_comment_by_current_user && <p className="mt-2 text-[12px] font-semibold text-green-700">Ya registraste tu comentario de experiencia.</p>}
                  {b.status === 'completed' && !b.reviewed_by_family && (
                    <button onClick={() => setRatingModal(b)}
                      className="mt-1 h-[34px] px-4 bg-amber-500 text-white rounded-xl text-[12px] font-semibold hover:bg-amber-600 transition-all flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      Calificar profesional
                    </button>
                  )}
                  {b.status === 'completed' && b.reviewed_by_family && (
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-green-700 font-semibold">
                      <span className="material-symbols-outlined text-[15px]">check_circle</span>
                      Ya calificaste este servicio
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal formulario ficha */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <PatientFormModal
          initial={modalMode === 'edit' ? editing : EMPTY_PATIENT}
          onSave={modalMode === 'edit' ? handleUpdate : handleCreate}
          onCancel={closeModal}
          saving={saving}
          error={error}
        />
      )}

      {/* Modal confirmar eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(10,15,30,0.65)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-red-500 text-[26px]">delete_forever</span>
              </div>
              <div>
                <p className="font-bold text-[16px] text-[#1a1c1e]">{t('patients.deleteTitle')}</p>
                <p className="text-[13px] text-[#424654]">{confirmDelete.patient_name}</p>
              </div>
            </div>
            <p className="text-[13px] text-[#737785]">{t('patients.deleteMsg')}</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 h-[42px] border border-[#c3c6d6] text-[#424654] rounded-xl font-semibold text-[14px] hover:bg-[#f3f3f6] transition-all">
                {t('common.cancel')}
              </button>
              <button onClick={() => handleDelete(confirmDelete.id)}
                className="flex-1 h-[42px] bg-red-500 text-white rounded-xl font-bold text-[14px] hover:bg-red-600 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">delete</span>{t('patients.deleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal calificación */}
      {ratingModal && (
        <RateServiceModal
          booking={ratingModal}
          token={token}
          role="family"
          onClose={() => setRatingModal(null)}
          onSuccess={() => {
            setBookings(prev => prev.map(b => b.id === ratingModal.id ? { ...b, reviewed_by_family: true } : b));
            setRatingModal(null);
          }}
        />
      )}
      {cancellationModal && <CancelServiceModal booking={cancellationModal} token={token} onClose={() => setCancellationModal(null)} onSuccess={updated => { setBookings(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item)); setCancellationModal(null); }} />}
      {cancelledCommentModal && <CancelledServiceCommentModal booking={cancelledCommentModal} token={token} onClose={() => setCancelledCommentModal(null)} onSuccess={async () => { setCancelledCommentModal(null); await loadBookings(); }} />}
    </div>
  );
}
