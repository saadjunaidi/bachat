/** MoneyInMyPocket mark: a stitched pocket with two coins tucked in. Currency-neutral on purpose. */
export function Logo({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} className="logo">
      <rect width="100" height="100" rx="24" fill="#0C7A58" />
      <circle cx="38" cy="37" r="11" fill="#F2C96B" />
      <circle cx="60" cy="33" r="16" fill="#E7B24C" />
      <circle cx="60" cy="33" r="10" fill="none" stroke="#B87C0C" strokeWidth="3" />
      <path d="M19 43h62v23.6a6 6 0 0 1-2.8 5.1L53.2 86.6a6 6 0 0 1-6.4 0L21.8 71.7A6 6 0 0 1 19 66.6z" fill="#FFFFFF" />
      <path d="M27 50h46v14.6L50 78.2 27 64.6z" fill="none" stroke="#0C7A58" strokeWidth="2.6" strokeDasharray="4.2 3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
