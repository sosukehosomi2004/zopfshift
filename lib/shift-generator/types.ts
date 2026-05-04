// シフト生成エンジンの型定義
// pure function として DB に依存しない型を定義する

export type DayType = 'WEEKDAY_MON_THU' | 'FRIDAY' | 'HOLIDAY'

export type Workplace = 'FACTORY' | 'CAFE' | 'FLOOR' | 'OFFICE' | 'OTHER'

export type EmploymentType = 'FULL_TIME' | 'PART_TIME'

export type DayOffType = 'DAY_OFF' | 'PAID_LEAVE'

export type Proficiency = 'LOW' | 'MID' | 'HIGH'

/** 従業員のスキル（習熟度付き） */
export type EmployeeSkillInput = {
  skillId: string
  proficiency?: Proficiency | null
}

/** 従業員データ（生成エンジン入力用） */
export type EmployeeInput = {
  id: string
  employeeNumber: number
  lastName: string
  firstName: string
  employmentType: EmploymentType
  primaryWorkplace: Workplace
  secondaryWorkplaces: Workplace[]
  skillIds: string[]
  skillsWithProficiency?: EmployeeSkillInput[] // 習熟度付きスキル
  floorProficiency?: Proficiency | null // フロア全体の習熟度
}

/** スキル定義 */
export type SkillInput = {
  id: string
  workplace: Workplace
  name: string
}

/** 勤務場所のスロット定義 */
export type SlotInput = {
  id: string
  workplace: Workplace
  name: string
  sortOrder: number
  requiredSkillIds: string[] // このスロットに入るのに必要なスキル（OR: いずれか1つ持っていればOK）
  rules: SlotRuleInput[]
}

/** スロットの曜日別ルール */
export type SlotRuleInput = {
  dayType: DayType
  isRequired: boolean
  groupKey: string | null // 同じgroupKey内でどちらか1つ選択
}

/** 勤務場所の稼働人数ルール */
export type StaffingRuleInput = {
  workplace: Workplace
  dayType: DayType
  requiredCount: number
  minFullTimeCount: number | null
  baseFullTimeCount: number | null
}

/** 休み/有休申請（承認済みのみ） */
export type DayOffInput = {
  employeeId: string
  date: string // YYYY-MM-DD
  type: DayOffType
}

/** 祝日 */
export type HolidayInput = {
  date: string // YYYY-MM-DD
}

/** 事前確定（管理者が生成前に固定したセル） */
export type PreAssignmentInput = {
  employeeId: string
  date: string // YYYY-MM-DD
  workplace: Workplace | null // null = 休み確定
  memo?: string | null
}

/** 生成エンジンへの入力データ */
export type GeneratorInput = {
  startDate: string // YYYY-MM-DD (期間開始日)
  endDate: string   // YYYY-MM-DD (期間終了日)
  employees: EmployeeInput[]
  skills: SkillInput[]
  slots: SlotInput[]
  staffingRules: StaffingRuleInput[]
  dayOffs: DayOffInput[]
  holidays: HolidayInput[]
  holidayCount: number // この月の公休数
  candidateCount: number // 生成する候補数
  allowUnderstaffing?: boolean // trueの場合、定数違反を許容（後の移動で補填）
  preAssignments?: PreAssignmentInput[] // 事前確定セル
  targetValid?: number // HARD違反0件の候補をこの数集める (default: 1000)
  maxAttempts?: number // 最大試行回数 (default: 5000)
}

/** 1日の従業員割当 */
export type DayAssignment = {
  employeeId: string
  date: string
  workplace: Workplace
  slotId: string | null // 割り当てスロット（工場・カフェ等）
  isMoved: boolean
}

/** シフト候補の出力 */
export type CandidateOutput = {
  candidateIndex: number
  assignments: DayAssignment[]
  violations: string[] // 警告（SOFT違反、定数不足など）
  hardViolations: string[] // 必須違反（5連勤、公休数、習熟度、適性）
  score?: number // 優先条件スコア（高いほど良い）
}

/** 生成結果 */
export type GeneratorOutput = {
  candidates: CandidateOutput[]
  errors: string[] // 致命的エラー
}

/** 日付ごとの情報（前処理で作成） */
export type DateInfo = {
  date: string
  dayOfWeek: number // 0=日, 1=月, ..., 6=土
  dayType: DayType
}
