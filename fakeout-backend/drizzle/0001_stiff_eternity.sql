ALTER TABLE "players" ADD COLUMN "total_amount_won" varchar(78) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "total_amount_lost" varchar(78) DEFAULT '0' NOT NULL;