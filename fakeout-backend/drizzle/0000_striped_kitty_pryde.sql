CREATE TABLE "clues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid,
	"player_id" uuid,
	"round_number" integer NOT NULL,
	"clue_text" varchar(200) NOT NULL,
	"submitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "game_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid,
	"player_id" uuid,
	"role" varchar(10),
	"is_first_game" boolean DEFAULT false,
	"has_submitted_clue" boolean DEFAULT false,
	"is_eliminated" boolean DEFAULT false,
	"joined_at" timestamp DEFAULT now(),
	CONSTRAINT "game_players_game_id_player_id_unique" UNIQUE("game_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" varchar(8) NOT NULL,
	"type" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'lobby' NOT NULL,
	"word" varchar(100),
	"hint" varchar(100),
	"stake_amount" numeric(78, 0) DEFAULT '0' NOT NULL,
	"pot_amount" numeric(78, 0) DEFAULT '0' NOT NULL,
	"contract_game_id" varchar(66),
	"current_round" integer DEFAULT 0,
	"max_rounds" integer DEFAULT 3,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	CONSTRAINT "games_room_code_unique" UNIQUE("room_code")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"games_won" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "players_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid,
	"voter_id" uuid,
	"voted_for_id" uuid,
	"vote_round" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "votes_game_id_voter_id_vote_round_unique" UNIQUE("game_id","voter_id","vote_round")
);
--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_players_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_id_players_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voted_for_id_players_id_fk" FOREIGN KEY ("voted_for_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_clues_game_round" ON "clues" USING btree ("game_id","round_number");--> statement-breakpoint
CREATE INDEX "idx_game_players_game_id" ON "game_players" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_games_room_code" ON "games" USING btree ("room_code");--> statement-breakpoint
CREATE INDEX "idx_games_status" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_votes_game_round" ON "votes" USING btree ("game_id","vote_round");