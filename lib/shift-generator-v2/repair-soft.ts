/**
 * Phase 2: SOFT 最適化
 *
 * Phase 2a: 休み過剰者の出勤化 (SOFT違反解消 + 連続性考慮)
 * Phase 2b: SOFT現状維持の範囲で連続性のための入替最適化
 */
import type {
  Anchor,
  DateInfo,
  DayAssignment,
  EmployeeInput,
  StaffingRuleInput,
  Workplace,
} from './types'
import { buildAnchorMap, isRestLocked, isWorkLocked } from './anchors'
import {
  buildPaidLeaveKeys,
  computeStreakStats,
  continuityScore,
  findSoftViolations,
  softCount,
  surplusRest,
  totalContinuityScore,
} from './scoring'

const MAX_2A_ITER = 100
const MAX_2B_ITER = 200

type Ctx = {
  employees: EmployeeInput[]
  dateInfos: DateInfo[]
  staffingRules: StaffingRuleInput[]
  anchors: Anchor[]
  holidayCount: number
  initialConsecutive: Record<string, number>
}

// ============================================================
// Phase 2a: 休み過剰 → 出勤化
// ============================================================

export function phase2a(
  ctx: Ctx,
  assignments: DayAssignment[],
): { assignments: DayAssignment[]; log: string[] } {
  let current = [...assignments]
  const log: string[] = []
  const paidLeaveKeys = buildPaidLeaveKeys(ctx.anchors)
  const anchorMap = buildAnchorMap(ctx.anchors)

  for (let iter = 0; iter < MAX_2A_ITER; iter++) {
    // SOFT 違反のある (日, workplace) を取得
    const softs = findSoftViolations(current, ctx.dateInfos, ctx.staffingRules, ctx.employees)
    const shortages = softs.filter((v) => v.kind === 'staffing' || v.kind === 'minFullTime')
    if (shortages.length === 0) break

    // 余剰公休のある従業員
    const surplusEmps = ctx.employees
      .map((e) => ({ emp: e, surplus: surplusRest(e, current, ctx.dateInfos, ctx.holidayCount, paidLeaveKeys) }))
      .filter((x) => x.surplus > 0)

    if (surplusEmps.length === 0) break

    // 最善の (emp, date, workplace) を探索
    let bestMove: { empId: string; date: string; wp: Workplace; gain: number } | null = null

    for (const { emp } of surplusEmps) {
      // この人の休み日のうち、ロックなしを列挙
      for (const di of ctx.dateInfos) {
        const date = di.date
        if (isRestLocked(anchorMap, emp.id, date)) continue
        if (isWorkLocked(anchorMap, emp.id, date)) continue
        if (paidLeaveKeys.has(`${emp.id}|${date}`)) continue
        // この日 既に出勤なら対象外
        const existing = current.find((a) => a.employeeId === emp.id && a.date === date)
        if (existing && existing.workplace) continue

        // 出勤化先候補 (SOFT 違反のある wp に絞る)
        for (const sv of shortages) {
          if (sv.date !== date) continue
          if (sv.workplace === 'FACTORY' && emp.employmentType === 'PART_TIME') continue
          // 適性
          const universal = sv.workplace === 'L' || sv.workplace === 'F' || sv.workplace === 'OTHER' || sv.workplace === 'OFFICE'
          if (!universal) {
            const allowed = new Set<Workplace>([emp.primaryWorkplace, ...emp.secondaryWorkplaces])
            if (!allowed.has(sv.workplace)) continue
          }

          // ゲイン計算
          const trial = applyTrial(current, emp.id, date, sv.workplace)
          // 5連勤チェック
          if (countMaxConsecutive(emp.id, trial, ctx, paidLeaveKeys) > 5) continue
          const newSoft = softCount(trial, ctx.dateInfos, ctx.staffingRules, ctx.employees)
          const oldSoft = softs.length
          const softGain = oldSoft - newSoft
          const continuityGain = continuityDelta(emp.id, current, trial, ctx, paidLeaveKeys)
          const totalGain = softGain * 3 + continuityGain
          if (totalGain > 0 && (bestMove === null || totalGain > bestMove.gain)) {
            bestMove = { empId: emp.id, date, wp: sv.workplace, gain: totalGain }
          }
        }
      }
    }

    if (!bestMove) break
    current = applyTrial(current, bestMove.empId, bestMove.date, bestMove.wp)
    const empName = ctx.employees.find((e) => e.id === bestMove!.empId)?.lastName ?? bestMove.empId
    log.push(`[2a] ${empName} ${bestMove.date} を ${bestMove.wp} に (gain=${bestMove.gain})`)
  }

  return { assignments: current, log }
}

// ============================================================
// Phase 2b: SOFT ガード付き入替最適化
// ============================================================

export function phase2b(
  ctx: Ctx,
  assignments: DayAssignment[],
): { assignments: DayAssignment[]; log: string[] } {
  let current = [...assignments]
  const log: string[] = []
  const paidLeaveKeys = buildPaidLeaveKeys(ctx.anchors)
  const anchorMap = buildAnchorMap(ctx.anchors)
  const baselineSoft = softCount(current, ctx.dateInfos, ctx.staffingRules, ctx.employees)
  let baselineScore = totalContinuityScore(ctx.employees, current, ctx.dateInfos, paidLeaveKeys, ctx.initialConsecutive)

  for (let iter = 0; iter < MAX_2B_ITER; iter++) {
    // 操作候補: 「2人の休み日スワップ」を試す (Aの出勤×Bの休み を交換)
    let best: { swap: [string, string, string]; gain: number } | null = null

    // パフォーマンス的に: 連勤悪い人 (1連勤・1連休が多い人) を優先的に対象
    const empsRanked = [...ctx.employees].sort((a, b) => {
      const sa = continuityScore(computeStreakStats(a.id, current, ctx.dateInfos, paidLeaveKeys, ctx.initialConsecutive[a.id] ?? 0))
      const sb = continuityScore(computeStreakStats(b.id, current, ctx.dateInfos, paidLeaveKeys, ctx.initialConsecutive[b.id] ?? 0))
      return sa - sb // 低スコア = 改善余地大、を先に
    })

    outer: for (const eA of empsRanked.slice(0, 8)) { // 上位8人ぐらいに絞る
      for (const di of ctx.dateInfos) {
        // eA がこの日休みかどうか
        const aOff = !current.find((x) => x.employeeId === eA.id && x.date === di.date && x.workplace)
        for (const eB of empsRanked) {
          if (eA.id === eB.id) continue
          const bOnAssign = current.find((x) => x.employeeId === eB.id && x.date === di.date && x.workplace)
          const bOn = !!bOnAssign
          // 交換するには (Aが休み, Bが出勤) のペアが必要
          if (!(aOff && bOn)) continue
          // ロックチェック
          if (isWorkLocked(anchorMap, eB.id, di.date)) continue
          if (isRestLocked(anchorMap, eA.id, di.date)) continue
          if (paidLeaveKeys.has(`${eA.id}|${di.date}`)) continue
          if (paidLeaveKeys.has(`${eB.id}|${di.date}`)) continue
          // 適性 A (B の元 workplace に行けるか)
          const wp = bOnAssign!.workplace!
          const universal = wp === 'L' || wp === 'F' || wp === 'OTHER' || wp === 'OFFICE'
          if (wp === 'FACTORY' && eA.employmentType === 'PART_TIME') continue
          if (!universal) {
            const allowed = new Set<Workplace>([eA.primaryWorkplace, ...eA.secondaryWorkplaces])
            if (!allowed.has(wp)) continue
          }

          // 仮スワップ: B の出勤を A に移譲
          const trial = current
            .filter((x) => !(x.employeeId === eB.id && x.date === di.date))
            .concat({ employeeId: eA.id, date: di.date, workplace: wp, slotId: null, isMoved: true })

          // 5連勤チェック (A, B 両方)
          if (countMaxConsecutive(eA.id, trial, ctx, paidLeaveKeys) > 5) continue
          if (countMaxConsecutive(eB.id, trial, ctx, paidLeaveKeys) > 5) continue
          // 公休数 (A: 公休が減る、B: 公休が増える)
          // A が公休不足 (< holidayCount) になる移動は却下
          if (restCount(eA.id, trial, ctx, paidLeaveKeys) < ctx.holidayCount) continue
          // SOFT
          const newSoft = softCount(trial, ctx.dateInfos, ctx.staffingRules, ctx.employees)
          if (newSoft > baselineSoft) continue
          // 連続性スコアの変化
          const newScore = totalContinuityScore(ctx.employees, trial, ctx.dateInfos, paidLeaveKeys, ctx.initialConsecutive)
          const gain = newScore - baselineScore
          if (gain <= 0) continue
          if (best === null || gain > best.gain) {
            best = { swap: [eA.id, eB.id, di.date], gain }
          }
        }
      }
      // パフォーマンス: 1人ループで見つかったら break
      if (best) break outer
    }

    if (best === null) break
    const chosen: { swap: [string, string, string]; gain: number } = best
    const [aId, bId, date] = chosen.swap
    // 適用
    const bAssign = current.find((x) => x.employeeId === bId && x.date === date)
    if (!bAssign?.workplace) break
    const wp = bAssign.workplace
    current = current
      .filter((x) => !(x.employeeId === bId && x.date === date))
      .concat({ employeeId: aId, date, workplace: wp, slotId: null, isMoved: true })
    baselineScore += chosen.gain
    const aN = ctx.employees.find((e) => e.id === aId)?.lastName ?? aId
    const bN = ctx.employees.find((e) => e.id === bId)?.lastName ?? bId
    log.push(`[2b] ${date} ${wp}: ${bN}→休み ${aN}→出勤 (gain=${chosen.gain})`)
  }

  return { assignments: current, log }
}

// ============================================================
// ヘルパー
// ============================================================

function applyTrial(
  assignments: DayAssignment[],
  empId: string,
  date: string,
  wp: Workplace,
): DayAssignment[] {
  const idx = assignments.findIndex((a) => a.employeeId === empId && a.date === date)
  if (idx === -1) {
    return [...assignments, { employeeId: empId, date, workplace: wp, slotId: null, isMoved: true }]
  }
  const next = [...assignments]
  next[idx] = { ...next[idx], workplace: wp, slotId: null, isMoved: true }
  return next
}

function continuityDelta(
  empId: string,
  before: DayAssignment[],
  after: DayAssignment[],
  ctx: Ctx,
  paidLeaveKeys: Set<string>,
): number {
  const before_s = computeStreakStats(empId, before, ctx.dateInfos, paidLeaveKeys, ctx.initialConsecutive[empId] ?? 0)
  const after_s = computeStreakStats(empId, after, ctx.dateInfos, paidLeaveKeys, ctx.initialConsecutive[empId] ?? 0)
  return continuityScore(after_s) - continuityScore(before_s)
}

function countMaxConsecutive(
  empId: string,
  assignments: DayAssignment[],
  ctx: Ctx,
  paidLeaveKeys: Set<string>,
): number {
  let max = 0
  let consec = ctx.initialConsecutive[empId] ?? 0
  const workDates = new Set(
    assignments.filter((a) => a.employeeId === empId && a.workplace).map((a) => a.date),
  )
  for (const di of ctx.dateInfos) {
    const isPaid = paidLeaveKeys.has(`${empId}|${di.date}`)
    if (isPaid) consec = 0
    else if (workDates.has(di.date)) {
      consec++
      if (consec > max) max = consec
    } else consec = 0
  }
  return max
}

function restCount(
  empId: string,
  assignments: DayAssignment[],
  ctx: Ctx,
  paidLeaveKeys: Set<string>,
): number {
  let work = 0
  let paid = 0
  for (const a of assignments) {
    if (a.employeeId !== empId) continue
    if (a.workplace) work++
  }
  for (const di of ctx.dateInfos) {
    if (paidLeaveKeys.has(`${empId}|${di.date}`)) paid++
  }
  return ctx.dateInfos.length - work - paid
}

export type { Ctx as SoftRepairCtx }
