-- Make Player.start_time nullable
ALTER TABLE "Player" ALTER COLUMN "start_time" DROP NOT NULL;
