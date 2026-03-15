'use client'

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

// シングルトン接続
let socketSingleton: Socket | null = null

function getSocket(): Socket {
  if (!socketSingleton) {
    socketSingleton = io(window.location.origin, { path: '/socket.io' })
  }
  return socketSingleton
}

export function useSocket(storeId?: string) {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socket = getSocket()
    socketRef.current = socket

    if (storeId) {
      socket.emit('join:store', storeId)
    }
  }, [storeId])

  return socketRef
}
