import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { generatePeriodWithRetry } from '@/lib/generate-period'

export const maxDuration = 800

const bodySchema = z.object({
  periodIds: z.array(z.string().min(1)).min(1).max(12),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { periodIds } = parsed.data

  const results: {
    periodId: string
    ok: boolean
    attempts: number
    candidateCount?: number
    error?: string
    detail?: string[]
  }[] = []

  // 各期間を順次処理 (並列だとDB負荷とログが混ざるので逐次)
  for (const periodId of periodIds) {
    const result = await generatePeriodWithRetry(periodId, 3)
    if (result.ok) {
      results.push({
        periodId,
        ok: true,
        attempts: result.attempts,
        candidateCount: result.candidateCount,
      })
    } else {
      results.push({
        periodId,
        ok: false,
        attempts: result.attempts,
        error: result.error,
        detail: result.detail,
      })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  const ngCount = results.length - okCount

  return NextResponse.json({
    total: results.length,
    okCount,
    ngCount,
    results,
  })
}
