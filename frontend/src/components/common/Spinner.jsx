// ─── Spinner ────────────────────────────────────────────────
export default function Spinner({ sm }) {
  const sz = sm ? 'w-4 h-4 border-2' : 'w-8 h-8 border-4';
  return (
    <div className={`${sz} border-[#0040a1]/20 border-t-[#0040a1] rounded-full animate-spin inline-block`} />
  );
}
