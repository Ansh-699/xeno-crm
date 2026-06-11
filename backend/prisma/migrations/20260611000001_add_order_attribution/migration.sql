-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN "attributedCampaignId"      TEXT,
  ADD COLUMN "attributedCommunicationId" TEXT,
  ADD COLUMN "attributedAt"              TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_attributedCampaignId_idx" ON "Order"("attributedCampaignId");
