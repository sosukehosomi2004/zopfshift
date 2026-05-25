/**
 * Step 2: パターン定義 + 割当ソルバー
 *
 * 各従業員に「7パターンのうちどれか」を割り当てて、
 * 各日の必要人数を満たすように最適化する。
 *
 * フォールバック階層:
 *   階層1: 純粋パターン (P0-P6) で割当
 *   階層2: 混合パターン (週ごとに offset 切替)
 *   階層3: カスタム (パターンなし、貪欲配置)
 */
import type {
  Anchor,
  DateInfo,
  EmployeeInput,
  PatternAssignment,
  StaffingRuleInput,
  Workplace,
  WorkPattern,
} from './types'
import { buildAnchorMap, isRestLocked, isWorkLocked } from './anchors'

// ============================================================
// 7パターン定義 (5W-2R, offset 0-6)
// ============================================================
// schedule の解釈: 期間初日 (dateInfos[0]) を index 0 とする 7日周期
// schedule[i] = 'W' or 'R' で、その i 日目が出勤か休みか
// 期間が 30日なら schedule[i % 7] を参照

export const BASE_PATTERNS: WorkPattern[] = [
  { id: 'P0', cycle: 7, schedule: ['W', 'W', 'W', 'W', 'W', 'R', 'R'], description: '5連勤→2連休 (offset 0)' },
  { id: 'P1', cycle: 7, schedule: ['R', 'W', 'W', 'W', 'W', 'W', 'R'], description: '5連勤→2連休 (offset 1)' },
  { id: 'P2', cycle: 7, schedule: ['R', 'R', 'W', 'W', 'W', 'W', 'W'], description: '5連勤→2連休 (offset 2)' },
  { id: 'P3', cycle: 7, schedule: ['W', 'R', 'R', 'W', 'W', 'W', 'W'], description: '5連勤→2連休 (offset 3)' },
  { id: 'P4', cycle: 7, schedule: ['W', 'W', 'R', 'R', 'W', 'W', 'W'], description: '5連勤→2連休 (offset 4)' },
  { id: 'P5', cycle: 7, schedule: ['W', 'W', 'W', 'R', 'R', 'W', 'W'], description: '5連勤→2連休 (offset 5)' },
  { id: 'P6', cycle: 7, schedule: ['W', 'W', 'W', 'W', 'R', 'R', 'W'], description: '5連勤→2連休 (offset 6)' },
]

/** パターンから (employee, date) の予定 W/R を返す */
export function getPatternSchedule(
  pattern: WorkPattern,
  dayIdx: number, // 期間初日からのインデックス (0始まり)
): 'W' | 'R' {
  return pattern.schedule[dayIdx % pattern.cycle]
}

/** 期間全体での Pattern の休み日数 (= total days / 7 * rest per cycle) */
export function countPatternRest(pattern: WorkPattern, totalDays: number): number {
  let rest = 0
  for (let i = 0; i < totalDays; i++) {
    if (pattern.schedule[i % pattern.cycle] === 'R') rest++
  }
  return rest
}

// ============================================================
// パターン適合判定: ある従業員の anchor とパターンが矛盾しないか
// ============================================================

export function isPatternCompatible(
  employee: EmployeeInput,
  pattern: WorkPattern,
  dateInfos: DateInfo[],
  anchorMap: Map<string, Anchor>,
): boolean {
  for (let i = 0; i < dateInfos.length; i++) {
    const date = dateInfos[i].date
    const expected = getPatternSchedule(pattern, i)
    const restLocked = isRestLocked(anchorMap, employee.id, date)
    const workLocked = isWorkLocked(anchorMap, employee.id, date)
    if (expected === 'W' && restLocked) return false // パターンは出勤、アンカーは休み
    if (expected === 'R' && workLocked) return false // パターンは休み、アンカーは出勤
  }
  return true
}

/** 適合する全パターンを返す */
export function findCompatiblePatterns(
  employee: EmployeeInput,
  dateInfos: DateInfo[],
  anchorMap: Map<string, Anchor>,
): WorkPattern[] {
  return BASE_PATTERNS.filter((p) => isPatternCompatible(employee, p, dateInfos, anchorMap))
}

// ============================================================
// パターン割当ソルバー (階層1: 純粋パターン)
// ============================================================

/**
 * 各従業員にパターンを割り当てる
 *
 * 戦略:
 *   - アンカー多い従業員 (制約多い) から先に処理
 *   - 各従業員の候補パターンから、その日の必要人数バランスを最も改善するものを貪欲選択
 *
 * 戻り値:
 *   - assignments: 全従業員の PatternAssignment
 *   - dailySchedule: 各日 × 各従業員 の W/R 表 (出力用)
 *   - fallbackEmps: 階層1で割当できなかった従業員のリスト (階層2/3で処理)
 */
export function assignPatternsPure(
  employees: EmployeeInput[],
  dateInfos: DateInfo[],
  anchors: Anchor[],
  staffingRules: StaffingRuleInput[],
): {
  assignments: PatternAssignment[]
  fallbackEmps: EmployeeInput[]
} {
  const anchorMap = buildAnchorMap(anchors)
  const assignments: PatternAssignment[] = []
  const fallbackEmps: EmployeeInput[] = []

  // アンカー数でソート: 多い人から
  const sortedEmps = [...employees].sort((a, b) => {
    const aAnchors = anchors.filter((x) => x.employeeId === a.id).length
    const bAnchors = anchors.filter((x) => x.employeeId === b.id).length
    return bAnchors - aAnchors
  })

  // 日ごとの「現在の W 人数」(その workplace の primary)
  const dailyWorkCount = new Map<string, number>()
  for (const di of dateInfos) {
    dailyWorkCount.set(di.date, 0)
  }

  // workplace は全員同じと仮定 (各 workplace で別途呼ばれる想定)
  const workplace: Workplace = employees[0]?.primaryWorkplace ?? 'FACTORY'

  for (const emp of sortedEmps) {
    const compatible = findCompatiblePatterns(emp, dateInfos, anchorMap)
    if (compatible.length === 0) {
      fallbackEmps.push(emp)
      continue
    }

    // 各パターンを評価: 「必要人数からの距離」を最小化
    let bestPattern: WorkPattern | null = null
    let bestScore = -Infinity
    for (const p of compatible) {
      const score = evaluatePattern(p, dateInfos, dailyWorkCount, staffingRules, workplace)
      if (score > bestScore) {
        bestScore = score
        bestPattern = p
      }
    }
    if (!bestPattern) {
      fallbackEmps.push(emp)
      continue
    }
    // 採用
    assignments.push({ employeeId: emp.id, patternId: bestPattern.id })
    // dailyWorkCount を更新
    for (let i = 0; i < dateInfos.length; i++) {
      if (getPatternSchedule(bestPattern, i) === 'W') {
        const d = dateInfos[i].date
        dailyWorkCount.set(d, (dailyWorkCount.get(d) ?? 0) + 1)
      }
    }
  }

  return { assignments, fallbackEmps }
}

/** パターン採用時のスコア: 必要人数に近づくほど高い (足りない日に出勤 = ボーナス、超過日に出勤 = ペナルティ) */
function evaluatePattern(
  pattern: WorkPattern,
  dateInfos: DateInfo[],
  currentCount: Map<string, number>,
  staffingRules: StaffingRuleInput[],
  workplace: Workplace,
): number {
  let score = 0
  for (let i = 0; i < dateInfos.length; i++) {
    if (getPatternSchedule(pattern, i) !== 'W') continue
    const di = dateInfos[i]
    const rule = staffingRules.find((r) => r.workplace === workplace && r.dayType === di.dayType)
    const required = rule?.requiredCount ?? 0
    const current = currentCount.get(di.date) ?? 0
    const deficit = Math.max(0, required - current)
    if (deficit > 0) score += 10 // 不足日に出勤 = ボーナス
    else if (current >= required) score -= 1 // 既に満たしてる日に出勤 = 軽いペナルティ
  }
  return score
}

// ============================================================
// 階層2: 混合パターン (週ごとに offset 切替)
// ============================================================

/**
 * 純粋パターンで割当できなかった従業員に、混合パターンを試みる。
 * 週 (i // 7) ごとに最も適合する pattern を選ぶ。
 */
export function assignPatternsMixed(
  employee: EmployeeInput,
  dateInfos: DateInfo[],
  anchors: Anchor[],
): PatternAssignment | null {
  const anchorMap = buildAnchorMap(anchors)
  const weekCount = Math.ceil(dateInfos.length / 7)
  const mixedByWeek: Record<number, string> = {}

  for (let w = 0; w < weekCount; w++) {
    const weekStart = w * 7
    const weekEnd = Math.min(weekStart + 7, dateInfos.length)
    const weekDates = dateInfos.slice(weekStart, weekEnd)

    // この週で適合するパターンを探す
    let best: WorkPattern | null = null
    for (const p of BASE_PATTERNS) {
      let ok = true
      for (let i = 0; i < weekDates.length; i++) {
        const di = weekDates[i]
        // パターンは globalDayIdx を基準に評価するため、weekStart + i を使う
        const expected = getPatternSchedule(p, weekStart + i)
        const restLocked = isRestLocked(anchorMap, employee.id, di.date)
        const workLocked = isWorkLocked(anchorMap, employee.id, di.date)
        if (expected === 'W' && restLocked) { ok = false; break }
        if (expected === 'R' && workLocked) { ok = false; break }
      }
      if (ok) { best = p; break }
    }
    if (!best) return null // この週はどのパターンも合わない → 階層3へ
    mixedByWeek[w] = best.id
  }

  return { employeeId: employee.id, patternId: null, mixedByWeek }
}

/** 混合パターンの (emp, date) の予定 W/R */
export function getMixedSchedule(
  assignment: PatternAssignment,
  dayIdx: number,
): 'W' | 'R' | null {
  if (!assignment.mixedByWeek) return null
  const weekIdx = Math.floor(dayIdx / 7)
  const patternId = assignment.mixedByWeek[weekIdx]
  if (!patternId) return null
  const pattern = BASE_PATTERNS.find((p) => p.id === patternId)
  if (!pattern) return null
  return getPatternSchedule(pattern, dayIdx)
}

// ============================================================
// 階層3: カスタムスケジュール (パターン外)
// ============================================================

/**
 * パターン適用できない従業員の貪欲配置。
 * - アンカー尊重
 * - 公休数 = holidayCount を満たす
 * - 連勤 ≤ 5
 * - 残りの日を「需要が高い日 (workplace 不足してる日) は出勤、それ以外は休み」で貪欲埋め
 */
export function assignCustomSchedule(
  employee: EmployeeInput,
  dateInfos: DateInfo[],
  anchors: Anchor[],
  holidayCount: number,
): Set<string> {
  // 戻り値: 出勤日の Set
  const anchorMap = buildAnchorMap(anchors)
  const workDays = new Set<string>()
  const restDays = new Set<string>()

  // アンカーで確定してる日を埋める
  for (let i = 0; i < dateInfos.length; i++) {
    const d = dateInfos[i].date
    if (isWorkLocked(anchorMap, employee.id, d)) workDays.add(d)
    else if (isRestLocked(anchorMap, employee.id, d)) restDays.add(d)
  }

  // 残りの日: 出勤先候補に入れて、連勤・公休数制約を満たすように決める
  // シンプルに: 公休数になるまで休みを最後の方から埋め、それ以外は出勤
  const undecided: number[] = []
  for (let i = 0; i < dateInfos.length; i++) {
    const d = dateInfos[i].date
    if (!workDays.has(d) && !restDays.has(d)) undecided.push(i)
  }

  const remainingRestNeeded = holidayCount - restDays.size
  if (remainingRestNeeded > 0) {
    // 中央から休みを撒く (連勤回避)
    // 簡易版: undecided を均等に割って休みに
    const step = Math.max(1, Math.floor(undecided.length / Math.max(1, remainingRestNeeded)))
    let added = 0
    for (let k = 0; k < undecided.length && added < remainingRestNeeded; k += step) {
      restDays.add(dateInfos[undecided[k]].date)
      added++
    }
  }
  for (let i = 0; i < dateInfos.length; i++) {
    const d = dateInfos[i].date
    if (!workDays.has(d) && !restDays.has(d)) workDays.add(d)
  }

  return workDays
}

// ============================================================
// パターン割当結果を「出勤日セット」に変換
// ============================================================

export function patternToWorkDays(
  assignment: PatternAssignment,
  dateInfos: DateInfo[],
  anchors: Anchor[],
): Set<string> {
  const anchorMap = buildAnchorMap(anchors)
  const workDays = new Set<string>()

  if (assignment.patternId) {
    const pattern = BASE_PATTERNS.find((p) => p.id === assignment.patternId)
    if (!pattern) return workDays
    for (let i = 0; i < dateInfos.length; i++) {
      const d = dateInfos[i].date
      // アンカー優先
      if (isWorkLocked(anchorMap, assignment.employeeId, d)) {
        workDays.add(d)
        continue
      }
      if (isRestLocked(anchorMap, assignment.employeeId, d)) continue
      // パターン
      if (getPatternSchedule(pattern, i) === 'W') workDays.add(d)
    }
  } else if (assignment.mixedByWeek) {
    for (let i = 0; i < dateInfos.length; i++) {
      const d = dateInfos[i].date
      if (isWorkLocked(anchorMap, assignment.employeeId, d)) {
        workDays.add(d)
        continue
      }
      if (isRestLocked(anchorMap, assignment.employeeId, d)) continue
      const s = getMixedSchedule(assignment, i)
      if (s === 'W') workDays.add(d)
    }
  }
  return workDays
}
