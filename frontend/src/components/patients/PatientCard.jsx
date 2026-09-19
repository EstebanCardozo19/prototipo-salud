import { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import { getMobilityLabel } from '../../utils/helpers';

// ── Tarjeta de paciente ──────────────────────────────────────
export default function PatientCard({ record, onEdit, onDelete }) {
  const { t, lang } = useLang();
  const [expanded, setExpanded] = useState(false);
  const mobility = getMobilityLabel(record.mobility_level, lang);

  return (
    <div className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm hover:shadow-md hover:border-[#0040a1]/30 transition-all overflow-hidden">

      {/* Cabecera */}
      <div className="p-4 sm:p-5 flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#dae2ff] to-[#c5d0f5] text-[#0040a1] flex items-center justify-center text-xl font-bold shrink-0">
          {record.patient_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[16px] text-[#1a1c1e] truncate">{record.patient_name}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="flex items-center gap-1 text-[12px] text-[#424654] bg-[#f3f3f6] px-2.5 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-[13px]">cake</span>{record.patient_age} {t('patients.years')}
            </span>
            {record.blood_type && (
              <span className="bg-red-50 text-red-600 text-[11px] font-bold px-2 py-0.5 rounded-full border border-red-100">
                {record.blood_type}
              </span>
            )}
            {record.mobility_level && (
              <span className="bg-[#f3f3f6] text-[#424654] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                {mobility}
              </span>
            )}
          </div>
          {/* Pills rápidos */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {record.eps && (
              <span className="flex items-center gap-1 text-[11px] text-[#0040a1] bg-[#0040a1]/10 px-2.5 py-0.5 rounded-full font-semibold">
                <span className="material-symbols-outlined text-[12px]">health_and_safety</span>{record.eps}
              </span>
            )}
            {record.address && (
              <span className="flex items-center gap-1 text-[11px] text-[#424654] bg-[#f3f3f6] px-2.5 py-0.5 rounded-full border border-[#c3c6d6]/40">
                <span className="material-symbols-outlined text-[12px]">location_on</span>
                {record.neighborhood || record.city || record.address}
                {record.is_apartment && ` · ${t('patients.apartmentLabel')}`}
                {record.floor_number ? ` · ${t('patients.floorLabel')} ${record.floor_number}` : ''}
              </span>
            )}
            {record.diagnoses?.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-orange-700 bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-100">
                <span className="material-symbols-outlined text-[12px]">monitor_heart</span>
                {record.diagnoses.length} {record.diagnoses.length !== 1 ? t('patients.diagnoses_countPl') : t('patients.diagnoses_count')}
              </span>
            )}
          </div>
        </div>
        {/* Acciones */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onEdit}
            className="w-9 h-9 rounded-xl bg-[#0040a1]/10 text-[#0040a1] flex items-center justify-center hover:bg-[#0040a1]/20 transition-all"
            title={t('patients.editRecord')}
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button
            onClick={onDelete}
            className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all"
            title={t('patients.deleteRecord')}
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>

      {/* Toggle detalles */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-2.5 flex items-center justify-between border-t border-[#c3c6d6]/30 text-[12px] font-semibold text-[#0040a1] hover:bg-[#f9f9fc] transition-colors"
      >
        <span>{expanded ? t('patients.hideDetails') : t('patients.viewDetails')}</span>
        <span className="material-symbols-outlined text-[17px]">{expanded ? 'expand_less' : 'expand_more'}</span>
      </button>

      {/* Detalle expandido */}
      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-4 border-t border-[#c3c6d6]/30 bg-[#fafafa]">

          {(record.diagnoses?.length > 0 || record.medications?.length > 0 || record.allergies?.length > 0) && (
            <div className="pt-4 flex flex-col gap-3">
              <p className="text-[10px] font-bold text-[#737785] uppercase tracking-widest">{t('patients.medicalCondition')}</p>
              {record.diagnoses?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#424654] mb-1.5">{t('patients.diagnoses')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {record.diagnoses.map((d, i) => (
                      <span key={i} className="bg-orange-50 text-orange-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-orange-100">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {record.medications?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#424654] mb-1.5">{t('patients.medications')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {record.medications.map((m, i) => (
                      <span key={i} className="bg-blue-50 text-blue-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-blue-100">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {record.allergies?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#424654] mb-1.5">{t('patients.allergies')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {record.allergies.map((a, i) => (
                      <span key={i} className="bg-red-50 text-red-600 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-red-100">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {record.specialNeeds || record.special_needs ? (
            <div>
              <p className="text-[10px] font-bold text-[#737785] uppercase tracking-widest mb-1.5">{t('patients.specialNeeds')}</p>
              <p className="text-[13px] text-[#424654] bg-white rounded-xl p-3 border border-[#c3c6d6]/30 italic">{record.special_needs || record.specialNeeds}</p>
            </div>
          ) : null}

          {(record.address || record.housing_notes) && (
            <div>
              <p className="text-[10px] font-bold text-[#737785] uppercase tracking-widest mb-2">{t('patients.housing')}</p>
              <div className="bg-white rounded-xl p-3 border border-[#c3c6d6]/30 flex flex-col gap-1.5 text-[13px] text-[#424654]">
                {record.address && (
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-[#0040a1]/50">location_on</span>
                    {record.address}{record.neighborhood ? `, ${record.neighborhood}` : ''}{record.city ? `, ${record.city}` : ''}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {record.floor_number && <span className="bg-[#f3f3f6] px-2.5 py-0.5 rounded-full text-[12px]">{t('patients.floorLabel')} {record.floor_number}</span>}
                  {record.is_apartment && <span className="bg-[#f3f3f6] px-2.5 py-0.5 rounded-full text-[12px]">{t('patients.apartmentLabel')}</span>}
                  {record.has_elevator && <span className="bg-[#f3f3f6] px-2.5 py-0.5 rounded-full text-[12px]">{t('patients.elevatorLabel')}</span>}
                </div>
                {record.housing_notes && <span className="text-[12px] italic text-[#737785]">{record.housing_notes}</span>}
              </div>
            </div>
          )}

          {(record.eps || record.prepaid_medicine || record.preferred_hospital) && (
            <div>
              <p className="text-[10px] font-bold text-[#737785] uppercase tracking-widest mb-2">{t('patients.socialSecurity')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {record.eps && (
                  <div className="bg-white rounded-xl p-3 border border-[#c3c6d6]/30">
                    <p className="text-[10px] font-bold text-[#737785] uppercase mb-0.5">{t('patients.eps')}</p>
                    <p className="text-[13px] font-semibold text-[#1a1c1e]">{record.eps}</p>
                  </div>
                )}
                {record.prepaid_medicine && (
                  <div className="bg-white rounded-xl p-3 border border-[#c3c6d6]/30">
                    <p className="text-[10px] font-bold text-[#737785] uppercase mb-0.5">{t('patients.prepaidLabel')}</p>
                    <p className="text-[13px] font-semibold text-[#1a1c1e]">{record.prepaid_medicine}</p>
                  </div>
                )}
                {record.preferred_hospital && (
                  <div className="bg-white rounded-xl p-3 border border-[#c3c6d6]/30 sm:col-span-2">
                    <p className="text-[10px] font-bold text-[#737785] uppercase mb-0.5">{t('patients.preferredHospLabel')}</p>
                    <p className="text-[13px] font-semibold text-[#1a1c1e]">{record.preferred_hospital}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {record.emergency_contact && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-red-500 text-[20px] shrink-0">emergency</span>
              <div>
                <p className="text-[10px] font-bold text-red-400 uppercase">{t('patients.emergencyLabel')}</p>
                <p className="text-[13px] font-semibold text-red-700">{record.emergency_contact}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
