import { useMemo, useState } from 'react';
import { useLang } from '../../contexts/LangContext';

const DAYS = { es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };
const keyFor = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const hour = value => {
  const text = String(value ?? '');
  return text.includes(':') ? text.slice(0, 5) : `${text.padStart(2, '0')}:00`;
};
const monday = date => { const value = new Date(date); value.setHours(0, 0, 0, 0); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return value; };

export default function CalendarSchedule({ bookings, statusClasses, renderLabel, onSelect }) {
  const { t, lang } = useLang();
  const [view, setView] = useState('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const byDate = useMemo(() => bookings.reduce((result, booking) => { (result[booking.date] ||= []).push(booking); return result; }, {}), [bookings]);
  const locale = lang === 'en' ? 'en-US' : 'es-CO';
  const periodDays = useMemo(() => {
    if (view === 'day') return [new Date(currentDate)];
    if (view === 'week') { const start = monday(currentDate); return Array.from({ length: 7 }, (_, i) => { const date = new Date(start); date.setDate(start.getDate() + i); return date; }); }
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const start = monday(first);
    return Array.from({ length: 42 }, (_, i) => { const date = new Date(start); date.setDate(start.getDate() + i); return date; });
  }, [currentDate, view]);
  const title = view === 'month'
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(currentDate)
    : view === 'week'
      ? `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(periodDays[0])} – ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(periodDays[6])}`
      : new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(currentDate);
  const move = direction => setCurrentDate(value => {
    const next = new Date(value);
    if (view === 'month') next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + (view === 'week' ? direction * 7 : direction));
    return next;
  });
  const event = booking => <button key={booking.id} onClick={() => onSelect(booking)} className={`w-full rounded-md px-2 py-1.5 text-left text-[11px] font-semibold ${statusClasses[booking.status] || statusClasses.pending}`}><span>{hour(booking.start_hour)}</span><span className="ml-1">· {renderLabel(booking)}</span></button>;

  return <main className="bg-white rounded-2xl border border-[#c3c6d6]/40 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-[#c3c6d6]/40 flex flex-wrap justify-between items-center gap-3">
      <div className="flex bg-[#f3f3f6] p-1 rounded-xl">{['month', 'week', 'day'].map(mode => <button key={mode} onClick={() => setView(mode)} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold ${view === mode ? 'bg-white text-[#0040a1] shadow-sm' : 'text-[#424654]'}`}>{t(`calendar.view${mode[0].toUpperCase()}${mode.slice(1)}`)}</button>)}</div>
      <div className="flex items-center gap-2"><button aria-label={t('calendar.previousPeriod')} onClick={() => move(-1)} className="w-9 h-9 rounded-xl hover:bg-[#f3f3f6] text-[#0040a1]"><span className="material-symbols-outlined">chevron_left</span></button><h2 className="capitalize font-bold text-[14px] sm:text-[17px] text-center min-w-[150px]">{title}</h2><button aria-label={t('calendar.nextPeriod')} onClick={() => move(1)} className="w-9 h-9 rounded-xl hover:bg-[#f3f3f6] text-[#0040a1]"><span className="material-symbols-outlined">chevron_right</span></button></div>
    </div>
    {view === 'month' ? <><div className="grid grid-cols-7 bg-[#f9f9fc] border-b border-[#c3c6d6]/40">{(DAYS[lang] || DAYS.es).map(day => <div key={day} className="py-2 text-center text-[11px] font-bold text-[#737785] uppercase">{day}</div>)}</div><div className="grid grid-cols-7">{periodDays.map(day => <div key={keyFor(day)} className={`min-h-[105px] sm:min-h-[120px] border-r border-b border-[#c3c6d6]/30 p-1.5 ${day.getMonth() === currentDate.getMonth() ? '' : 'bg-[#f9f9fc]'}`}><span className={`w-6 h-6 flex items-center justify-center text-[12px] font-semibold rounded-full ${keyFor(day) === keyFor(new Date()) ? 'bg-[#0040a1] text-white' : ''}`}>{day.getDate()}</span><div className="mt-1 space-y-1">{(byDate[keyFor(day)] || []).slice(0, 2).map(event)}</div>{(byDate[keyFor(day)] || []).length > 2 && <p className="text-[10px] px-1 text-[#737785]">+{byDate[keyFor(day)].length - 2} {t('calendar.more')}</p>}</div>)}</div></> : <div className={`grid ${view === 'week' ? 'grid-cols-1 md:grid-cols-7' : 'grid-cols-1'} min-h-[480px]`}>{periodDays.map(day => <section key={keyFor(day)} className="border-r border-b border-[#c3c6d6]/30"><header className={`p-3 border-b border-[#c3c6d6]/30 text-center text-[12px] font-bold ${keyFor(day) === keyFor(new Date()) ? 'text-[#0040a1]' : 'text-[#424654]'}`}>{view === 'week' ? `${(DAYS[lang] || DAYS.es)[(day.getDay() + 6) % 7]} ${day.getDate()}` : title}</header><div className="p-2 space-y-2">{(byDate[keyFor(day)] || []).sort((a, b) => a.start_hour - b.start_hour).map(event)}{!(byDate[keyFor(day)] || []).length && <p className="text-center pt-8 text-[12px] text-[#737785]">{t('calendar.noServicesThisDay')}</p>}</div></section>)}</div>}
  </main>;
}