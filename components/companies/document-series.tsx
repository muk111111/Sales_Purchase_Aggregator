'use client'

import useSWR from 'swr'
import { DOC_TYPE_LABELS, fetchSeries } from '@/lib/companies'

export function DocumentSeriesPanel({ companyId }: { companyId: string }) {
  const { data: series, error } = useSWR(['series', companyId], () => fetchSeries(companyId))

  return (
    <section aria-labelledby="series-heading" className="flex flex-col gap-4 rounded-xl border border-[#dedbd2] bg-white p-5 sm:p-6">
      <div>
        <h2 id="series-heading" className="font-heading text-xl font-bold">Document numbering</h2>
        <p className="text-xs leading-relaxed text-[#667078]">
          Numbers are issued on submit and never reused, including after cancellation.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-[#a33b2b]">Could not load series: {error.message}</p>}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {series?.map(row => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f6f4ee] px-4 py-3">
            <dt className="text-sm text-[#667078]">{DOC_TYPE_LABELS[row.doc_type]}</dt>
            <dd className="font-mono text-sm font-semibold">
              {row.prefix}
              {row.next_number}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
