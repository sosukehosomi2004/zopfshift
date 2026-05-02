// 認証切れリダイレクトを検出して、JSON以外を安全に処理する fetch ラッパー
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T | null> {
  const res = await fetch(input, init)
  // セッション切れで /login にリダイレクトされた場合
  if (res.redirected && res.url.includes('/login')) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    return null
  }
  if (!res.ok) return null
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
