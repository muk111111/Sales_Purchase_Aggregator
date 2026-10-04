import { PO_STATUS_LABELS, type PoStatus } from '@/lib/purchases'

const STYLES: Record<PoStatus, string> = {
  CREATED: 'bg-[#fdf5e6] text-[#8a5a06] ring-[#e8d3a8]',
  PI_CREATED: 'bg-[#eaf5ee] text-[#23714a] ring-[#b7d6c5]',
  CANCELLED: 'bg-[#fdf0ee] text-[#a33b2b] ring-[#f0c4bd]',
}

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ${STYLES[status]}`}>
      {PO_STATUS_LABELS[status]}
    </span>
  )
}
