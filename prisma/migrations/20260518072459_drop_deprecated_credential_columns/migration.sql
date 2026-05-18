/*
  Warnings:

  - You are about to drop the column `key_deprecated` on the `CredentialField` table. All the data in the column will be lost.
  - You are about to drop the column `secret_deprecated` on the `CredentialField` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CredentialField" DROP COLUMN "key_deprecated",
DROP COLUMN "secret_deprecated";
