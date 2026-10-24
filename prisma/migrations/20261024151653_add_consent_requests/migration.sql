-- CreateTable
CREATE TABLE "ConsentRequest" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "state" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRequest_tokenHash_key" ON "ConsentRequest"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRequest_state_key" ON "ConsentRequest"("state");

-- CreateIndex
CREATE INDEX "ConsentRequest_mailboxId_idx" ON "ConsentRequest"("mailboxId");

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
