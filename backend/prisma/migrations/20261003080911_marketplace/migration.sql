-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('ITEM', 'SERVICE');

-- CreateEnum
CREATE TYPE "ListingCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'REMOVED');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('FIXED', 'AUCTION');

-- CreateEnum
CREATE TYPE "BarterOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'COUNTERED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "seller_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "area" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "whatsapp_phone" TEXT,
    "show_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "kind" "ListingKind" NOT NULL DEFAULT 'ITEM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "condition" "ListingCondition",
    "price_cents" INTEGER NOT NULL,
    "sale_type" "SaleType" NOT NULL DEFAULT 'FIXED',
    "open_to_barter" BOOLEAN NOT NULL DEFAULT false,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "area" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "auction_ends_at" TIMESTAMP(3),
    "current_bid_cents" INTEGER,
    "bid_count" INTEGER NOT NULL DEFAULT 0,
    "highest_bidder_id" TEXT,
    "auction_closed_at" TIMESTAMP(3),
    "sold_to_id" TEXT,
    "sold_at" TIMESTAMP(3),
    "search_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_photos" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumb_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_threads" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "seller_user_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buyer_read_at" TIMESTAMP(3),
    "seller_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barter_offers" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "seller_user_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "cash_cents" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "status" "BarterOfferStatus" NOT NULL DEFAULT 'PENDING',
    "parent_id" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barter_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barter_offer_items" (
    "offer_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,

    CONSTRAINT "barter_offer_items_pkey" PRIMARY KEY ("offer_id","listing_id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "bidder_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_follows" (
    "follower_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_follows_pkey" PRIMARY KEY ("follower_id","seller_id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "radius_km" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "last_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_profiles_user_id_key" ON "seller_profiles"("user_id");

-- CreateIndex
CREATE INDEX "listings_status_category_idx" ON "listings"("status", "category");

-- CreateIndex
CREATE INDEX "listings_status_created_at_idx" ON "listings"("status", "created_at");

-- CreateIndex
CREATE INDEX "listings_seller_id_status_idx" ON "listings"("seller_id", "status");

-- CreateIndex
CREATE INDEX "listings_sale_type_status_auction_ends_at_idx" ON "listings"("sale_type", "status", "auction_ends_at");

-- CreateIndex
CREATE INDEX "listing_photos_listing_id_sort_order_idx" ON "listing_photos"("listing_id", "sort_order");

-- CreateIndex
CREATE INDEX "listing_threads_buyer_id_last_message_at_idx" ON "listing_threads"("buyer_id", "last_message_at");

-- CreateIndex
CREATE INDEX "listing_threads_seller_user_id_last_message_at_idx" ON "listing_threads"("seller_user_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "listing_threads_listing_id_buyer_id_key" ON "listing_threads"("listing_id", "buyer_id");

-- CreateIndex
CREATE INDEX "listing_messages_thread_id_created_at_idx" ON "listing_messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_messages_sender_id_created_at_idx" ON "listing_messages"("sender_id", "created_at");

-- CreateIndex
CREATE INDEX "barter_offers_listing_id_status_idx" ON "barter_offers"("listing_id", "status");

-- CreateIndex
CREATE INDEX "barter_offers_buyer_id_created_at_idx" ON "barter_offers"("buyer_id", "created_at");

-- CreateIndex
CREATE INDEX "barter_offers_seller_user_id_created_at_idx" ON "barter_offers"("seller_user_id", "created_at");

-- CreateIndex
CREATE INDEX "barter_offers_created_by_id_created_at_idx" ON "barter_offers"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "barter_offer_items_listing_id_idx" ON "barter_offer_items"("listing_id");

-- CreateIndex
CREATE INDEX "bids_listing_id_created_at_idx" ON "bids"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "bids_bidder_id_created_at_idx" ON "bids"("bidder_id", "created_at");

-- CreateIndex
CREATE INDEX "seller_follows_seller_id_idx" ON "seller_follows"("seller_id");

-- CreateIndex
CREATE INDEX "saved_searches_user_id_idx" ON "saved_searches"("user_id");

-- AddForeignKey
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_highest_bidder_id_fkey" FOREIGN KEY ("highest_bidder_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_sold_to_id_fkey" FOREIGN KEY ("sold_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_threads" ADD CONSTRAINT "listing_threads_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_threads" ADD CONSTRAINT "listing_threads_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_threads" ADD CONSTRAINT "listing_threads_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_messages" ADD CONSTRAINT "listing_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "listing_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_messages" ADD CONSTRAINT "listing_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_offers" ADD CONSTRAINT "barter_offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_offers" ADD CONSTRAINT "barter_offers_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_offers" ADD CONSTRAINT "barter_offers_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_offers" ADD CONSTRAINT "barter_offers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_offers" ADD CONSTRAINT "barter_offers_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "barter_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_offer_items" ADD CONSTRAINT "barter_offer_items_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "barter_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_offer_items" ADD CONSTRAINT "barter_offer_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_follows" ADD CONSTRAINT "seller_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_follows" ADD CONSTRAINT "seller_follows_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
