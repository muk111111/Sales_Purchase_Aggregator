'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cancelPo } from '@/lib/purchases'

export function CancelPoDialog({
  po,
  onClose,
  onCancelled,
}: {
  po: { id: string; number: string } | null
  onClose: () => void
  onCancelled: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (po && !dialog.open) dialog.showModal()
    if (!po && dialog.open) dialog.close()
  }, [po])

  const close = () => {
    setReason('')
    setError('')
    onClose()
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!po) return
    setSaving(true)
    setError('')
    try {
      await cancelPo(po.id, reason)
      setReason('')
      onCancelled()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel the PO')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      aria-labelledby="cancel-po-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-[#dedbd2] bg-white p-0 text-[#142033] backdrop:bg-[#142033]/50"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <h2 id="cancel-po-title" className="font-heading text-xl font-bold">
          Cancel {po?.number}?
        </h2>
        <p className="text-sm leading-relaxed text-[#667078]">
          The PO number stays used and the document is kept with a Cancelled stamp. This can&apos;t be undone.
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">Reason</span>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={event => setReason(event.target.value)}
            className="w-full rounded-lg border border-[#dedbd2] px-3 py-2 text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-lg border border-[#f0c4bd] bg-[#fdf0ee] px-3 py-2 text-sm text-[#a33b2b]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="min-h-11 rounded-lg border border-[#dedbd2] px-4 text-sm font-semibold">
            Keep PO
          </button>
          <button
            type="submit"
            disabled={saving || !reason.trim()}
            className="min-h-11 rounded-lg bg-[#a33b2b] px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Cancelling…' : 'Cancel PO'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
