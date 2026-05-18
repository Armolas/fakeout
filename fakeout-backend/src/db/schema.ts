import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  numeric,
  index,
  unique,
} from 'drizzle-orm/pg-core'

export const players = pgTable('players', {
  id:           uuid('id').primaryKey().defaultRandom(),
  walletAddress: varchar('wallet_address', { length: 42 }).unique().notNull(),
  displayName:  varchar('display_name', { length: 50 }).notNull(),
  gamesPlayed:  integer('games_played').notNull().default(0),
  gamesWon:     integer('games_won').notNull().default(0),
  createdAt:    timestamp('created_at').defaultNow(),
})

export const games = pgTable('games', {
  id:             uuid('id').primaryKey().defaultRandom(),
  roomCode:       varchar('room_code', { length: 8 }).unique().notNull(),
  type:           varchar('type', { length: 10 }).notNull(),
  status:         varchar('status', { length: 20 }).notNull().default('lobby'),
  word:           varchar('word', { length: 100 }),
  hint:           varchar('hint', { length: 100 }),
  stakeAmount:    numeric('stake_amount', { precision: 78, scale: 0 }).notNull().default('0'),
  potAmount:      numeric('pot_amount', { precision: 78, scale: 0 }).notNull().default('0'),
  contractGameId: varchar('contract_game_id', { length: 66 }),
  currentRound:   integer('current_round').default(0),
  maxRounds:      integer('max_rounds').default(3),
  createdBy:      uuid('created_by').references(() => players.id),
  createdAt:      timestamp('created_at').defaultNow(),
  completedAt:    timestamp('completed_at'),
}, (t) => [
  index('idx_games_room_code').on(t.roomCode),
  index('idx_games_status').on(t.status),
])

export const gamePlayers = pgTable('game_players', {
  id:              uuid('id').primaryKey().defaultRandom(),
  gameId:          uuid('game_id').references(() => games.id, { onDelete: 'cascade' }),
  playerId:        uuid('player_id').references(() => players.id),
  role:            varchar('role', { length: 10 }),
  isFirstGame:     boolean('is_first_game').default(false),
  hasSubmittedClue: boolean('has_submitted_clue').default(false),
  isEliminated:    boolean('is_eliminated').default(false),
  joinedAt:        timestamp('joined_at').defaultNow(),
}, (t) => [
  unique().on(t.gameId, t.playerId),
  index('idx_game_players_game_id').on(t.gameId),
])

export const clues = pgTable('clues', {
  id:          uuid('id').primaryKey().defaultRandom(),
  gameId:      uuid('game_id').references(() => games.id, { onDelete: 'cascade' }),
  playerId:    uuid('player_id').references(() => players.id),
  roundNumber: integer('round_number').notNull(),
  clueText:    varchar('clue_text', { length: 200 }).notNull(),
  submittedAt: timestamp('submitted_at').defaultNow(),
}, (t) => [
  index('idx_clues_game_round').on(t.gameId, t.roundNumber),
])

export const votes = pgTable('votes', {
  id:          uuid('id').primaryKey().defaultRandom(),
  gameId:      uuid('game_id').references(() => games.id, { onDelete: 'cascade' }),
  voterId:     uuid('voter_id').references(() => players.id),
  votedForId:  uuid('voted_for_id').references(() => players.id),
  voteRound:   integer('vote_round').notNull().default(1),
  createdAt:   timestamp('created_at').defaultNow(),
}, (t) => [
  unique().on(t.gameId, t.voterId, t.voteRound),
  index('idx_votes_game_round').on(t.gameId, t.voteRound),
])
