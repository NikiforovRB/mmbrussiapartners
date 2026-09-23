-- Email получателя фискального чека (тег 1008): на него ОФД/портал шлют чек.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receiptEmail" TEXT;

-- Редактируемые из админки настройки онлайн-оплаты (наименование услуги в чеке,
-- ставка НДС, признак способа расчёта). Секреты остаются в .env.
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "payment" JSONB;
