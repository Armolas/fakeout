import { Router, Request, Response } from 'express'
import { GameManager } from '../game/GameManager'
import { db } from '../db'

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
    const result = await db.query(
      'SELECT wallet_address, display_name, games_played, games_won, created_at FROM players WHERE wallet_address = $1',
      [req.params.walletAddress.toLowerCase()]
    )
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Player not found' })
    }
    res.json({ player: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/health
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'fakeout-backend' })
})

export default router
