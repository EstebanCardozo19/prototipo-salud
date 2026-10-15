import { useState } from 'react';
import { useLang } from '../../contexts/LangContext';

/** Texto autorizado por la familia para evaluar una solicitud de servicio. */
export default function BookingDescription({ description }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);

  if (!description) return null;

  return (
    <div className="mb-3 rounded-xl border border-[#c3c6d6]/30 bg-[#f9f9fc] px-3 py-2">
      <p className={`whitespace-pre-wrap break-words text-[13px] text-[#424654] ${expanded ? '' : 'line-clamp-2'}`}>
        {description}
      </p>
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        className="mt-2 min-h-9 text-left text-[12px] font-semibold text-[#0040a1] underline underline-offset-2 hover:text-[#003080] focus:outline-none focus:ring-2 focus:ring-[#0040a1]/30 rounded"
      >
        {expanded ? t('booking.hideFullDescription') : t('booking.viewFullDescription')}
      </button>
    </div>
  );
}