/**
 * Step 3.5: クロスワークプレース移動
 *
 * 目的: カフェ・フロアの SOFT 違反 (人数不足) を解消するため、
 *       工場の余剰従業員を移動させる。
 *
 * 制約: 工場の SOFT 違反を絶対に増やさない (最優先)
 *       移動先の習熟度ルール (cafe ▲+◎, floor ▲≤2) は守る
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

type Ctx = {
  employees: EmployeeInput[]
  dateInfos: DateInfo[]
  staffingRules: StaffingRuleInput[]
  anchors: Anchor[]
  slots?: SlotInput[] // 工場のスロット情報 (移動時のスロット充足チェック用)
}

/** ある日その勤務地で何人出勤か */
function countAtWorkplace(
  assignments: DayAssignment[],
  date: string,
  wp: Workplace,
): number {
  return assignments.filter((a) => a.date === date && a.workplace === wp).length
}

/** 必要人数 */
function getRequired(
  staffingRules: StaffingRuleInput[],
  wp: Workplace,
  dayType: DateInfo['dayType'],
): number {
  return staffingRules.find((r) => r.workplace === wp && r.dayType === dayType)?.requiredCount ?? 0
}

/** SOFT違反: 不足量 (正の値) */
function shortageAt(
  assignments: DayAssignment[],
  staffingRules: StaffingRuleInput[],
  date: string,
  dayType: DateInfo['dayType'],
  wp: Workplace,
): number {
  const have = countAtWorkplace(assignments, date, wp)
  const need = getRequired(staffingRules, wp, dayType)
  return Math.max(0, need - have)
}

/**
 * 工場員の中で「移動可能な人」を返す
 *
 * 条件:
 *   - その日出勤中 (a.workplace === 'FACTORY')
 *   - target workplace に行ける (secondary に target を含む / target が L/F/OTHER/OFFICE)
 *   - 移動しても工場の SOFT を増やさない (workplace 数 -1 が required を割らない)
 *   - 移動先のロックされた他予定がない
 */
function findMovers(
  ctx: Ctx,
  assignments: DayAssignment[],
  date: string,
  dayType: DateInfo['dayType'],
  target: Workplace,
): EmployeeInput[] {
  const anchorMap = buildAnchorMap(ctx.anchors)
  const factoryCount = countAtWorkplace(assignments, date, 'FACTORY')
  const factoryRequired = getRequired(ctx.staffingRules, 'FACTORY', dayType)
  // 工場が既に最低人数ぎりぎりなら、誰も動かせない
  if (factoryCount <= factoryRequired) return []

  const universal = target === 'L' || target === 'F' || target === 'OTHER' || target === 'OFFICE'
  const movers: EmployeeInput[] = []

  for (const a of assignments) {
    if (a.date !== date) continue
    if (a.workplace !== 'FACTORY') continue
    const emp = ctx.employees.find((e) => e.id === a.employeeId)
    if (!emp) continue

    // ロック確認
    if (isWorkLocked(anchorMap, emp.id, date)) {
      // 出勤確定があるが workplace=FACTORY 以外なら動かせない
      const anchor = anchorMap.get(`${emp.id}|${date}`)
      if (anchor?.workplace !== 'FACTORY') continue
      // FACTORY 固定なら動かせない
      continue
    }
    if (isRestLocked(anchorMap, emp.id, date)) continue

    // 適性
    if (!universal) {
      const allowed = new Set<Workplace>([emp.primaryWorkplace, ...emp.secondaryWorkplaces])
      if (!allowed.has(target)) continue
    }

    movers.push(emp)
  }
  return movers
}

/** 移動候補のランク付け (低いほど影響小、優先) */
function scoreMover(
  emp: EmployeeInput,
  date: string,
  target: Workplace,
  movedHistory: Map<string, number>,
): number {
  let score = 0
  // スキル少ない人を優先的に動かす (代替性高い)
  score -= emp.skillIds.length * 10
  // パートを優先 (正社員温存)
  if (emp.employmentType === 'PART_TIME') score -= 20
  // 移動先で活躍できる人 = 上げる
  if (target === 'CAFE' || target === 'FLOOR') {
    if (emp.secondaryWorkplaces.includes(target)) score -= 5
  }
  // 過去の移動回数 (公平性): 多い人は下げる (=動かしたくない)
  const history = movedHistory.get(emp.id) ?? 0
  score += history * 30
  return score
}

/**
 * メイン関数: クロスワークプレース移動を実施
 *
 * 戻り値:
 *   - assignments: 移動後の assignments
 *   - movedCount: 移動件数
 */
export function applyCrossMove(
  ctx: Ctx,
  assignments: DayAssignment[],
): { assignments: DayAssignment[]; movedCount: number } {
  let current = [...assignments]
  const movedHistory = new Map<string, number>()
  let movedCount = 0

  // CAFE と FLOOR の SOFT 違反を解消する (順番: CAFE → FLOOR、好みで変更可)
  const targetWps: Workplace[] = ['CAFE', 'FLOOR']

  for (const target of targetWps) {
    // 不足が大きい日を優先
    const days = ctx.dateInfos.map((di) => ({
      date: di.date,
      dayType: di.dayType,
      shortage: shortageAt(current, ctx.staffingRules, di.date, di.dayType, target),
    })).filter((d) => d.shortage > 0)
    days.sort((a, b) => b.shortage - a.shortage)

    for (const day of days) {
      let stillNeed = shortageAt(current, ctx.staffingRules, day.date, day.dayType, target)
      while (stillNeed > 0) {
        const movers = findMovers(ctx, current, day.date, day.dayType, target)
        if (movers.length === 0) break

        // スコア順に並べる
        movers.sort(
          (a, b) =>
            scoreMover(a, day.date, target, movedHistory) -
            scoreMover(b, day.date, target, movedHistory),
        )

        // 1人ずつ試行 (移動して習熟度・スロットOKか確認)
        let moved = false
        for (const mover of movers) {
          // 仮移動
          const idx = current.findIndex(
            (a) => a.employeeId === mover.id && a.date === day.date,
          )
          if (idx === -1) continue
          const before = current[idx]
          current[idx] = { ...before, workplace: target, slotId: null, isMoved: true }

          // 移動後の習熟度チェック (cafe ▲+◎, floor ▲≤2)
          if (!checkProficiency(current, ctx.employees, day.date, target)) {
            current[idx] = before // ロールバック
            continue
          }
          // 工場スロット充足チェック (工場のポジション・スキルが埋まるか)
          if (ctx.slots && !checkFactorySlotCoverage(current, ctx.employees, ctx.slots, day.date, day.dayType)) {
            current[idx] = before // ロールバック (この人を抜くと工場ポジション穴)
            continue
          }
          // 移動成功
          movedHistory.set(mover.id, (movedHistory.get(mover.id) ?? 0) + 1)
          movedCount++
          moved = true
          break
        }
        if (!moved) break
        stillNeed = shortageAt(current, ctx.staffingRules, day.date, day.dayType, target)
      }
    }
  }

  return { assignments: current, movedCount }
}

/**
 * 工場スロット充足チェック
 *
 * その日その勤務地で、必須スロット (workplace slots) が
 * 残った出勤者で全部埋められるか (バイパーマッチング) を判定。
 * (この場合は工場のスロット充足を確認)
 */
function checkFactorySlotCoverage(
  assignments: DayAssignment[],
  employees: EmployeeInput[],
  slots: SlotInput[],
  date: string,
  dayType: 'WEEKDAY_MON_THU' | 'FRIDAY' | 'HOLIDAY',
): boolean {
  const factoryWorkers = assignments
    .filter((a) => a.date === date && a.workplace === 'FACTORY')
    .map((a) => employees.find((e) => e.id === a.employeeId))
    .filter((e): e is EmployeeInput => !!e)

  const factorySlots = slots.filter((s) => s.workplace === 'FACTORY')
  if (factorySlots.length === 0) return true

  // dayType ベースで必要なスロットを決定
  const required: SlotInput[] = []
  const groups = new Map<string, SlotInput[]>()
  for (const slot of factorySlots) {
    const rule = slot.rules.find((r) => r.dayType === dayType)
    if (!rule) continue
    if (rule.isRequired) {
      required.push(slot)
    } else if (rule.groupKey) {
      if (!groups.has(rule.groupKey)) groups.set(rule.groupKey, [])
      groups.get(rule.groupKey)!.push(slot)
    }
  }
  // グループは1つだけ埋まればOK扱いで required に1個ずつ追加
  for (const [, g] of Array.from(groups.entries())) {
    required.push(g[0])
  }
  if (required.length === 0) return true

  // MRV (候補少ない順) + バックトラック
  const sorted = [...required].sort((a, b) => {
    const ac = factoryWorkers.filter((w) =>
      a.requiredSkillIds.some((s) => w.skillIds.includes(s)),
    ).length
    const bc = factoryWorkers.filter((w) =>
      b.requiredSkillIds.some((s) => w.skillIds.includes(s)),
    ).length
    return ac - bc
  })
  const used = new Set<string>()
  function solve(idx: number): boolean {
    if (idx >= sorted.length) return true
    const slot = sorted[idx]
    for (const w of factoryWorkers) {
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

/** 習熟度の前方チェック */
function checkProficiency(
  assignments: DayAssignment[],
  employees: EmployeeInput[],
  date: string,
  wp: Workplace,
): boolean {
  const todayAtWp = assignments.filter((a) => a.date === date && a.workplace === wp)
  const empMap = new Map(employees.map((e) => [e.id, e]))

  if (wp === 'CAFE') {
    let hasLow = false
    let hasHigh = false
    for (const a of todayAtWp) {
      const e = empMap.get(a.employeeId)
      if (!e?.skillsWithProficiency) continue
      for (const sk of e.skillsWithProficiency) {
        if (sk.proficiency === 'LOW') hasLow = true
        if (sk.proficiency === 'HIGH') hasHigh = true
      }
    }
    if (hasLow && !hasHigh) return false
  }
  if (wp === 'FLOOR') {
    let lowCount = 0
    for (const a of todayAtWp) {
      const e = empMap.get(a.employeeId)
      if (e?.floorProficiency === 'LOW') lowCount++
    }
    if (lowCount > 2) return false
  }
  return true
}
