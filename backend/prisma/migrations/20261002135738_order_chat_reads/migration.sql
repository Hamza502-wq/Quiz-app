-- CreateTable
CREATE TABLE "chat_reads" (
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_reads_pkey" PRIMARY KEY ("order_id","user_id")
);

-- CreateIndex
CREATE INDEX "chat_reads_user_id_idx" ON "chat_reads"("user_id");

-- AddForeignKey
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
