/**
 * 連続性スコア + SOFT違反カウント
 *
 * 実データ分析から: 3-5連勤・2連休 が中心、1連勤・1連休 は避けたい
 */
import type {
  Anchor,
  DateInfo,
  DayAssignment,
  EmployeeInput,
  SoftViolation,
  StaffingRuleInput,
  StreakStats,
  Workplace,
} from './types'

// ============================================================
// 連勤・連休統計
// ============================================================

export function computeStreakStats(
  employeeId: string,
  assignments: DayAssignment[],
  dateInfos: DateInfo[],
  paidLeaveKeys: Set<string>,
  initialConsecutive: number = 0,
): StreakStats {
  const workMap = new Map<string, Workplace>()
  for (const a of assignments) {
    if (a.employeeId !== employeeId) continue
    if (!a.workplace) continue
    workMap.set(a.date, a.workplace)
  }

  const workStreaks: number[] = []
  const restStreaks: number[] = []
  let consec = initialConsecutive
  let restConsec = 0

  for (const di of dateInfos) {
    const isPaid = paidLeaveKeys.has(`${employeeId}|${di.date}`)
    const isWork = workMap.has(di.date)

    if (isPaid) {
      if (consec > 0) workStreaks.push(consec)
      consec = 0
      restConsec = 0 // 有給は休みでもないので連休もリセット
    } else if (isWork) {
      if (restConsec > 0) restStreaks.push(restConsec)
      restConsec = 0
      consec++
    } else {
      if (consec > 0) workStreaks.push(consec)
      consec = 0
      restConsec++
    }
  }
  if (consec > 0) workStreaks.push(consec)
  if (restConsec > 0) restStreaks.push(restConsec)

  return { workStreaks, restStreaks }
}

// ============================================================
// 連続性スコア
// ============================================================

/** 連勤長さ → スコア */
const W_SCORE: Record<number, number> = {
  1: -2,
  2: -1,
  3: 1,
  4: 1,
  5: 1,
  6: -10, // HARD違反、現実には起きない想定
  7: -20,
}

/** 連休長さ → スコア */
const R_SCORE: Record<number, number> = {
  1: -1,
  2: 1,
  3: -2,
  4: -4,
  5: -8,
}

export function continuityScore(stats: StreakStats): number {
  let score = 0
  for (const w of stats.workStreaks) {
    score += W_SCORE[w] ?? (w >= 7 ? -20 : 0)
  }
  for (const r of stats.restStreaks) {
    score += R_SCORE[r] ?? (r >= 5 ? -8 : 0)
  }
  return score
}

export function totalContinuityScore(
  employees: EmployeeInput[],
  assignments: DayAssignment[],
  dateInfos: DateInfo[],
  paidLeaveKeys: Set<string>,
  initialConsecutive: Record<string, number>,
): number {
  let total = 0
  for (const emp of employees) {
    const stats = computeStreakStats(
      emp.id,
      assignments,
      dateInfos,
      paidLeaveKeys,
      initialConsecutive[emp.id] ?? 0,
    )
    total += continuityScore(stats)
  }
  return total
}

// ============================================================
// SOFT 違反検出
// ============================================================

export function findSoftViolations(
  assignments: DayAssignment[],
  dateInfos: DateInfo[],
  staffingRules: StaffingRuleInput[],
  employees: EmployeeInput[],
): SoftViolation[] {
  const violations: SoftViolation[] = []
  const empMap = new Map(employees.map((e) => [e.id, e]))

  // 各日 × 各 workplace の人数チェック
  for (const di of dateInfos) {
    const countByWp = new Map<Workplace, { total: number; fullTime: number }>()
    for (const a of assignments) {
      if (a.date !== di.date) continue
      if (!a.workplace) continue
      const cur = countByWp.get(a.workplace) ?? { total: 0, fullTime: 0 }
      cur.total++
      const emp = empMap.get(a.employeeId)
      if (emp?.employmentType === 'FULL_TIME') cur.fullTime++
      countByWp.set(a.workplace, cur)
    }

    for (const rule of staffingRules) {
      if (rule.dayType !== di.dayType) continue
      const counts = countByWp.get(rule.workplace) ?? { total: 0, fullTime: 0 }
      if (counts.total < rule.requiredCount) {
        violations.push({
          kind: 'staffing',
          date: di.date,
          workplace: rule.workplace,
          message: `${di.date} ${rule.workplace}: ${counts.total}人 (必要${rule.requiredCount})`,
        })
      }
      if (rule.minFullTimeCount !== null && counts.fullTime < rule.minFullTimeCount) {
        violations.push({
          kind: 'minFullTime',
          date: di.date,
          workplace: rule.workplace,
          message: `${di.date} ${rule.workplace}: 正社員${counts.fullTime}人 (最低${rule.minFullTimeCount})`,
        })
      }
    }
  }
  return violations
}

export function softCount(
  assignments: DayAssignment[],
  dateInfos: DateInfo[],
  staffingRules: StaffingRuleInput[],
  employees: EmployeeInput[],
): number {
  return findSoftViolations(assignments, dateInfos, staffingRules, employees).length
}

// ============================================================
// 余剰公休: 必要数を超えてる従業員の余剰量
// ============================================================

export function surplusRest(
  emp: EmployeeInput,
  assignments: DayAssignment[],
  dateInfos: DateInfo[],
  holidayCount: number,
  paidLeaveKeys: Set<string>,
): number {
  let workDays = 0
  let paidDays = 0
  for (const a of assignments) {
    if (a.employeeId !== emp.id) continue
    if (a.workplace) workDays++
  }
  for (const di of dateInfos) {
    if (paidLeaveKeys.has(`${emp.id}|${di.date}`)) paidDays++
  }
  const restDays = dateInfos.length - workDays - paidDays
  return restDays - holidayCount
}

/** Anchor から paidLeaveKeys を構築 (有給日) */
export function buildPaidLeaveKeys(anchors: Anchor[]): Set<string> {
  const keys = new Set<string>()
  for (const a of anchors) {
    if (a.kind === 'PAID_LEAVE') keys.add(`${a.employeeId}|${a.date}`)
  }
  return keys
}
