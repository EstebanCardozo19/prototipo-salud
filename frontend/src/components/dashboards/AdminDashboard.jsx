import { useState, useEffect, useMemo, useRef } from 'react';
import { useLang } from '../../contexts/LangContext';
import Spinner from '../common/Spinner';
import { getRoleLabel } from '../../utils/helpers';

// ─── AdminDashboard ──────────────────────────────────────────
export default function AdminDashboard({ token }) {
  const { t, lang } = useLang();
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [pendingFamilies, setPendingFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [documentUrls, setDocumentUrls] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const objectUrls = useRef([]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase();

    return users.filter(user => {
      const matchesSearch = !normalizedSearch || [user.id, user.full_name, user.email]
        .some(value => String(value || '').toLocaleLowerCase().includes(normalizedSearch));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && user.is_active)
        || (statusFilter === 'inactive' && !user.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const pendingProfilesByUserId = useMemo(
    () => new Map(pending.map(profile => [profile.user_id, profile])),
    [pending],
  );

  const verificationLabel = (user) => {
    if (!['caregiver', 'nurse'].includes(user.role)) return 'No aplica';
    if (user.verification_status === 'approved') return 'Verificado';
    if (user.verification_status === 'rejected') return 'Requiere corrección';
    return user.verification_submitted_at ? 'Pendiente de revisión' : 'Borrador: sin documentos enviados';
  };

  const verificationBadge = (user) => {
    if (user.verification_status === 'approved') return 'bg-green-100 text-green-800';
    if (user.verification_status === 'rejected') return 'bg-red-100 text-red-700';
    if (user.verification_submitted_at) return 'bg-amber-100 text-amber-800';
    return 'bg-slate-100 text-slate-700';
  };

  const releaseDocumentUrls = () => {
    objectUrls.current.forEach(URL.revokeObjectURL);
    objectUrls.current = [];
    setDocumentUrls({});
  };

  useEffect(() => () => { objectUrls.current.forEach(URL.revokeObjectURL); }, []);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, pRes, fRes] = await Promise.all([
        fetch('/api/admin/users?limit=100', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/profiles/pending', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/family-verifications/pending', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (pRes.ok) setPending(await pRes.json());
      if (fRes.ok) setPendingFamilies(await fRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const reviewFamily = async (userId, status) => {
    const reason = status === 'rejected' ? window.prompt('Indica el motivo del rechazo de la cédula:') : null;
    if (status === 'rejected' && !reason?.trim()) return;
    const res = await fetch(`/api/admin/family-verifications/${userId}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason }),
    });
    if (res.ok) load();
  };

  const approve = async (id, status) => {
    const reason = status === 'rejected' ? window.prompt('Indica el motivo del rechazo:') : null;
    if (status === 'rejected' && !reason?.trim()) return;
    const response = await fetch(`/api/admin/verifications/${id}/review`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status, reason })
    });
    if (!response.ok) return;
    setSelectedProfile(null);
    releaseDocumentUrls();
    load();
  };

  const openProfile = async (profile) => {
    releaseDocumentUrls();
    setSelectedProfile(profile);
    const imageDocuments = profile.documents.filter(document => /image\/(jpeg|png)/.test(document.content_type || '') || /\.(jpe?g|png)$/i.test(document.original_filename));
    const entries = await Promise.all(imageDocuments.map(async document => {
      try {
        const response = await fetch(document.download_url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return null;
        const url = URL.createObjectURL(await response.blob());
        objectUrls.current.push(url);
        return [document.id, url];
      } catch {
        return null;
      }
    }));
    setDocumentUrls(Object.fromEntries(entries.filter(Boolean)));
  };

  const downloadDocument = async (documentItem) => {
    try {
      const response = await fetch(documentItem.download_url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('No fue posible abrir el documento.');
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a');
      link.href = url;
      link.download = documentItem.original_filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const toggle = async (id) => {
    await fetch(`/api/admin/users/${id}/toggle-active`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    load();
  };

  const updateUserName = async (user) => {
    const full_name = window.prompt('Ingresa el nuevo nombre completo:', user.full_name);
    if (full_name === null || !full_name.trim() || full_name.trim() === user.full_name) return;

    const response = await fetch(`/api/admin/users/${user.id}/full-name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ full_name: full_name.trim() }),
    });
    if (!response.ok) return;
    const updatedUser = await response.json();
    setUsers(currentUsers => currentUsers.map(currentUser => currentUser.id === updatedUser.id ? updatedUser : currentUser));
  };

  const roleBadge = {
    admin: 'bg-gray-800 text-white',
    nurse: 'bg-[#006a61] text-white',
    caregiver: 'bg-[#006a61]/20 text-[#006a61]',
    family: 'bg-[#0040a1]/10 text-[#0040a1]'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8 overflow-y-auto h-full">
      <h2 className="text-[22px] font-bold text-[#0040a1] mb-6 flex items-center gap-3">
        <span className="material-symbols-outlined text-[26px]">admin_panel_settings</span> {t('admin.title')}
      </h2>
      {/* ── Familias pendientes de verificación ── */}
      {pendingFamilies.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold text-[16px] text-[#0040a1] mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">badge</span>
            Cédulas familiares pendientes ({pendingFamilies.length})
          </h3>
          <div className="bg-white rounded-2xl border border-[#0040a1]/20 shadow-sm overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-[#0040a1]/5 text-[#0040a1]">
                <tr>
                  {['Nombre', 'Email', 'Enviado', 'Documento', 'Acciones'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingFamilies.map(f => (
                  <tr key={f.user_id} className="border-t border-[#0040a1]/10">
                    <td className="px-4 py-3 font-medium">{f.full_name}</td>
                    <td className="px-4 py-3 text-[#424654]">{f.email}</td>
                    <td className="px-4 py-3 text-[#737785]">
                      {f.submitted_at ? new Date(f.submitted_at).toLocaleDateString('es-CO') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={f.document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#0040a1] hover:underline text-[12px] font-semibold"
                        onClick={async (e) => {
                          e.preventDefault();
                          try {
                            const res = await fetch(f.document_url, { headers: { Authorization: `Bearer ${token}` } });
                            if (!res.ok) throw new Error();
                            const url = URL.createObjectURL(await res.blob());
                            window.open(url, '_blank');
                          } catch {
                            alert('No fue posible abrir el documento.');
                          }
                        }}
                      >
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        Ver cédula
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => reviewFamily(f.user_id, 'approved')}
                          className="px-3 py-1 bg-green-500 text-white rounded-lg text-[12px] font-semibold hover:bg-green-600 transition-all"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => reviewFamily(f.user_id, 'rejected')}
                          className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-[12px] font-semibold hover:bg-red-200 transition-all"
                        >
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold text-[16px] text-amber-700 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">pending</span> {t('admin.pendingProfiles')} ({pending.length})
          </h3>
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-amber-50 text-amber-800">
                <tr>
                  {[t('admin.colName'), t('admin.colEmail'), t('admin.colLocality'), t('admin.colActions')].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map(p => (
                  <tr key={p.id} className="border-t border-amber-100">
                    <td className="px-4 py-3 font-medium">{p.full_name}<div className="text-[11px] text-[#737785]">{p.role === 'nurse' ? 'Enfermero/a' : 'Cuidador/a'} · {p.experience_years} años</div></td>
                    <td className="px-4 py-3 text-[#424654]">{p.email}</td>
                    <td className="px-4 py-3 text-[#424654]">{p.location}</td>
                    <td className="px-4 py-3"><div className="flex gap-2">
                      <button onClick={() => openProfile(p)} className="px-3 py-1 border border-[#0040a1] text-[#0040a1] rounded-lg text-[12px] font-semibold hover:bg-[#0040a1]/5 transition-all">Ver solicitud</button>
                      <button
                        onClick={() => approve(p.id, 'approved')}
                        className="px-3 py-1 bg-green-500 text-white rounded-lg text-[12px] font-semibold hover:bg-green-600 transition-all"
                      >
                        {t('admin.approve')}
                      </button>
                      <button
                        onClick={() => approve(p.id, 'rejected')}
                        className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-[12px] font-semibold hover:bg-red-200 transition-all"
                      >
                        {t('admin.reject')}
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[16px] text-[#1a1c1e]">{t('admin.users')} ({filteredUsers.length}{filteredUsers.length !== users.length ? ` de ${users.length}` : ''})</h3>
          {(searchTerm || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setRoleFilter('all'); setStatusFilter('all'); }}
              className="text-[12px] font-semibold text-[#0040a1] hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737785] text-[20px] pointer-events-none">search</span>
            <input
              type="search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Buscar por nombre, correo o ID"
              className="w-full h-[42px] pl-10 pr-4 rounded-xl border border-[#c3c6d6] bg-white focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none text-[14px]"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="sr-only" htmlFor="admin-role-filter">Filtrar por rol</label>
            <select
              id="admin-role-filter"
              value={roleFilter}
              onChange={event => setRoleFilter(event.target.value)}
              className="h-[42px] min-w-[150px] px-3 rounded-xl border border-[#c3c6d6] bg-white text-[#424654] text-[14px] focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none"
            >
              <option value="all">Todos los roles</option>
              {['family', 'caregiver', 'nurse', 'admin'].map(role => (
                <option key={role} value={role}>{getRoleLabel(role, lang)}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="admin-status-filter">Filtrar por estado</label>
            <select
              id="admin-status-filter"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="h-[42px] min-w-[150px] px-3 rounded-xl border border-[#c3c6d6] bg-white text-[#424654] text-[14px] focus:border-[#0040a1] focus:ring-2 focus:ring-[#0040a1]/15 focus:outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#f3f3f6] text-[#424654]">
            <tr>
              {[t('admin.colId'), t('admin.colName'), t('admin.colEmail'), t('admin.colRole'), 'Verificación', 'Cuenta activa', t('admin.colAction')].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(u => (
              <tr key={u.id} className="border-t border-[#c3c6d6]/30 hover:bg-[#f9f9fc] transition-colors">
                <td className="px-4 py-3 text-[#424654]">{u.id}</td>
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-[#424654]">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${roleBadge[u.role] || 'bg-gray-100 text-gray-600'}`}>
                    {getRoleLabel(u.role, lang)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${verificationBadge(u)}`}>
                    {verificationLabel(u)}
                  </span>
                </td>
                <td className="px-4 py-3">{u.is_active ? '✅' : '❌'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {pendingProfilesByUserId.has(u.id) && (
                      <button
                        type="button"
                        onClick={() => openProfile(pendingProfilesByUserId.get(u.id))}
                        className="px-3 py-1 border border-amber-500 text-amber-800 rounded-lg text-[12px] font-semibold hover:bg-amber-50 transition-all"
                      >
                        Ver documentos y autorizar
                      </button>
                    )}
                    <button
                      onClick={() => updateUserName(u)}
                      className="px-3 py-1 border border-[#0040a1] text-[#0040a1] rounded-lg text-[12px] font-semibold hover:bg-[#0040a1]/5 transition-all"
                    >
                      Editar nombre
                    </button>
                    <button
                      onClick={() => toggle(u.id)}
                      className="px-3 py-1 border border-[#c3c6d6] text-[#424654] rounded-lg text-[12px] font-semibold hover:bg-[#f3f3f6] transition-all"
                    >
                      {u.is_active ? t('admin.deactivate') : t('admin.activate')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[#737785]">
                  <span className="material-symbols-outlined block text-[30px] mb-2">search_off</span>
                  No se encontraron usuarios con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedProfile && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(10,15,30,0.65)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between gap-4 border-b border-[#e2e8f0] pb-4 mb-5">
              <div><p className="text-[12px] font-bold text-[#0040a1] uppercase">Solicitud de verificación</p><h3 className="text-xl font-bold text-[#1a1c1e]">{selectedProfile.full_name}</h3><p className="text-sm text-[#424654]">{selectedProfile.email} · {selectedProfile.role === 'nurse' ? 'Enfermero/a' : 'Cuidador/a'}</p></div>
              <button onClick={() => { setSelectedProfile(null); releaseDocumentUrls(); }} className="text-[#424654] hover:text-[#1a1c1e]"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="grid md:grid-cols-2 gap-5 text-[13px]">
              <div className="rounded-xl bg-[#f8fafc] border border-[#e2e8f0] p-4 space-y-2"><h4 className="font-bold text-[#1a1c1e]">Información del perfil</h4><p><b>Localidad:</b> {selectedProfile.location || 'No indicada'}</p><p><b>Experiencia:</b> {selectedProfile.experience_years} años</p><p><b>Tarifa por hora:</b> ${selectedProfile.profile_data.hourly_rate || 0}</p>{selectedProfile.role === 'nurse' ? <><p><b>Especialidad:</b> {selectedProfile.profile_data.specialty || 'No indicada'}</p><p><b>Licencia:</b> {selectedProfile.profile_data.license_number || 'No indicada'}</p><p><b>Institución:</b> {selectedProfile.profile_data.institution || 'No indicada'}</p></> : <p><b>Especialidades:</b> {(selectedProfile.profile_data.specialties || []).join(', ') || 'No indicadas'}</p>}</div>
              <div className="rounded-xl bg-[#f8fafc] border border-[#e2e8f0] p-4"><h4 className="font-bold text-[#1a1c1e] mb-2">Biografía</h4><p className="text-[#424654] whitespace-pre-wrap">{selectedProfile.profile_data.bio || 'No indicada'}</p></div>
            </div>
            <h4 className="font-bold text-[#1a1c1e] mt-6 mb-3">Documentos adjuntos ({selectedProfile.documents.length})</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{selectedProfile.documents.map(documentItem => <div key={documentItem.id} className="border border-[#e2e8f0] rounded-xl overflow-hidden bg-white"><div className="h-36 bg-[#f3f3f6] flex items-center justify-center">{documentUrls[documentItem.id] ? <img src={documentUrls[documentItem.id]} alt={documentItem.document_name || documentItem.document_type} className="w-full h-full object-contain" /> : <span className="material-symbols-outlined text-[40px] text-[#737785]">description</span>}</div><div className="p-3"><p className="font-semibold truncate">{documentItem.document_name || documentItem.document_type}</p><p className="text-[11px] text-[#737785] truncate mb-2">{documentItem.original_filename}</p><button onClick={() => downloadDocument(documentItem)} className="text-[12px] text-[#0040a1] font-semibold hover:underline">Descargar / abrir</button></div></div>)}</div>
            <div className="flex gap-3 mt-6"><button onClick={() => approve(selectedProfile.id, 'approved')} className="px-4 py-2 bg-green-500 text-white rounded-lg text-[13px] font-semibold hover:bg-green-600">{t('admin.approve')}</button><button onClick={() => approve(selectedProfile.id, 'rejected')} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg text-[13px] font-semibold hover:bg-red-200">{t('admin.reject')}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
