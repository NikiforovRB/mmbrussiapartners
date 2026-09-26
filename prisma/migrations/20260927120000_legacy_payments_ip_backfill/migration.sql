-- Пополнения баланса дилера в старом ЛК DriveMods.
ALTER TABLE "LegacyDealer" ADD COLUMN "payments" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LegacyDealer" ADD COLUMN "paymentsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Адрес регистрации — первый известный IP представителя.
INSERT INTO "UserIp" ("id", "userId", "ip", "country", "city", "hits", "firstSeenAt", "lastSeenAt")
SELECT 'sig' || md5(p."userId" || p."signupIp"), p."userId", p."signupIp", p."signupCountry", p."signupCity", 1,
       p."createdAt", p."createdAt"
FROM "DealerProfile" p
WHERE p."signupIp" IS NOT NULL AND p."signupIp" <> ''
ON CONFLICT ("userId", "ip") DO NOTHING;
