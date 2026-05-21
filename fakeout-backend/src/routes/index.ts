import { Router, Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { GameManager } from '../game/GameManager'
import { db } from '../db'
import { players } from '../db/schema'

const router = Router()

// GET /api/lobbies — list public lobbies
router.get('/lobbies', (_req: Request, res: Response) => {
  const lobbies = GameManager.getPublicLobbies().map(game => ({
    roomCode: game.roomCode,
    playerCount: Object.keys(game.players).length,
    maxPlayers: 10,
    stakeAmount: game.stakeAmount,
    createdAt: game.createdAt,
  }))
  res.json({ lobbies })
})

// GET /api/players/:walletAddress — player profile
router.get('/players/:walletAddress', async (req: Request, res: Response) => {
  try {
    const [player] = await db
      .select({
        walletAddress: players.walletAddress,
        displayName: players.displayName,
        gamesPlayed: players.gamesPlayed,
        gamesWon: players.gamesWon,
        totalAmountWon: players.totalAmountWon,
        totalAmountLost: players.totalAmountLost,
        createdAt: players.createdAt,
      })
      .from(players)
      .where(eq(players.walletAddress, req.params.walletAddress.toLowerCase()))
    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }
    res.json({ player })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/players/:walletAddress — update display name
router.patch('/players/:walletAddress', async (req: Request, res: Response) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase()
    const { displayName } = req.body
    if (!displayName || typeof displayName !== 'string') {
      return res.status(400).json({ error: 'displayName required' })
    }
    const trimmed = displayName.trim().slice(0, 50)
    if (!trimmed) return res.status(400).json({ error: 'displayName cannot be empty' })

    await db
      .insert(players)
      .values({ walletAddress: wallet, displayName: trimmed })
      .onConflictDoUpdate({ target: players.walletAddress, set: { displayName: trimmed } })

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/health
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'fakeout-backend' })
})

export default router
