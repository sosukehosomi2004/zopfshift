/**
 * Step 1: アンカー収集
 *
 * 「絶対に動かさない」セルを集める:
 *   - PreAssignment (workplace 指定 or 休み確定)
 *   - DayOffRequest (APPROVED/PENDING) ※ PENDING は v1 と同じ扱い
 *   - 通年ルール (ALWAYS_WORK / ALWAYS_OFF) - 既に PreAssignment に展開済の想定
 *   - 退職日翌日以降: 強制休み
 *   - 月跨ぎ5連勤マーカー (memo='連')
 *
 * v1 では expand-recurring-rules.ts が PreAssignment 化までやってるので、
 * v2 では受け取った preAssignments + dayOffs を Anchor に正規化するだけ。
 */
import type { Anchor, GeneratorV2Input, Workplace } from './types'

export function collectAnchors(input: GeneratorV2Input): Anchor[] {
  const anchors: Anchor[] = []

  // PreAssignment を Anchor に変換
  for (const pa of input.preAssignments ?? []) {
    if (pa.workplace === null) {
      // 休み確定
      anchors.push({
        employeeId: pa.employeeId,
        date: pa.date,
        kind: 'REST_LOCK',
        memo: pa.memo ?? null,
      })
    } else {
      // 出勤確定
      anchors.push({
        employeeId: pa.employeeId,
        date: pa.date,
        kind: 'WORK_LOCK',
        workplace: pa.workplace,
        memo: pa.memo ?? null,
      })
    }
  }

  // DayOffs (APPROVED + PENDING の両方) は休みとして扱う
  // ただし既に PreAssignment と重複してたら PreAssignment 優先 (アンカー重複を回避)
  const paKeys = new Set(anchors.map((a) => `${a.employeeId}|${a.date}`))
  for (const d of input.dayOffs) {
    const key = `${d.employeeId}|${d.date}`
    if (paKeys.has(key)) continue
    anchors.push({
      employeeId: d.employeeId,
      date: d.date,
      kind: d.type === 'PAID_LEAVE' ? 'PAID_LEAVE' : 'REST_LOCK',
      memo: d.type === 'PAID_LEAVE' ? '有' : null,
    })
  }

  return anchors
}

/** Anchor を employeeId × date でルックアップするマップ */
export function buildAnchorMap(anchors: Anchor[]): Map<string, Anchor> {
  const map = new Map<string, Anchor>()
  for (const a of anchors) {
    map.set(`${a.employeeId}|${a.date}`, a)
  }
  return map
}

/** ある (emp, date) が休み確定か */
export function isRestLocked(map: Map<string, Anchor>, empId: string, date: string): boolean {
  const a = map.get(`${empId}|${date}`)
  return a !== undefined && (a.kind === 'REST_LOCK' || a.kind === 'PAID_LEAVE')
}

/** ある (emp, date) が出勤確定か */
export function isWorkLocked(map: Map<string, Anchor>, empId: string, date: string): boolean {
  const a = map.get(`${empId}|${date}`)
  return a !== undefined && a.kind === 'WORK_LOCK'
}

/** ある (emp, date) で出勤確定の workplace を取得 (なければ null) */
export function getLockedWorkplace(
  map: Map<string, Anchor>,
  empId: string,
  date: string,
): Workplace | null {
  const a = map.get(`${empId}|${date}`)
  if (a?.kind === 'WORK_LOCK') return a.workplace ?? null
  return null
}
