# FAKEOUT — Backend

Real-time social deduction game engine built on Node.js + Socket.io + PostgreSQL.

## Stack
- **Runtime**: Node.js + TypeScript
- **Real-time**: Socket.io
- **Database**: PostgreSQL
- **Blockchain**: Celo (via viem) — smart contract for staking/rewards

## Getting Started

```bash
# Install dependencies
npm install

# Copy env
cp .env.example .env
# Fill in your DATABASE_URL and contract details

# Run DB migrations
npm run db:migrate

# Start dev server
npm run dev
```

## Project Structure

```
src/
├── data/
│   └── wordBank.ts          # ~80 curated words with single-word hints
├── db/
│   ├── index.ts             # PostgreSQL pool + query helpers
│   └── migrate.ts           # DB schema migration
├── game/
│   └── GameManager.ts       # Core game engine — all state + logic
├── routes/
│   └── index.ts             # REST endpoints (lobbies, player stats)
├── services/
│   └── wordService.ts       # Word selection with filtering
├── socket/
│   └── handlers.ts          # All Socket.io event handlers
├── types/
│   └── index.ts             # All TypeScript types
└── index.ts                 # App entry point
```

## Socket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `game:create` | `{ walletAddress, displayName, type, stakeAmount }` | Create new game |
| `game:join` | `{ walletAddress, displayName, roomCode? }` | Join game |
| `game:rejoin` | `{ walletAddress, roomCode }` | Reconnect to active game |
| `game:start` | `{ roomCode, hostWalletAddress }` | Host starts game |
| `clue:submit` | `{ roomCode, walletAddress, clueText }` | Submit clue (single word) |
| `vote:submit` | `{ roomCode, voterWalletAddress, votedForWalletAddress }` | Cast vote |

### Server → Client
| Event | Description |
|-------|-------------|
| `game:created` | Confirms game creation with room code |
| `game:joined` | Confirms join + lobby state |
| `game:rejoined` | Full game state for reconnecting player |
| `lobby:updated` | Lobby state changed (player joined/left) |
| `lobby:list_updated` | Public lobby list updated |
| `game:started` | Game started — private word/role assignment |
| `round:started` | New clue round begins |
| `clue:progress` | How many players have submitted clues |
| `round:clues` | All clues for the round revealed |
| `vote:started` | Voting phase begins |
| `vote:updated` | Anonymous vote count update |
| `game:tiebreak` | Tie detected — sudden death |
| `player:eliminated` | A player was voted out |
| `game:result` | Game over — outcome, word reveal, winners |
| `player:reconnected` | A player reconnected |
| `error` | Error with code + message |

## Game Flow

```
lobby → active (clue rounds 1→N) → voting → [tiebreak?] → completed
```

## Error Codes
| Code | Meaning |
|------|---------|
| `GAME_NOT_FOUND` | Room code doesn't exist |
| `GAME_ALREADY_STARTED` | Can't join a started game |
| `GAME_FULL` | 10 players max |
| `NOT_HOST` | Only host can start |
| `NOT_ENOUGH_PLAYERS` | Need at least 3 |
| `CLUE_MUST_BE_SINGLE_WORD` | Clues are one word only |
| `ALREADY_VOTED` | Can't vote twice |
| `PLAYER_ELIMINATED` | Eliminated players can't submit clues |
