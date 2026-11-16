import { useEffect, useMemo, useRef, useState } from 'react';
import Spinner from '../common/Spinner';
import { useToast } from '../../contexts/ToastContext';

const DOCUMENT_LABELS = {
  identity: 'Documento de identidad',
  training: 'Certificado de formación',
  work_reference: 'Referencia laboral',
  professional_license: 'Tarjeta o licencia profesional',
  nursing_degree: 'Título de enfermería',
  additional_certificate: 'Certificado o título adicional',
};

const NAMED_DOCUMENTS = new Set(['training', 'nursing_degree', 'additional_certificate']);

const STATUS = {
  pending: { label: 'En revisión', className: 'bg-amber-100 text-amber-800', icon: 'schedule' },
  approved: { label: 'Verificado', className: 'bg-emerald-100 text-emerald-800', icon: 'verified' },
  rejected: { label: 'Requiere corrección', className: 'bg-red-100 text-red-800', icon: 'error' },
};

async function responseMessage(response, fallback) {
  try {
    const data = await response.json();
    return data.detail || fallback;
  } catch {
    return fallback;
  }
}

export default function VerificationSection({ token, className = '' }) {
  const { success, error } = useToast();
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [documentNames, setDocumentNames] = useState({});
  const inputRefs = useRef({});

  const documentsByType = useMemo(
    () => Object.fromEntries((verification?.documents || []).map(document => [document.document_type, document])),
    [verification],
  );
  const canEdit = !verification?.submitted_at || verification.status === 'rejected';
  // Los certificados adicionales siempre se pueden subir (el backend también lo permite ahora).
  const canAddAdditionalCertificate = true;
  const status = STATUS[verification?.status] || { label: 'Borrador', className: 'bg-[#f3f3f6] text-[#424654]', icon: 'edit_note' };
  const hasDocumentName = documentType => Boolean((documentNames[documentType] || '').trim());

  const loadVerification = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/verification/me', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(await responseMessage(response, 'No fue posible consultar la verificación.'));
      setVerification(await response.json());
    } catch (err) {
      error(err.message || 'No fue posible consultar la verificación.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => { loadVerification(); }, []);

  const handleFile = async (documentType, event, suppliedName) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const documentName = (suppliedName ?? documentNames[documentType] ?? '').trim();
    if (NAMED_DOCUMENTS.has(documentType) && !documentName) {
      error('Indica el nombre del certificado o título antes de cargarlo.');
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      error('El documento debe ser PDF, JPEG o PNG.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      error('El documento no puede superar 10 MB.');
      return;
    }

    setUploading(documentType);
    const formData = new FormData();
    formData.append('file', file);
    if (documentName) formData.append('document_name', documentName);
    try {
      const response = await fetch(`/api/verification/documents/${documentType}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) throw new Error(await responseMessage(response, 'No fue posible cargar el documento.'));
      // Conserva el componente montado y los campos que el profesional ya escribió.
      // Antes esta recarga activaba `loading` y reemplazaba toda la sección por un spinner.
      await loadVerification(false);
      if (documentType === 'additional_certificate') setDocumentNames(current => ({ ...current, additional_certificate: '' }));
      success(`${DOCUMENT_LABELS[documentType] || 'Documento'} cargado correctamente.`);
    } catch (err) {
      error(err.message || 'No fue posible cargar el documento.');
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/verification/submit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await responseMessage(response, 'No fue posible enviar la solicitud.'));
      setVerification(await response.json());
      success(verification?.status === 'rejected' ? 'Solicitud reenviada para revisión.' : 'Solicitud enviada para revisión.');
    } catch (err) {
      error(err.message || 'No fue posible enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="py-4"><Spinner sm /></div>;
  if (!verification) return null;

  const allDocumentsLoaded = verification.required_documents.every(type => documentsByType[type]);
  const missingDocuments = verification.required_documents.filter(type => !documentsByType[type]);
  const documentTypes = verification.required_documents;

  return (
    <section className={`bg-white rounded-lg border border-[#E2E8F0] shadow-sm p-8 flex-1 ${className}`}>
      <div className="flex justify-between items-start mb-8 pb-4 border-b border-[#F1F5F9]">
        <div className="flex items-center gap-3 text-[#002b6c]">
          <span className="material-symbols-outlined text-[28px]">verified_user</span>
          <div>
            <h2 className="text-[20px] leading-[28px] font-semibold">Verificación profesional</h2>
            <p className="text-[14px] text-[#434652] mt-1">
              {verification?.status === 'approved'
                ? 'Tu perfil está verificado. Puedes seguir adjuntando certificados adicionales cuando quieras.'
                : verification?.status === 'pending' && verification?.submitted_at
                ? 'Tu solicitud está en revisión. El administrador validará tu perfil pronto.'
                : 'Carga los documentos requeridos y envía la solicitud para que un administrador valide tu perfil.'}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold ${status.className}`}>
          <span className="material-symbols-outlined text-[16px]">{status.icon}</span>{status.label}
        </span>
      </div>

      {verification.status === 'rejected' && verification.rejection_reason && (
        <div className="mt-4 mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
          <p className="font-bold flex items-center gap-1.5"><span className="material-symbols-outlined text-[17px]">info</span>Motivo de rechazo</p>
          <p className="mt-1">{verification.rejection_reason}</p>
          <p className="mt-2 text-red-700">Corrige o reemplaza los documentos necesarios y reenvía la solicitud.</p>
        </div>
      )}

      {verification.submitted_at && verification.status === 'pending' && (
        <p className="mt-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">Tu solicitud fue enviada y está siendo revisada. No puedes modificar documentos mientras esté pendiente.</p>
      )}

      <div className="space-y-4 mb-8 mt-5">
        {documentTypes.map(documentType => {
          const document = documentsByType[documentType];
          const isUploading = uploading === documentType;
          return (
            <div key={documentType} className={`flex items-center justify-between p-4 rounded-lg border border-[#E2E8F0] transition-colors ${document ? 'bg-[#F8FAFC]' : 'bg-white hover:border-[#c3c6d4]'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${document ? 'bg-emerald-50 text-emerald-600' : 'bg-[#F1F5F9] text-[#434652]'}`}>
                  <span className="material-symbols-outlined" style={document ? { fontVariationSettings: "'FILL' 1" } : {}}>{document ? 'description' : 'upload_file'}</span>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[#1a1c1e]">{document?.document_name || DOCUMENT_LABELS[documentType] || documentType}</h3>
                  {document
                    ? <a href={document.download_url} target="_blank" rel="noreferrer" className="text-[12px] text-[#004099] hover:underline block truncate">{document.original_filename}</a>
                    : <p className="text-[12px] text-[#434652]">Pendiente de cargar</p>}
                </div>
              </div>
              {canEdit && <div className="flex items-center gap-4">
                {NAMED_DOCUMENTS.has(documentType) && <input value={documentNames[documentType] || ''} onChange={event => setDocumentNames(current => ({ ...current, [documentType]: event.target.value }))} maxLength="150" placeholder="Nombre del título o certificado" className="border border-[#c3c6d4] rounded-md px-3 py-1.5 text-[14px] outline-none focus:border-[#004099] w-48 bg-[#F8FAFC]" />}
                <input ref={element => { inputRefs.current[documentType] = element; }} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" disabled={NAMED_DOCUMENTS.has(documentType) && !hasDocumentName(documentType)} onChange={event => handleFile(documentType, event)} />
                <button type="button" disabled={isUploading || (NAMED_DOCUMENTS.has(documentType) && !hasDocumentName(documentType))} onClick={() => inputRefs.current[documentType]?.click()} className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-[14px] font-semibold transition-colors bg-white ${document ? 'border-[#004099] text-[#004099] hover:bg-[#004099]/5' : 'border-[#c3c6d4] text-[#434652] hover:border-[#004099] hover:text-[#004099]'} disabled:opacity-60 disabled:cursor-not-allowed`}>
                  {isUploading ? <Spinner sm /> : <><span className="material-symbols-outlined text-[18px]">{document ? 'refresh' : 'upload'}</span>{document ? 'Reemplazar' : 'Cargar'}</>}
                </button>
              </div>}
            </div>
          );
        })}
      </div>

      <div className="p-6 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] mb-8">
        <h3 className="text-[14px] font-semibold text-[#1a1c1e] mb-2">Certificados o títulos adicionales</h3>
        <p className="text-[12px] text-[#434652] mb-4">Puedes adjuntar todos los certificados, cursos o títulos adicionales que tengas. No son obligatorios para enviar la solicitud.</p>
        {(verification.documents || []).filter(document => document.document_type === 'additional_certificate').map(document => (
          <a key={document.id} href={document.download_url} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-1 text-[12px] text-[#004099] underline">
            <span className="material-symbols-outlined text-[15px]">description</span>{document.document_name || document.original_filename}
          </a>
        ))}
        {canAddAdditionalCertificate && <div className="flex gap-4 mt-2">
          <input value={documentNames.additional_certificate || ''} onChange={event => setDocumentNames(current => ({ ...current, additional_certificate: event.target.value }))} maxLength="150" placeholder="Ej.: Curso de primeros auxilios" className="flex-1 border border-[#c3c6d4] rounded-md px-4 py-2 text-[14px] outline-none focus:border-[#004099] bg-white" />
          <input ref={element => { inputRefs.current.additional_certificate = element; }} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" disabled={!hasDocumentName('additional_certificate')} onChange={event => handleFile('additional_certificate', event)} />
          <button type="button" disabled={uploading === 'additional_certificate' || !hasDocumentName('additional_certificate')} onClick={() => inputRefs.current.additional_certificate?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#004099] text-[#004099] text-[14px] hover:bg-[#004099]/5 transition-colors bg-white whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed">
            {uploading === 'additional_certificate' ? <Spinner sm /> : <><span className="material-symbols-outlined text-[18px]">add</span>Agregar soporte</>}
          </button>
        </div>}
      </div>

      {canEdit && <div className="pt-6 border-t border-[#F1F5F9]">
        <p className="text-[12px] text-[#434652] mb-3 max-w-2xl">Formatos permitidos: PDF, JPEG o PNG. Máximo 10 MB por documento. Completa localidad y biografía en tu perfil antes de enviar.</p>
        {!allDocumentsLoaded && <p className="text-[12px] text-amber-800 mb-6">Faltan documentos requeridos: {missingDocuments.map(type => DOCUMENT_LABELS[type]).join(', ')}.</p>}
        <button type="button" onClick={submit} disabled={!allDocumentsLoaded || submitting || Boolean(uploading)} className="bg-[#004099] text-white px-8 py-3 rounded-lg text-[14px] font-semibold flex items-center gap-2 disabled:opacity-60 disabled:bg-[#8DA3D3] disabled:cursor-not-allowed hover:bg-[#002b6c] transition-colors">
          {submitting ? <Spinner sm /> : <span className="material-symbols-outlined text-[20px]">send</span>}
          {verification.status === 'rejected' ? 'Reenviar solicitud' : 'Enviar solicitud'}
        </button>
      </div>}
    </section>
  );
}