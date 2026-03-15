import { createServer } from 'http'
import { Server } from 'socket.io'
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handler = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer(handler)

  const io = new Server(httpServer, {
    cors: { origin: '*' },
  })

  // API ルートから参照できるようグローバルに保持
  ;(global as unknown as { io: Server }).io = io

  io.on('connection', (socket) => {
    socket.on('join:store', (storeId: string) => {
      socket.join(`store:${storeId}`)
    })

    socket.on('disconnect', () => {
      // cleanup handled by socket.io
    })
  })

  const port = parseInt(process.env.PORT ?? '3000', 10)
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
