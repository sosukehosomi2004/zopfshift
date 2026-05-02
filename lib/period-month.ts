// シフト期間の年月計算ヘルパー
// 「N月度」 = (N-1)月21日 〜 N月20日 (label の月 = endDate の月)

export type FiscalMonth = { fiscalYear: number; month: number }

/**
 * 日付から「○月度」を求める
 * 例: 2026-05-21 → { fiscalYear: 2026, month: 6 } (6月度)
 *     2026-06-20 → { fiscalYear: 2026, month: 6 }
 *     2026-06-21 → { fiscalYear: 2026, month: 7 }
 *     2026-12-21 → { fiscalYear: 2027, month: 1 }
 */
export function getFiscalMonthFromDate(date: Date): FiscalMonth {
  const day = date.getDate()
  const m = date.getMonth() + 1
  const y = date.getFullYear()
  if (day >= 21) {
    if (m === 12) return { fiscalYear: y + 1, month: 1 }
    return { fiscalYear: y, month: m + 1 }
  }
  return { fiscalYear: y, month: m }
}

/**
 * 「○月度」から期間の開始日・終了日を返す
 * 例: { fiscalYear: 2026, month: 6 } → 2026-05-21 〜 2026-06-20
 */
export function getPeriodRange(
  fiscalYear: number,
  month: number,
): { start: Date; end: Date } {
  const startMonth = month === 1 ? 12 : month - 1
  const startYear = month === 1 ? fiscalYear - 1 : fiscalYear
  const start = new Date(`${startYear}-${String(startMonth).padStart(2, '0')}-21T00:00:00`)
  const end = new Date(`${fiscalYear}-${String(month).padStart(2, '0')}-20T23:59:59`)
  return { start, end }
}

/** 「2026年6月度」のようなラベル */
export function getMonthLabel(fiscalYear: number, month: number): string {
  return `${fiscalYear}年${month}月度`
}

/** YYYY-MM-DD ↔ Date */
export function parseISODate(s: string): Date {
  return new Date(s + 'T00:00:00')
}
