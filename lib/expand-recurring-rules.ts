import { prisma } from '@/lib/prisma'

/**
 * シフト期間に対して、各従業員の通年ルールを PreAssignment として展開する。
 *
 * 既に PreAssignment が存在する (employee, date) のペアは尊重し、上書きしない。
 * ルール由来であってもユーザーが明示的に削除/変更した可能性があるため。
 *
 * 戻り値: 新規作成されたPreAssignment件数
 */
export async function expandRecurringRules(shiftPeriodId: string): Promise<number> {
  const period = await prisma.shiftPeriod.findUnique({
    where: { id: shiftPeriodId },
  })
  if (!period) return 0

  const rules = await prisma.employeeRecurringRule.findMany({
    include: { employee: { select: { id: true, primaryWorkplace: true, isActive: true } } },
  })
  // ※ ルール0件でも承認済み申請を PreAssignment に展開する処理は走る

  // 期間内の祝日を取得
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: period.startDate, lte: period.endDate } },
  })
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().split('T')[0]))

  // 既存の PreAssignment (重複避け)
  const existing = await prisma.preAssignment.findMany({
    where: { shiftPeriodId },
    select: { employeeId: true, date: true },
  })
  const existingKeys = new Set(
    existing.map((p) => `${p.employeeId}|${p.date.toISOString().split('T')[0]}`),
  )

  // 管理者が「事前確定取消」した日付 — 自動再展開しないようスキップ
  const exclusions = await prisma.preAssignmentExclusion.findMany({
    where: { shiftPeriodId },
    select: { employeeId: true, date: true },
  })
  const excludedKeys = new Set(
    exclusions.map((e) => `${e.employeeId}|${e.date.toISOString().split('T')[0]}`),
  )

  // 承認済みの申請 — PreAssignment(休み)として upsert (まだ作られていない場合)
  // ルール展開時にもこれらの日はスキップ (申請優先)
  const dayOffRequests = await prisma.dayOffRequest.findMany({
    where: {
      date: { gte: period.startDate, lte: period.endDate },
      status: 'APPROVED',
    },
    select: { employeeId: true, date: true, type: true, memo: true },
  })
  for (const r of dayOffRequests) {
    const key = `${r.employeeId}|${r.date.toISOString().split('T')[0]}`
    // Exclusion (管理者の取消マーク) があればスキップ
    if (excludedKeys.has(key)) continue
    const memoLabel = r.type === 'PAID_LEAVE' ? '有休' : '公休'
    const memo = r.memo ? `${memoLabel}: ${r.memo}` : memoLabel
    await prisma.preAssignment.upsert({
      where: {
        shiftPeriodId_employeeId_date: {
          shiftPeriodId,
          employeeId: r.employeeId,
          date: r.date,
        },
      },
      update: { workplace: null, memo },
      create: {
        shiftPeriodId,
        employeeId: r.employeeId,
        date: r.date,
        workplace: null,
        memo,
      },
    })
  }
  const requestKeys = new Set(
    dayOffRequests.map((d) => `${d.employeeId}|${d.date.toISOString().split('T')[0]}`),
  )

  // upsertしたPreAssignmentもexistingKeysに反映 (二重作成防止)
  for (const k of Array.from(requestKeys)) existingKeys.add(k)

  // 期間内の全日付を生成
  const dates: Date[] = []
  const cur = new Date(period.startDate)
  const end = new Date(period.endDate)
  while (cur <= end) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }

  const toCreate: Array<{
    shiftPeriodId: string
    employeeId: string
    date: Date
    workplace: 'FACTORY' | 'CAFE' | 'FLOOR' | 'OFFICE' | 'OTHER' | null
    memo: string | null
  }> = []

  for (const rule of rules) {
    if (!rule.employee.isActive) continue
    for (const date of dates) {
      const dateStr = date.toISOString().split('T')[0]
      const key = `${rule.employeeId}|${dateStr}`
      if (existingKeys.has(key)) continue
      // 管理者が取消マークしたセルはルール展開しない
      if (excludedKeys.has(key)) continue
      // 休み申請がある日はスキップ (申請優先)
      if (requestKeys.has(key)) continue

      // 条件マッチ
      let match = false
      if (rule.dayOfWeek !== null) {
        match = date.getDay() === rule.dayOfWeek
        // 祝日除外オプション
        if (match && rule.excludeHolidays && holidaySet.has(dateStr)) {
          match = false
        }
      } else if (rule.dayCategory) {
        const dow = date.getDay()
        const isHol = holidaySet.has(dateStr)
        switch (rule.dayCategory) {
          case 'HOLIDAY':
            match = isHol
            break
          case 'WEEKEND_OR_HOLIDAY':
            match = isHol || dow === 0 || dow === 6
            break
          case 'WEEKDAY':
            match = !isHol && dow >= 1 && dow <= 5
            break
        }
      }
      if (!match) continue

      // アクション展開
      const isOff = rule.ruleType === 'ALWAYS_OFF'
      const workplace = isOff
        ? null
        : (rule.workplace ?? rule.employee.primaryWorkplace) as
            | 'FACTORY'
            | 'CAFE'
            | 'FLOOR'
            | 'OFFICE'
            | 'OTHER'

      toCreate.push({
        shiftPeriodId,
        employeeId: rule.employeeId,
        date,
        workplace,
        memo: rule.memo,
      })
      // 同じ従業員×同じ日に複数ルールがあった場合、最初の1つだけ採用
      existingKeys.add(key)
    }
  }

  if (toCreate.length === 0) return 0
  await prisma.preAssignment.createMany({ data: toCreate })
  return toCreate.length
}
