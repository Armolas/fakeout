import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import routes from './routes'
import { registerSocketHandlers } from './socket/handlers'

dotenv.config()

const app = express()
const httpServer = createServer(app)

const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'https://playfakeout.xyz',
]

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
})

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: ALLOWED_ORIGINS,
}))
app.use(express.json())

// ─── REST routes ─────────────────────────────────────────────────────────────
app.use('/api', routes)

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)
  registerSocketHandlers(io, socket)

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} — ${reason}`)
  })
})

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`
  ███████╗ █████╗ ██╗  ██╗███████╗ ██████╗ ██╗   ██╗████████╗
  ██╔════╝██╔══██╗██║ ██╔╝██╔════╝██╔═══██╗██║   ██║╚══██╔══╝
  █████╗  ███████║█████╔╝ █████╗  ██║   ██║██║   ██║   ██║
  ██╔══╝  ██╔══██║██╔═██╗ ██╔══╝  ██║   ██║██║   ██║   ██║
  ██║     ██║  ██║██║  ██╗███████╗╚██████╔╝╚██████╔╝   ██║
  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝    ╚═╝

  🎮 Backend running on port ${PORT}
  `)
})

export { io }
