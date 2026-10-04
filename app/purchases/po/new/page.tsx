import { NewPo } from '@/components/purchases/new-po'

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams
  return <NewPo fromId={from ?? null} />
}
