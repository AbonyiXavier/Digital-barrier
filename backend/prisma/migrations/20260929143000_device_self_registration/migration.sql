-- Scope installId to the user.
--
-- A device row means "this account is covered on this installation". The same
-- handset being signed in to two accounts is an ordinary thing — it is exactly
-- what happens while testing, and what happens when someone hands a spare phone
-- to a family member. A global unique made the second registration fail with a
-- conflict about a row the caller has no permission to see, which is both a poor
-- error and a leak of another account's existence.
--
-- Postgres treats NULLs as distinct in a unique index, so devices that were
-- paired without an installId are unaffected and any number of them may coexist.

DROP INDEX "device_installId_key";

CREATE UNIQUE INDEX "device_userId_installId_key" ON "device" ("userId", "installId");
