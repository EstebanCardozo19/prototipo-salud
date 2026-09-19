/**
 * StarRating — Componente reutilizable de calificación de 1-5 estrellas.
 *
 * Props:
 *   value      {number}   Rating actual (1–5). Default 5.
 *   onChange   {fn}       Si se pasa, las estrellas son interactivas.
 *   size       {string}   'sm' | 'md' | 'lg'  (default 'md')
 *   showValue  {boolean}  Muestra el número al lado (default false)
 *   count      {number}   Cantidad de reseñas (se muestra entre paréntesis)
 *   readOnly   {boolean}  Fuerza sólo lectura aunque onChange exista
 */
export default function StarRating({
  value = 5,
  onChange,
  size = 'md',
  showValue = false,
  count,
  readOnly = false,
}) {
  const interactive = !!onChange && !readOnly;

  const sizeMap = {
    sm: { star: 'text-[14px]', text: 'text-[12px]', gap: 'gap-0.5' },
    md: { star: 'text-[20px]', text: 'text-[14px]', gap: 'gap-1'   },
    lg: { star: 'text-[28px]', text: 'text-[18px]', gap: 'gap-1.5' },
  };
  const { star, text, gap } = sizeMap[size] || sizeMap.md;

  return (
    <div className={`flex items-center ${gap}`}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onChange(n)}
          className={`leading-none transition-transform ${
            interactive ? 'hover:scale-125 cursor-pointer' : 'cursor-default'
          }`}
          aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
        >
          <span
            className={`material-symbols-outlined ${star} ${
              n <= Math.round(value) ? 'text-amber-400' : 'text-[#d1d5db]'
            }`}
            style={{ fontVariationSettings: n <= Math.round(value) ? "'FILL' 1" : "'FILL' 0" }}
          >
            star
          </span>
        </button>
      ))}
      {showValue && (
        <span className={`font-bold text-amber-600 ml-1 ${text}`}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
      )}
      {count != null && (
        <span className={`text-[#737785] ml-0.5 ${text}`}>({count})</span>
      )}
    </div>
  );
}
