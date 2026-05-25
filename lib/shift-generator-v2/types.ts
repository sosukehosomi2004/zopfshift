/**
 * シフト生成 v2 の型定義
 *
 * 設計方針: 既存 v1 (shift-generator/types.ts) と互換性を保つ。
 * 必要に応じて v1 の型を import / re-export する。
 */
import type {
  DayType,
  Workplace,
  EmploymentType,
  Proficiency,
  EmployeeInput,
  SlotInput,
  SlotRuleInput,
  StaffingRuleInput,
  DayOffInput,
  HolidayInput,
  PreAssignmentInput,
  DayAssignment,
  CandidateOutput,
  GeneratorInput,
  GeneratorOutput,
  DateInfo,
} from '../shift-generator/types'

export type {
  DayType,
  Workplace,
  EmploymentType,
  Proficiency,
  EmployeeInput,
  SlotInput,
  SlotRuleInput,
  StaffingRuleInput,
  DayOffInput,
  HolidayInput,
  PreAssignmentInput,
  DayAssignment,
  CandidateOutput,
  GeneratorInput,
  GeneratorOutput,
  DateInfo,
}

/** アンカー: 「絶対に動かさない」シフトセル */
export type Anchor = {
  employeeId: string
  date: string // YYYY-MM-DD
  kind: 'WORK_LOCK' | 'REST_LOCK' | 'PAID_LEAVE'
  workplace?: Workplace // WORK_LOCK の場合のみ
  memo?: string | null // 表示用メモ ('有'/'連'等)
}

/** パターン定義: 7日周期の出勤/休みパターン */
export type WorkPattern = {
  id: string // 'P0' .. 'P6' 等
  cycle: number // 周期 (基本7、変則も可)
  // cycle 日分の "W" or "R" 列
  // 0始まり、月曜起算ではなく「期間初日」起算
  schedule: ('W' | 'R')[]
  description: string
}

/** 従業員へのパターン割当結果 */
export type PatternAssignment = {
  employeeId: string
  patternId: string | null // null = カスタム (パターン外スケジュール)
  // 混合パターンの場合: weekIdx → patternId のマップ (週ごとに切替)
  mixedByWeek?: Record<number, string>
}

/** 連勤・連休統計 */
export type StreakStats = {
  workStreaks: number[] // 各連勤の長さ
  restStreaks: number[] // 各連休の長さ
}

/** 連続性スコア (高いほど良い) */
export type ContinuityScore = number

/** SOFT 違反 (簡易表現) */
export type SoftViolation = {
  kind: 'staffing' | 'minFullTime' | 'slot'
  date: string
  workplace: Workplace
  message: string
}

/** HARD 違反 (簡易表現) */
export type HardViolation = {
  kind: 'consecutive' | 'holidayCount' | 'aptitude' | 'cafeProficiency' | 'floorProficiency'
  employeeId: string
  date?: string
  message: string
}

/** v2 オーケストレーターへの入力 (v1 と同じ) */
export type GeneratorV2Input = GeneratorInput

/** v2 オーケストレーターの出力 (詳細ログ付き) */
export type GeneratorV2Output = GeneratorOutput & {
  meta?: {
    anchorCount: number
    patternAssignments: PatternAssignment[]
    movedCount: number
    repairLog: string[]
    optimizeLog: string[]
  }
}
