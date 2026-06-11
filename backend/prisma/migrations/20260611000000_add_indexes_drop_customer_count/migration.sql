-- DropColumn
ALTER TABLE "Segment" DROP COLUMN "customerCount";

-- CreateIndex
CREATE INDEX "Customer_city_idx" ON "Customer"("city");

-- CreateIndex
CREATE INDEX "Customer_optedOut_idx" ON "Customer"("optedOut");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Order_customerId_orderedAt_idx" ON "Order"("customerId", "orderedAt");

-- CreateIndex
CREATE INDEX "Outbox_aggregateId_idx" ON "Outbox"("aggregateId");
