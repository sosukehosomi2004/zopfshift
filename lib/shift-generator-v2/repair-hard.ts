/**
 * Phase 1: HARD 違反の修復
 *
 * 違反タイプ別の修復:
 *   - consecutive (6連勤+): 連勤中の1日を休みに、欠員は別の人で補填
 *   - holidayCount (公休不足): 出勤日を休みに、欠員は別の人で補填
 *   - aptitude (適性違反): 現状の workplace を primary に戻すか、別の人と入替
 *   - proficiency (cafe/floor): 適切な人を出勤させる
 *
 * 反復: 違反 = 0 になるまで or 最大反復回数まで
 */
import type {
  Anchor,
  DateInfo,
  DayAssignment,
  EmployeeInput,
  HardViolation,
  StaffingRuleInput,
  Workplace,
} from './types'
import { buildAnchorMap, isRestLocked, isWorkLocked } from './anchors'

const MAX_REPAIR_ITER = 100

type Ctx = {
  employees: EmployeeInput[]
  dateInfos: DateInfo[]
  staffingRules: StaffingRuleInput[]
  anchors: Anchor[]
  holidayCount: number
  initialConsecutive: Record<string, number>
  // Anchor で memo='有' を取得して連勤リセットに使う
  paidLeaveKeys: Set<string>
}

export function repairHard(
  ctx: Ctx,
  assignments: DayAssignment[],
): { assignments: DayAssignment[]; log: string[] } {
  let current = [...assignments]
  const log: string[] = []

  for (let iter = 0; iter < MAX_REPAIR_ITER; iter++) {
    const violations = findHardViolations(ctx, current)
    if (violations.length === 0) break

    const v = violations[0]
    const result = tryRepair(ctx, current, v)
    if (!result) {
      log.push(`[修復不能] ${v.message}`)
      break
    }
    current = result.assignments
    log.push(result.message)
  }

  return { assignments: current, log }
}

// ============================================================
// 違反検出
// ============================================================

export function findHardViolations(ctx: Ctx, assignments: DayAssignment[]): HardViolation[] {
  const violations: HardViolation[] = []
  const workMap = buildWorkMap(assignments)

  for (const emp of ctx.employees) {
    const dayWorks = workMap.get(emp.id) ?? new Map()

    // 連勤チェック
    let consecutive = ctx.initialConsecutive[emp.id] ?? 0
    for (const di of ctx.dateInfos) {
      const isPaid = ctx.paidLeaveKeys.has(`${emp.id}|${di.date}`)
      const isWork = dayWorks.has(di.date)
      if (isPaid) {
        consecutive = 0
      } else if (isWork) {
        consecutive++
        if (consecutive > 5) {
          violations.push({
            kind: 'consecutive',
            employeeId: emp.id,
            date: di.date,
            message: `${emp.lastName}: ${di.date}時点で${consecutive}連勤`,
          })
          consecutive = 0 // 同 streak 内多重報告防止
        }
      } else {
        consecutive = 0
      }
    }

    // 公休数チェック
    let restCount = 0
    let paidCount = 0
    for (const di of ctx.dateInfos) {
      const isPaid = ctx.paidLeaveKeys.has(`${emp.id}|${di.date}`)
      const isWork = dayWorks.has(di.date)
      if (isPaid) paidCount++
      else if (!isWork) restCount++
    }
    if (restCount < ctx.holidayCount) {
      violations.push({
        kind: 'holidayCount',
        employeeId: emp.id,
        message: `${emp.lastName}: 公休${restCount}日 (必要${ctx.holidayCount}日)`,
      })
    }
  }

  // 適性チェック
  for (const a of assignments) {
    if (!a.workplace) continue
    if (a.workplace === 'L' || a.workplace === 'F' || a.workplace === 'OTHER' || a.workplace === 'OFFICE') continue
    const emp = ctx.employees.find((e) => e.id === a.employeeId)
    if (!emp) continue
    const allowed = new Set<Workplace>([emp.primaryWorkplace, ...emp.secondaryWorkplaces])
    if (!allowed.has(a.workplace)) {
      violations.push({
        kind: 'aptitude',
        employeeId: emp.id,
        date: a.date,
        message: `${emp.lastName}: ${a.date}に${a.workplace}（資格なし）`,
      })
    }
  }

  return violations
}

// ============================================================
// 修復試行
// ============================================================

function tryRepair(
  ctx: Ctx,
  assignments: DayAssignment[],
  v: HardViolation,
): { assignments: DayAssignment[]; message: string } | null {
  switch (v.kind) {
    case 'consecutive':
      return repairConsecutive(ctx, assignments, v)
    case 'holidayCount':
      return repairHolidayCount(ctx, assignments, v)
    case 'aptitude':
      return repairAptitude(ctx, assignments, v)
    default:
      return null
  }
}

/** 6連勤修復: 中間の1日を休みに */
function repairConsecutive(
  ctx: Ctx,
  assignments: DayAssignment[],
  v: HardViolation,
): { assignments: DayAssignment[]; message: string } | null {
  if (!v.date) return null
  const anchorMap = buildAnchorMap(ctx.anchors)
  const endIdx = ctx.dateInfos.findIndex((di) => di.date === v.date)
  if (endIdx === -1) return null

  // end から遡って 0..5 のうちロックなしの日を探す
  for (let offset = 0; offset <= 5; offset++) {
    const idx = endIdx - offset
    if (idx < 0) break
    const targetDate = ctx.dateInfos[idx].date
    if (isWorkLocked(anchorMap, v.employeeId, targetDate)) continue
    if (isRestLocked(anchorMap, v.employeeId, targetDate)) continue

    // この日 該当従業員の workplace を取得
    const target = assignments.find(
      (a) => a.employeeId === v.employeeId && a.date === targetDate,
    )
    if (!target || !target.workplace) continue

    const dayWp = target.workplace
    const dayType = ctx.dateInfos[idx].dayType
    const rule = ctx.staffingRules.find((r) => r.workplace === dayWp && r.dayType === dayType)
    const required = rule?.requiredCount ?? 0
    const currentCount = assignments.filter(
      (a) => a.date === targetDate && a.workplace === dayWp,
    ).length

    // 補填不要ケース
    if (currentCount - 1 >= required) {
      const next = assignments.filter(
        (a) => !(a.employeeId === v.employeeId && a.date === targetDate),
      )
      return {
        assignments: next,
        message: `[6連勤修復] ${v.message}: ${targetDate}を休みに`,
      }
    }

    // 補填あり
    const replacement = findReplacement(ctx, assignments, targetDate, dayWp, v.employeeId)
    if (replacement) {
      const next = assignments.filter(
        (a) => !(a.employeeId === v.employeeId && a.date === targetDate),
      )
      next.push({
        employeeId: replacement.id,
        date: targetDate,
        workplace: dayWp,
        slotId: null,
        isMoved: true,
      })
      return {
        assignments: next,
        message: `[6連勤修復] ${v.message}: ${targetDate}を休み、${replacement.lastName}で補填`,
      }
    }
  }
  return null
}

/** 公休不足修復: 出勤日を1日休みに */
function repairHolidayCount(
  ctx: Ctx,
  assignments: DayAssignment[],
  v: HardViolation,
): { assignments: DayAssignment[]; message: string } | null {
  const anchorMap = buildAnchorMap(ctx.anchors)
  // 該当従業員の出勤日のうち、ロックなしで余裕ある日を探す
  for (const a of assignments.filter((a) => a.employeeId === v.employeeId && a.workplace)) {
    if (isWorkLocked(anchorMap, v.employeeId, a.date)) continue
    const di = ctx.dateInfos.find((d) => d.date === a.date)
    if (!di) continue
    const rule = ctx.staffingRules.find((r) => r.workplace === a.workplace && r.dayType === di.dayType)
    const required = rule?.requiredCount ?? 0
    const currentCount = assignments.filter(
      (x) => x.date === a.date && x.workplace === a.workplace,
    ).length
    if (currentCount - 1 >= required) {
      const next = assignments.filter(
        (x) => !(x.employeeId === v.employeeId && x.date === a.date),
      )
      return {
        assignments: next,
        message: `[公休修復] ${v.message}: ${a.date}を休みに`,
      }
    }
  }
  return null
}

/** 適性修復: 該当 assignment を primary に変更 (移動を取消) */
function repairAptitude(
  ctx: Ctx,
  assignments: DayAssignment[],
  v: HardViolation,
): { assignments: DayAssignment[]; message: string } | null {
  if (!v.date) return null
  const emp = ctx.employees.find((e) => e.id === v.employeeId)
  if (!emp) return null
  // 移動を取消して primary に
  const idx = assignments.findIndex((a) => a.employeeId === v.employeeId && a.date === v.date)
  if (idx === -1) return null
  const next = [...assignments]
  next[idx] = { ...next[idx], workplace: emp.primaryWorkplace, slotId: null, isMoved: false }
  return {
    assignments: next,
    message: `[適性修復] ${v.message}: primary(${emp.primaryWorkplace})に戻し`,
  }
}

// ============================================================
// ユーティリティ
// ============================================================

function buildWorkMap(assignments: DayAssignment[]): Map<string, Map<string, Workplace>> {
  const map = new Map<string, Map<string, Workplace>>()
  for (const a of assignments) {
    if (!a.workplace) continue
    if (!map.has(a.employeeId)) map.set(a.employeeId, new Map())
    map.get(a.employeeId)!.set(a.date, a.workplace)
  }
  return map
}

function findReplacement(
  ctx: Ctx,
  assignments: DayAssignment[],
  date: string,
  wp: Workplace,
  excludeEmpId: string,
): EmployeeInput | null {
  const anchorMap = buildAnchorMap(ctx.anchors)
  const workMap = buildWorkMap(assignments)
  const targetIdx = ctx.dateInfos.findIndex((d) => d.date === date)
  const universal = wp === 'L' || wp === 'F' || wp === 'OTHER' || wp === 'OFFICE'

  for (const emp of ctx.employees) {
    if (emp.id === excludeEmpId) continue
    if (wp === 'FACTORY' && emp.employmentType === 'PART_TIME') continue
    if (!universal) {
      const allowed = new Set<Workplace>([emp.primaryWorkplace, ...emp.secondaryWorkplaces])
      if (!allowed.has(wp)) continue
    }
    const dayWork = workMap.get(emp.id) ?? new Map()
    const currentWp = dayWork.get(date)
    if (currentWp === wp) continue
    if (isRestLocked(anchorMap, emp.id, date)) continue
    if (isWorkLocked(anchorMap, emp.id, date) && currentWp && currentWp !== wp) continue
    // 公休余裕
    const restCount = ctx.dateInfos.length - dayWork.size
    if (restCount <= ctx.holidayCount) continue
    // 5連勤チェック
    let consec = ctx.initialConsecutive[emp.id] ?? 0
    for (let i = 0; i <= targetIdx; i++) {
      const d = ctx.dateInfos[i].date
      const isPaid = ctx.paidLeaveKeys.has(`${emp.id}|${d}`)
      const willWork = i === targetIdx ? true : dayWork.has(d)
      if (isPaid) consec = 0
      else if (willWork) consec++
      else consec = 0
      if (consec > 5) break
    }
    if (consec > 5) continue
    return emp
  }
  return null
}

export type { Ctx as HardRepairCtx }
