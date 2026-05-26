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
  SlotInput,
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
const MAX_2C_ITER = 100
const MAX_2D_ITER = 200
const MAX_2E_ITER = 100

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
          // 防御: 公休数を下回ったら却下
          if (restCount(emp.id, trial, ctx, paidLeaveKeys) < ctx.holidayCount) continue
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

// ============================================================
// Phase 2c: 余剰公休の削減 (公休をジャスト holidayCount に揃える)
// ============================================================

/**
 * 公休 > holidayCount の従業員に対し、余剰分を出勤に変換する。
 * 条件: SOFT を増やさない、HARD を増やさない (5連勤・公休下回り等)。
 * 配置先は本人の primary workplace。overstaffing になっても許容。
 */
export function phase2c(
  ctx: Ctx,
  assignments: DayAssignment[],
): { assignments: DayAssignment[]; log: string[] } {
  let current = [...assignments]
  const log: string[] = []
  const paidLeaveKeys = buildPaidLeaveKeys(ctx.anchors)
  const anchorMap = buildAnchorMap(ctx.anchors)
  const baselineSoft = softCount(current, ctx.dateInfos, ctx.staffingRules, ctx.employees)

  for (let iter = 0; iter < MAX_2C_ITER; iter++) {
    const surplusEmps = ctx.employees
      .map((e) => ({ emp: e, surplus: surplusRest(e, current, ctx.dateInfos, ctx.holidayCount, paidLeaveKeys) }))
      .filter((x) => x.surplus > 0)
    if (surplusEmps.length === 0) break

    let bestMove: { empId: string; date: string; wp: Workplace } | null = null

    for (const { emp } of surplusEmps) {
      for (const di of ctx.dateInfos) {
        const date = di.date
        if (isRestLocked(anchorMap, emp.id, date)) continue
        if (isWorkLocked(anchorMap, emp.id, date)) continue
        if (paidLeaveKeys.has(`${emp.id}|${date}`)) continue
        const existing = current.find((a) => a.employeeId === emp.id && a.date === date)
        if (existing && existing.workplace) continue

        // primary workplace に配置試行
        const wp = emp.primaryWorkplace
        // パート×工場 不可
        if (wp === 'FACTORY' && emp.employmentType === 'PART_TIME') continue
        const trial = applyTrial(current, emp.id, date, wp)
        // HARD: 5連勤チェック
        if (countMaxConsecutive(emp.id, trial, ctx, paidLeaveKeys) > 5) continue
        // HARD: 公休下回り回避
        if (restCount(emp.id, trial, ctx, paidLeaveKeys) < ctx.holidayCount) continue
        // SOFT 増加禁止
        const newSoft = softCount(trial, ctx.dateInfos, ctx.staffingRules, ctx.employees)
        if (newSoft > baselineSoft) continue
        bestMove = { empId: emp.id, date, wp }
        break
      }
      if (bestMove) break
    }

    if (!bestMove) break
    current = applyTrial(current, bestMove.empId, bestMove.date, bestMove.wp)
    const empName = ctx.employees.find((e) => e.id === bestMove!.empId)?.lastName ?? bestMove.empId
    log.push(`[2c] ${empName} ${bestMove.date} を ${bestMove.wp} に (余剰公休削減)`)
  }

  return { assignments: current, log }
}

// ============================================================
// Phase 2d: 休み日リバランス (不足日と余り日を入れ替える)
// ============================================================

/**
 * ある日 D で workplace W が不足してる場合、
 *   その日 W で休んでいる工場員 E を探し、
 *   E の別の出勤日 D'(W が余ってる) を休みに変える代わりに、
 *   D を出勤にする。
 *
 * E の公休数は維持、5連勤も維持、SOFT は不足→余り の方向で改善のみ。
 */
export function phase2d(
  ctx: Ctx,
  assignments: DayAssignment[],
): { assignments: DayAssignment[]; log: string[] } {
  let current = [...assignments]
  const log: string[] = []
  const paidLeaveKeys = buildPaidLeaveKeys(ctx.anchors)
  const anchorMap = buildAnchorMap(ctx.anchors)

  for (let iter = 0; iter < MAX_2D_ITER; iter++) {
    // SOFT 不足を検出
    const softs = findSoftViolations(current, ctx.dateInfos, ctx.staffingRules, ctx.employees)
    const shortages = softs.filter((v) => v.kind === 'staffing')
    if (shortages.length === 0) break

    // 一番不足が大きい日 (workplace, date) を狙う
    let bestSwap: { empId: string; restDate: string; workDate: string; wp: Workplace } | null = null

    // 候補ソート: secondary 少ない人を優先 (異動できない人 = 不足埋めに最適)
    const sortedEmps = [...ctx.employees].sort((a, b) =>
      a.secondaryWorkplaces.length - b.secondaryWorkplaces.length,
    )

    for (const sv of shortages) {
      const shortageDate = sv.date
      const wp = sv.workplace
      const di = ctx.dateInfos.find((d) => d.date === shortageDate)
      if (!di) continue

      // 候補 E: その日 wp で休んでて、wp に行ける人 (secondary 少ない人優先)
      for (const emp of sortedEmps) {
        // wp に行ける?
        const universal = wp === 'L' || wp === 'F' || wp === 'OTHER' || wp === 'OFFICE'
        if (!universal) {
          const allowed = new Set<Workplace>([emp.primaryWorkplace, ...emp.secondaryWorkplaces])
          if (!allowed.has(wp)) continue
        }
        if (wp === 'FACTORY' && emp.employmentType === 'PART_TIME') continue

        // E はその日休み?
        if (isWorkLocked(anchorMap, emp.id, shortageDate)) continue
        if (paidLeaveKeys.has(`${emp.id}|${shortageDate}`)) continue
        const restAssign = current.find((a) => a.employeeId === emp.id && a.date === shortageDate)
        if (restAssign && restAssign.workplace) continue // 出勤中

        // E の別の出勤日 D' を探す: その日 D' の workplace W' が余ってる
        for (const a of current) {
          if (a.employeeId !== emp.id) continue
          if (!a.workplace) continue
          if (a.date === shortageDate) continue
          if (isWorkLocked(anchorMap, emp.id, a.date)) continue
          const workplaceAtY = a.workplace
          const diY = ctx.dateInfos.find((d) => d.date === a.date)
          if (!diY) continue
          const ruleY = ctx.staffingRules.find((r) => r.workplace === workplaceAtY && r.dayType === diY.dayType)
          const requiredY = ruleY?.requiredCount ?? 0
          const currentY = current.filter((x) => x.date === a.date && x.workplace === workplaceAtY).length
          // Y を E が離脱しても W' が不足にならないか
          if (currentY - 1 < requiredY) continue

          // E に shortageDate=wp、a.date=休みに変える trial
          const trial = current
            .filter((x) => !(x.employeeId === emp.id && x.date === a.date)) // Y の出勤を削除
            .filter((x) => !(x.employeeId === emp.id && x.date === shortageDate)) // X の休み記録を削除 (もし null assignment あれば)
            .concat({ employeeId: emp.id, date: shortageDate, workplace: wp, slotId: null, isMoved: true })

          // HARD: 5連勤
          if (countMaxConsecutive(emp.id, trial, ctx, paidLeaveKeys) > 5) continue
          // HARD: 公休数維持 (シフトなので不変、念のため確認)
          if (restCount(emp.id, trial, ctx, paidLeaveKeys) < ctx.holidayCount) continue
          // SOFT: 全体で悪化してない?
          const newSoft = softCount(trial, ctx.dateInfos, ctx.staffingRules, ctx.employees)
          if (newSoft > softs.length) continue

          bestSwap = { empId: emp.id, restDate: shortageDate, workDate: a.date, wp }
          break
        }
        if (bestSwap) break
      }
      if (bestSwap) break
    }

    if (!bestSwap) break

    // 適用
    current = current
      .filter((x) => !(x.employeeId === bestSwap!.empId && x.date === bestSwap!.workDate))
      .filter((x) => !(x.employeeId === bestSwap!.empId && x.date === bestSwap!.restDate))
      .concat({
        employeeId: bestSwap.empId,
        date: bestSwap.restDate,
        workplace: bestSwap.wp,
        slotId: null,
        isMoved: true,
      })
    const empName = ctx.employees.find((e) => e.id === bestSwap!.empId)?.lastName ?? bestSwap.empId
    log.push(`[2d] ${empName}: ${bestSwap.workDate} を休みに / ${bestSwap.restDate} を ${bestSwap.wp} に (不足解消)`)
  }

  return { assignments: current, log }
}

// ============================================================
// Phase 2e: 休み日 ↔ ヘルプ日 スワップで工場ポジションを埋める
// ============================================================

/**
 * 工場のスロット(ポジション)が穴の日 D について、
 *   - 必要スキルを持つ従業員 X (primary=FACTORY) で D に休みの人を探す
 *   - X が別日 D' で カフェ/フロア 等にヘルプに行ってるなら、
 *     X の D' ヘルプを取消し (= D' 休み)、D を工場出勤に切替
 *   X の総出勤日数・公休数は不変、工場ポジションだけ埋まる
 */
export function phase2e(
  ctx: Ctx & { slots?: SlotInput[] },
  assignments: DayAssignment[],
): { assignments: DayAssignment[]; log: string[] } {
  const log: string[] = []
  let current = [...assignments]
  const anchorMap = buildAnchorMap(ctx.anchors)
  const paidLeaveKeys = buildPaidLeaveKeys(ctx.anchors)
  if (!ctx.slots || ctx.slots.length === 0) return { assignments: current, log }

  for (let iter = 0; iter < MAX_2E_ITER; iter++) {
    let bestSwap: { empId: string; restDate: string; helpDate: string } | null = null

    for (const di of ctx.dateInfos) {
      // 工場のスロット (このdayTypeに必要なもの)
      const required: SlotInput[] = []
      const groups = new Map<string, SlotInput[]>()
      for (const slot of ctx.slots) {
        if (slot.workplace !== 'FACTORY') continue
        const rule = slot.rules.find((r) => r.dayType === di.dayType)
        if (!rule) continue
        if (rule.isRequired) required.push(slot)
        else if (rule.groupKey) {
          if (!groups.has(rule.groupKey)) groups.set(rule.groupKey, [])
          groups.get(rule.groupKey)!.push(slot)
        }
      }
      for (const [, g] of Array.from(groups.entries())) required.push(g[0])
      if (required.length === 0) continue

      // 現在の工場勤務者
      const factoryWorkers = current
        .filter((a) => a.date === di.date && a.workplace === 'FACTORY')
        .map((a) => ctx.employees.find((e) => e.id === a.employeeId))
        .filter((e): e is EmployeeInput => !!e)

      // 充足チェック
      if (canCoverSlots(required, factoryWorkers)) continue

      // 各 required slot について、不足を解消できる候補を探す
      const unmetSlotSkills = findUnmetSlotSkills(required, factoryWorkers)
      if (unmetSlotSkills.length === 0) continue

      // 候補 X: 必要スキル保持 + D 休み + 別日でヘルプ中
      for (const emp of ctx.employees) {
        if (emp.primaryWorkplace !== 'FACTORY') continue
        if (emp.employmentType === 'PART_TIME') continue
        // スキル一致
        const hasSkill = unmetSlotSkills.some((skillIds) =>
          skillIds.some((s) => emp.skillIds.includes(s)),
        )
        if (!hasSkill) continue
        // D に休み?
        if (isWorkLocked(anchorMap, emp.id, di.date)) continue
        if (paidLeaveKeys.has(`${emp.id}|${di.date}`)) continue
        const onDate = current.find((a) => a.employeeId === emp.id && a.date === di.date)
        if (onDate && onDate.workplace) continue // 既に勤務中

        // X の別日 D' でヘルプ中?
        for (const help of current) {
          if (help.employeeId !== emp.id) continue
          if (help.date === di.date) continue
          if (!help.workplace) continue
          if (help.workplace === 'FACTORY') continue // ヘルプ判定: 工場以外
          if (isWorkLocked(anchorMap, emp.id, help.date)) continue

          // Trial: D を工場勤務 / D' を休み
          let trial = current
            .filter((x) => !(x.employeeId === emp.id && x.date === help.date))
            .filter((x) => !(x.employeeId === emp.id && x.date === di.date))
            .concat({ employeeId: emp.id, date: di.date, workplace: 'FACTORY', slotId: null, isMoved: true })

          // 5連勤チェック
          if (countMaxConsecutive(emp.id, trial, ctx, paidLeaveKeys) > 5) continue
          // 公休数 (シフトなので不変、念のため)
          if (restCount(emp.id, trial, ctx, paidLeaveKeys) < ctx.holidayCount) continue

          // D' ヘルプ取消で、その勤務地が minFullTimeCount を下回らないか
          if (help.workplace === 'FLOOR') {
            const minFT = ctx.staffingRules.find((r) => r.workplace === 'FLOOR' && r.dayType === ctx.dateInfos.find((di) => di.date === help.date)?.dayType)?.minFullTimeCount ?? 0
            const ftAfter = trial.filter((a) => {
              if (a.date !== help.date) return false
              if (a.workplace !== 'FLOOR') return false
              const e = ctx.employees.find((e) => e.id === a.employeeId)
              return e?.employmentType === 'FULL_TIME'
            }).length
            if (ftAfter < minFT) continue
          }

          bestSwap = { empId: emp.id, restDate: di.date, helpDate: help.date }
          break
        }
        if (bestSwap) break
      }
      if (bestSwap) break
    }

    if (!bestSwap) break

    // 適用
    current = current
      .filter((x) => !(x.employeeId === bestSwap!.empId && x.date === bestSwap!.helpDate))
      .filter((x) => !(x.employeeId === bestSwap!.empId && x.date === bestSwap!.restDate))
      .concat({ employeeId: bestSwap.empId, date: bestSwap.restDate, workplace: 'FACTORY', slotId: null, isMoved: true })
    const empName = ctx.employees.find((e) => e.id === bestSwap!.empId)?.lastName ?? bestSwap.empId
    log.push(`[2e] ${empName}: ${bestSwap.helpDate} ヘルプ取消し → 休み / ${bestSwap.restDate} を工場に (ポジション埋め)`)
  }

  return { assignments: current, log }
}

/** 必要スロットが現在の workers でカバーできるか (バックトラック) */
function canCoverSlots(required: SlotInput[], workers: EmployeeInput[]): boolean {
  const sorted = [...required].sort((a, b) => {
    const ac = workers.filter((w) => a.requiredSkillIds.some((s) => w.skillIds.includes(s))).length
    const bc = workers.filter((w) => b.requiredSkillIds.some((s) => w.skillIds.includes(s))).length
    return ac - bc
  })
  const used = new Set<string>()
  function solve(idx: number): boolean {
    if (idx >= sorted.length) return true
    const slot = sorted[idx]
    for (const w of workers) {
      if (used.has(w.id)) continue
      if (!slot.requiredSkillIds.some((s) => w.skillIds.includes(s))) continue
      used.add(w.id)
      if (solve(idx + 1)) return true
      used.delete(w.id)
    }
    return false
  }
  return solve(0)
}

/** カバーできないスロットの requiredSkillIds リスト */
function findUnmetSlotSkills(required: SlotInput[], workers: EmployeeInput[]): string[][] {
  // 簡易: 全 required のうち、現状でマッチング失敗の組み合わせのスロット
  // をすべて返す (実際にはMRVバックトラック失敗時のスロットを返すべきだが
  // 簡略化のため、全 required の requiredSkillIds を候補に)
  return required.map((s) => s.requiredSkillIds)
}

export type { Ctx as SoftRepairCtx }
