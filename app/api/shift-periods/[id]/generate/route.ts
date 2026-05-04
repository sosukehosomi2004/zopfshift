import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generatePeriod } from '@/lib/generate-period'

export const maxDuration = 300

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await generatePeriod(id)

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.error === 'Not found' ? 404 : 400 },
    )
  }

  return NextResponse.json({
    success: true,
    candidateCount: result.candidateCount,
    errors: result.errors,
    violations: result.violations,
  })
}
