import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { expandRecurringRules } from '@/lib/expand-recurring-rules'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const count = await expandRecurringRules(id)
  return NextResponse.json({ expandedCount: count })
}
