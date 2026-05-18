import { db } from './index'

const migration = `
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  -- Players
  CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    games_played INT DEFAULT 0,
    games_won INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- Games
  CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(8) UNIQUE NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('public', 'private')),
    status VARCHAR(20) NOT NULL DEFAULT 'lobby'
      CHECK (status IN ('lobby', 'active', 'voting', 'tiebreak', 'completed')),
    word VARCHAR(100),
    hint VARCHAR(100),
    stake_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    pot_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    contract_game_id VARCHAR(66),
    current_round INT DEFAULT 0,
    max_rounds INT DEFAULT 3,
    created_by UUID REFERENCES players(id),
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
  );

  -- Game Players
  CREATE TABLE IF NOT EXISTS game_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    role VARCHAR(10) CHECK (role IN ('crewmate', 'impostor')),
    is_first_game BOOLEAN DEFAULT FALSE,
    has_submitted_clue BOOLEAN DEFAULT FALSE,
    is_eliminated BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(game_id, player_id)
  );

  -- Clues
  CREATE TABLE IF NOT EXISTS clues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    round_number INT NOT NULL,
    clue_text VARCHAR(200) NOT NULL,
    submitted_at TIMESTAMP DEFAULT NOW()
  );

  -- Votes
  CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    voter_id UUID REFERENCES players(id),
    voted_for_id UUID REFERENCES players(id),
    vote_round INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(game_id, voter_id, vote_round)
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
  CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
  CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
  CREATE INDEX IF NOT EXISTS idx_clues_game_round ON clues(game_id, round_number);
  CREATE INDEX IF NOT EXISTS idx_votes_game_round ON votes(game_id, vote_round);
`

async function migrate() {
  try {
    console.log('🔄 Running migrations...')
    await db.query(migration)
    console.log('✅ Migrations complete')
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  }
}

migrate()
