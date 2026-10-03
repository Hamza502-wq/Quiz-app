-- AlterTable
ALTER TABLE "riders" ALTER COLUMN "vehicle_plate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT;
