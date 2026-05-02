// 強めのランダムパスワード生成 (英大文字/小文字/数字を1つ以上含む8文字)
// 紛らわしい文字 (I/O/l/o/0/1) を除外
export function generatePassword(length: number = 8): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digit = '23456789'
  const all = upper + lower + digit
  const arr: string[] = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digit[Math.floor(Math.random() * digit.length)],
  ]
  for (let i = 0; i < length - 3; i++) arr.push(all[Math.floor(Math.random() * all.length)])
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}
