interface StatusBadgeProps {
  status: string;
}

const styles: Record<string, string> = {
  new: 'bg-[#F5F5F7] text-[#6E6E73] border border-[#E5E5EA]',
  analysing: 'bg-[#EBF3FF] text-[#0A84FF] border border-[#D8E9FF]',
  qualified: 'bg-[#ECFDF5] text-[#067647] border border-[#BAF0C4]',
  contacted: 'bg-[#FFF7ED] text-[#C2410C] border border-[#FBD4A8]',
  won: 'bg-[#ECFDF5] text-[#067647] border border-[#BAF0C4]',
  lost: 'bg-[#FDECEC] text-[#B42318] border border-[#F0C5C2]',
  follow_up: 'bg-[#F5F3FF] text-[#6D28D9] border border-[#DDD6FE]',
  high: 'bg-[#EBF3FF] text-[#0A84FF] border border-[#D8E9FF]',
  critical: 'bg-[#FDECEC] text-[#B42318] border border-[#F0C5C2]',
  complete: 'bg-[#ECFDF5] text-[#067647] border border-[#BAF0C4]',
  ok: 'bg-[#ECFDF5] text-[#067647] border border-[#BAF0C4]',
  failed: 'bg-[#FDECEC] text-[#B42318] border border-[#F0C5C2]',
  medium: 'bg-[#FFF7ED] text-[#C2410C] border border-[#FBD4A8]',
  low: 'bg-[#F5F5F7] text-[#6E6E73] border border-[#E5E5EA]',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = status?.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) ?? 'Unknown';
  return (
    <span className={['inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.02em]', styles[status] ?? styles.new].join(' ')}>
      {label}
    </span>
  );
}
