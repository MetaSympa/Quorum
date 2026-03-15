-- Reshape audit_logs into a transaction-only approved financial ledger.
-- Removes legacy entity/action snapshot columns and retains only the
-- immutable approved transaction snapshot plus performer metadata.

DELETE FROM "audit_logs"
WHERE "transactionId" IS NULL;

DELETE FROM "audit_logs" a
USING "transactions" t
WHERE a."transactionId" = t."id"
  AND t."approvalStatus" <> 'APPROVED';

DELETE FROM "audit_logs" a
USING "audit_logs" newer
WHERE a."transactionId" = newer."transactionId"
  AND a."id" < newer."id";

ALTER TABLE "audit_logs"
ADD COLUMN "transactionSnapshot" JSONB;

UPDATE "audit_logs" a
SET "transactionSnapshot" = jsonb_build_object(
  'id', t."id",
  'type', t."type",
  'category', t."category",
  'amount', t."amount"::text,
  'paymentMode', t."paymentMode",
  'description', t."description",
  'sponsorPurpose', t."sponsorPurpose",
  'approvalStatus', t."approvalStatus",
  'approvalSource', t."approvalSource",
  'enteredById', t."enteredById",
  'approvedById', t."approvedById",
  'approvedAt', CASE WHEN t."approvedAt" IS NULL THEN NULL ELSE to_char(t."approvedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
  'razorpayPaymentId', t."razorpayPaymentId",
  'razorpayOrderId', t."razorpayOrderId",
  'senderName', t."senderName",
  'senderPhone', t."senderPhone",
  'senderUpiId', t."senderUpiId",
  'senderBankAccount', t."senderBankAccount",
  'senderBankName', t."senderBankName",
  'receiptNumber', t."receiptNumber",
  'memberId', t."memberId",
  'sponsorId', t."sponsorId",
  'createdAt', to_char(t."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
FROM "transactions" t
WHERE a."transactionId" = t."id";

DELETE FROM "audit_logs"
WHERE "transactionSnapshot" IS NULL;

DROP INDEX IF EXISTS "audit_logs_entityType_entityId_idx";
DROP INDEX IF EXISTS "audit_logs_transactionId_idx";

ALTER TABLE "audit_logs"
DROP CONSTRAINT IF EXISTS "audit_logs_transactionId_fkey";

ALTER TABLE "audit_logs"
ALTER COLUMN "transactionId" SET NOT NULL,
ALTER COLUMN "transactionSnapshot" SET NOT NULL;

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_transactionId_key" UNIQUE ("transactionId");

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
DROP COLUMN "entityType",
DROP COLUMN "entityId",
DROP COLUMN "action",
DROP COLUMN "previousData",
DROP COLUMN "newData";
