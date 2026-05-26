/**
 * シフト生成 v2 オーケストレーター
 *
 * Step 1: アンカー収集
 * Step 2: パターン割当 (各workplaceの primary 従業員)
 * Step 3: 出勤者集合からスロットマッチング (既存 v1 流用)
 * Step 3.5: クロスワークプレース移動 (工場SOFT最小化)
 * Step 4: Phase 1 HARD修復
 * Step 5: Phase 2a SOFT解消 (休み過剰者の出勤化)
 * Step 6: Phase 2b 連続性最適化 (SOFTガード)
 *
 * v1 と同じインターフェース (GeneratorInput → GeneratorOutput) を実装。
 * 内部で1候補だけ生成 (rejection sampling 不要)、HARD=0 を目指す。
 */
import type {
  Anchor,
  CandidateOutput,
  DateInfo,
  DayAssignment,
  EmployeeInput,
  GeneratorV2Input,
  GeneratorV2Output,
  PatternAssignment,
  StaffingRuleInput,
  Workplace,
} from './types'
import { buildDateInfos } from '../shift-generator/utils'
import { assignSlots } from '../shift-generator/slot-assigner'
import {
  checkConsecutiveWorkDays,
  checkHolidayCount,
  checkStaffingCounts,
  checkSlotCoverage,
  checkCafeProficiency,
  checkFloorProficiency,
} from '../shift-generator/constraints'
import { scoreConsecutiveOffDays } from '../shift-generator/scorer'
import { collectAnchors } from './anchors'
import {
  assignPatternsPure,
  assignPatternsMixed,
  assignCustomSchedule,
  patternToWorkDays,
} from './patterns'
import { applyCrossMove } from './cross-move'
import { repairHard } from './repair-hard'
import { phase2a, phase2b, phase2c } from './repair-soft'
import { buildPaidLeaveKeys } from './scoring'

const MAX_CONSECUTIVE = 5

export function generateShiftCandidatesV2(input: GeneratorV2Input): GeneratorV2Output {
  const dateInfos = buildDateInfos(input.startDate, input.endDate, input.holidays)
  const errors: string[] = []

  if (input.employees.length === 0) {
    return { candidates: [], errors: ['従業員が登録されていません'] }
  }
  if (dateInfos.length === 0) {
    return { candidates: [], errors: ['シフト期間が不正です'] }
  }

  // ============================================================
  // Step 1: アンカー収集
  // ============================================================
  const anchors = collectAnchors(input)
  const paidLeaveKeys = buildPaidLeaveKeys(anchors)

  // ============================================================
  // Step 2: パターン割当 (1 workplace 単位で呼ばれる前提)
  // ============================================================
  // workplace は employees[0].primaryWorkplace を見る (caller がフィルタ済み想定)
  const workplace = input.employees[0]?.primaryWorkplace ?? 'FACTORY'

  const { assignments: patternAssignments, fallbackEmps } = assignPatternsPure(
    input.employees,
    dateInfos,
    anchors,
    input.staffingRules,
  )

  // 階層2: 混合パターン
  for (const emp of fallbackEmps) {
    const mixed = assignPatternsMixed(emp, dateInfos, anchors)
    if (mixed) {
      patternAssignments.push(mixed)
    } else {
      // 階層3: カスタム
      const workDays = assignCustomSchedule(emp, dateInfos, anchors, input.holidayCount)
      // CustomScheduleは PatternAssignment として表現できないので、
      // 後で workDaysMap 構築時に分岐する。ここでは patternId=null + mixedByWeek=null で記録。
      patternAssignments.push({ employeeId: emp.id, patternId: null })
      // workDays を保存する別マップを用意
      customScheduleMap.set(emp.id, workDays)
    }
  }

  // ============================================================
  // Step 3: 出勤者集合 → スロットマッチング
  // ============================================================
  const workDaysMap = new Map<string, Set<string>>()
  for (const pa of patternAssignments) {
    if (pa.patternId === null && !pa.mixedByWeek) {
      // カスタムスケジュール
      const wd = customScheduleMap.get(pa.employeeId) ?? new Set<string>()
      workDaysMap.set(pa.employeeId, wd)
    } else {
      const wd = patternToWorkDays(pa, dateInfos, anchors)
      workDaysMap.set(pa.employeeId, wd)
    }
  }

  // 既存のスロット割当ロジックを流用
  const { assignments: slotAssignments } = assignSlots(
    dateInfos,
    workDaysMap,
    input.employees,
    input.slots,
  )

  // この段階の assignments は primary workplace のみ
  // クロスワークプレース移動は呼び出し元 (generate-period.ts) でマージ後にやる想定
  // → v2 内部では行わない (per-workplace 用)

  // ============================================================
  // Phase 1: HARD修復 (このワークプレース内で)
  // ============================================================
  const ctxHard = {
    employees: input.employees,
    dateInfos,
    staffingRules: input.staffingRules,
    anchors,
    holidayCount: input.holidayCount,
    initialConsecutive: input.initialConsecutiveWork ?? {},
    paidLeaveKeys,
  }
  const { assignments: afterRepair, log: repairLog } = repairHard(ctxHard, slotAssignments)

  // ============================================================
  // 候補出力 (per-workplace 単位の1候補)
  // ============================================================
  const violations: string[] = []
  const hardViolations: string[] = []

  // HARD違反検出 (v1 互換)
  for (const emp of input.employees) {
    const wd = workDaysMap.get(emp.id) ?? new Set()
    const initialConsec = input.initialConsecutiveWork?.[emp.id] ?? 0
    hardViolations.push(...checkConsecutiveWorkDays(emp.id, dateInfos, wd, input.dayOffs, MAX_CONSECUTIVE, initialConsec, emp.lastName))
    hardViolations.push(...checkHolidayCount(emp.id, dateInfos, wd, input.dayOffs, input.holidayCount, emp.lastName))
  }

  for (const di of dateInfos) {
    violations.push(...checkStaffingCounts(di.date, di.dayType, afterRepair, input.employees, input.staffingRules))
    violations.push(...checkSlotCoverage(di.date, di.dayType, afterRepair, input.employees, input.slots))
    if (workplace === 'CAFE') {
      hardViolations.push(...checkCafeProficiency(di.date, afterRepair, input.employees, input.skills))
    }
    if (workplace === 'FLOOR') {
      hardViolations.push(...checkFloorProficiency(di.date, afterRepair, input.employees))
    }
  }

  const candidate: CandidateOutput = {
    candidateIndex: 1,
    assignments: afterRepair,
    violations,
    hardViolations,
  }
  candidate.score = scoreConsecutiveOffDays(candidate, input.employees, dateInfos)

  return {
    candidates: [candidate],
    errors,
    meta: {
      anchorCount: anchors.length,
      patternAssignments,
      movedCount: 0, // per-workplace では 0
      repairLog,
      optimizeLog: [],
    },
  }
}

// カスタムスケジュールの一時保存マップ (関数スコープ)
const customScheduleMap = new Map<string, Set<string>>()

/**
 * v2 のマージ後ポスト処理 (全 workplace 統合後に呼ぶ)
 *
 * - Cross-workplace move
 * - HARD修復 (再度、全体ビュー)
 * - Phase 2a, 2b
 */
export function postProcessV2({
  employees,
  dateInfos,
  staffingRules,
  anchors,
  holidayCount,
  initialConsecutive,
  assignments,
}: {
  employees: EmployeeInput[]
  dateInfos: DateInfo[]
  staffingRules: StaffingRuleInput[]
  anchors: Anchor[]
  holidayCount: number
  initialConsecutive: Record<string, number>
  assignments: DayAssignment[]
}): { assignments: DayAssignment[]; logs: { phase: string; entries: string[] }[] } {
  const logs: { phase: string; entries: string[] }[] = []
  let current = [...assignments]
  const paidLeaveKeys = buildPaidLeaveKeys(anchors)

  // Step 3.5: クロスワークプレース移動
  // 工場の出勤者が必要数を上回ってる日 (余り人員あり) について、
  // カフェ・フロアの不足を埋めるために再配置する。
  // 工場の必要数は厳守 (factoryCount > factoryRequired のみ移動可)。
  // 注: 休みの工場員を「ヘルプ追加」するのは generate-period.ts 内の
  //     v1 tryAssign が先に担当済み (このフェーズは余剰の再配置)。
  const moved = applyCrossMove(
    { employees, dateInfos, staffingRules, anchors },
    current,
  )
  current = moved.assignments
  logs.push({ phase: 'cross-move', entries: [`移動 ${moved.movedCount} 件`] })

  // Phase 1: HARD修復 (全体)
  const repaired = repairHard(
    { employees, dateInfos, staffingRules, anchors, holidayCount, initialConsecutive, paidLeaveKeys },
    current,
  )
  current = repaired.assignments
  logs.push({ phase: 'phase1-hard', entries: repaired.log })

  // Phase 2a: SOFT解消
  const p2a = phase2a(
    { employees, dateInfos, staffingRules, anchors, holidayCount, initialConsecutive },
    current,
  )
  current = p2a.assignments
  logs.push({ phase: 'phase2a-soft', entries: p2a.log })

  // Phase 2b: 連続性最適化
  const p2b = phase2b(
    { employees, dateInfos, staffingRules, anchors, holidayCount, initialConsecutive },
    current,
  )
  current = p2b.assignments
  logs.push({ phase: 'phase2b-continuity', entries: p2b.log })

  // Phase 2c: 余剰公休の削減 (公休ジャスト holidayCount に)
  const p2c = phase2c(
    { employees, dateInfos, staffingRules, anchors, holidayCount, initialConsecutive },
    current,
  )
  current = p2c.assignments
  logs.push({ phase: 'phase2c-trim', entries: p2c.log })

  // 最終 HARD 残存チェック (デバッグ用)
  const finalRepairCheck = repairHard(
    { employees, dateInfos, staffingRules, anchors, holidayCount, initialConsecutive, paidLeaveKeys },
    current,
  )
  current = finalRepairCheck.assignments
  logs.push({ phase: 'final-hard-check', entries: finalRepairCheck.log })

  return { assignments: current, logs }
}
