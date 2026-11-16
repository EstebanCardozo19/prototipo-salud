import { useEffect, useRef, useState } from 'react';
import Spinner from '../common/Spinner';

/** Plan documental del servicio — notas y archivos adjuntos.
 *
 * Profesional (caregiver/nurse):
 *   - Escribe notas de texto y/o adjunta PDF/imágenes.
 *   - Puede eliminar sus propias notas.
 *
 * Familiar:
 *   - Ve todas las notas y puede descargar los archivos.
 */
export default function ServiceCarePlanModal({ booking, user, token, onClose }) {
  const canEdit = ['caregiver', 'nurse'].includes(user.role) &&
    booking.professional_user_id === user.id;

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/service-care-plans/${booking.id}/notes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible cargar las notas');
      setNotes(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [booking.id]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!noteText.trim() && !file) return;
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      if (noteText.trim()) form.append('note_text', noteText.trim());
      if (file) form.append('file', file);
      const res = await fetch(`/api/service-care-plans/${booking.id}/notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible guardar la nota');
      const created = await res.json();
      setNotes(prev => [...prev, created]);
      setNoteText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async noteId => {
    setDeleting(noteId);
    try {
      const res = await fetch(`/api/service-care-plans/notes/${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'No fue posible eliminar la nota');
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const downloadFile = async note => {
    try {
      const res = await fetch(note.download_url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('No fue posible descargar el archivo');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = note.original_filename || 'archivo';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const isImage = ct => ct && ct.startsWith('image/');

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#071426]/60 p-2 sm:p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[95vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <header className="flex items-start justify-between border-b border-[#dce3eb] px-5 py-4 shrink-0">
          <div>
            <h2 className="flex items-center gap-2 text-[17px] font-bold text-[#17324d]">
              <span className="material-symbols-outlined text-[#0040a1]">edit_note</span>
              Notas del servicio
            </h2>
            <p className="mt-0.5 text-[12px] text-[#5d6875]">
              {booking.patient_name || 'Paciente'} · {booking.date}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#536779] hover:bg-[#edf2f6]">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </p>
          )}

          {/* Formulario de nueva nota — solo profesional asignado */}
          {canEdit && (
            <form onSubmit={handleSubmit} className="rounded-2xl border border-[#dce3eb] p-4 flex flex-col gap-3 bg-[#f9fbff]">
              <h3 className="text-[14px] font-bold text-[#17324d] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-[#0040a1]">add_circle</span>
                Agregar nota
              </h3>

              {/* Texto */}
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
                maxLength={3000}
                placeholder="Escribe una nota sobre el servicio (observaciones, evolución, indicaciones…)"
                className="w-full rounded-xl border border-[#cbd5df] p-3 text-[13px] focus:outline-none focus:border-[#0040a1] resize-none"
              />

              {/* Adjuntar archivo */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 h-[34px] px-3 rounded-xl border border-[#c3c6d6] text-[12px] font-semibold text-[#424654] hover:border-[#0040a1] hover:text-[#0040a1] transition-all bg-white"
                >
                  <span className="material-symbols-outlined text-[16px]">attach_file</span>
                  {file ? file.name.slice(0, 24) + (file.name.length > 24 ? '…' : '') : 'Adjuntar PDF / imagen'}
                </button>
                {file && (
                  <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-[11px] text-red-500 hover:underline">
                    Quitar
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </div>

              <button
                type="submit"
                disabled={saving || (!noteText.trim() && !file)}
                className="self-start rounded-xl bg-[#0040a1] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#003080] disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving ? <><Spinner sm />Guardando…</> : <><span className="material-symbols-outlined text-[16px]">save</span>Guardar nota</>}
              </button>
            </form>
          )}

          {/* Lista de notas */}
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center text-[#8a909e]">
              <span className="material-symbols-outlined text-[42px] text-[#c3c6d6] mb-2">edit_note</span>
              <p className="text-[14px] font-semibold">Sin notas registradas</p>
              <p className="text-[12px] mt-1">
                {canEdit ? 'Agrega la primera nota del servicio arriba.' : 'El profesional aún no ha registrado notas para este servicio.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {notes.map(note => (
                <div key={note.id} className="rounded-2xl border border-[#dce3eb] bg-white p-4 flex flex-col gap-2.5">
                  {/* Fecha */}
                  <p className="text-[10px] text-[#8a909e]">
                    {note.created_at
                      ? new Date(note.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </p>

                  {/* Texto de la nota */}
                  {note.note_text && (
                    <p className="text-[13px] text-[#17324d] leading-relaxed whitespace-pre-wrap">{note.note_text}</p>
                  )}

                  {/* Archivo adjunto */}
                  {note.download_url && (
                    <div className="flex items-center gap-3 rounded-xl bg-[#f3f3f6] border border-[#dce3eb] px-3 py-2">
                      <span className="material-symbols-outlined text-[20px] text-[#0040a1]/60">
                        {isImage(note.content_type) ? 'image' : 'picture_as_pdf'}
                      </span>
                      <span className="flex-1 min-w-0 text-[12px] text-[#17324d] truncate font-medium">
                        {note.original_filename}
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadFile(note)}
                        className="shrink-0 flex items-center gap-1 text-[12px] font-semibold text-[#0040a1] hover:underline"
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                        Descargar
                      </button>
                    </div>
                  )}

                  {/* Eliminar — solo profesional */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      disabled={deleting === note.id}
                      className="self-end flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 disabled:opacity-50"
                    >
                      {deleting === note.id ? <Spinner sm /> : <span className="material-symbols-outlined text-[15px]">delete</span>}
                      Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
