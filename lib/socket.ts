import type { Server } from 'socket.io'

export function getIO(): Server | null {
  return ((global as unknown as { io?: Server }).io) ?? null
}
