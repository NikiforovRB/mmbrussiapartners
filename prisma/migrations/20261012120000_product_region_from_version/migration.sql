-- Уведомление администраторам: DriveMods отклонил генерацию
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'LICENSE_FAILED';

-- Справочник цен — в тех же названиях, что присылает DriveMods (/licinfo и
-- выгрузка старого ЛК): продукт без комплектации, регион — только если
-- DriveMods его присылает. Индивидуальные цены дилеров привязаны к id позиции
-- и остаются на месте.
UPDATE "PriceListItem" SET "product" = 'MB-GEN5', "bundle" = 'CUSTOM+RUS', "region" = ''
WHERE "product" = 'MB-GEN5 CUSTOM+RUS' AND "bundle" = 'FULL' AND "region" = 'RUS'
  AND NOT EXISTS (
    SELECT 1 FROM "PriceListItem" WHERE "product" = 'MB-GEN5' AND "bundle" = 'CUSTOM+RUS' AND "region" = ''
  );

UPDATE "PriceListItem" SET "product" = 'LG-GEN5', "bundle" = 'CUSTOM+RUS', "region" = ''
WHERE "product" = 'LG-GEN5 CUSTOM+RUS' AND "bundle" = 'FULL' AND "region" = 'RUS'
  AND NOT EXISTS (
    SELECT 1 FROM "PriceListItem" WHERE "product" = 'LG-GEN5' AND "bundle" = 'CUSTOM+RUS' AND "region" = ''
  );

UPDATE "PriceListItem" SET "bundle" = 'RUS', "region" = ''
WHERE "product" = 'MB-GEN4' AND "bundle" = 'FULL' AND "region" = 'RUS'
  AND NOT EXISTS (
    SELECT 1 FROM "PriceListItem" WHERE "product" = 'MB-GEN4' AND "bundle" = 'RUS' AND "region" = ''
  );

UPDATE "PriceListItem" p SET "region" = ''
WHERE p."product" = 'MB-S5WM' AND p."bundle" IN ('FULL', 'ECO') AND p."region" = 'RUS'
  AND NOT EXISTS (
    SELECT 1 FROM "PriceListItem" q WHERE q."product" = p."product" AND q."bundle" = p."bundle" AND q."region" = ''
  );

-- Регион позиции DriveMods — отдельно от региона продукта: по нему ищется цена.
ALTER TABLE "License" ADD COLUMN "catalogRegion" TEXT;

-- До сих пор он лежал в «Регионе продукта». Переносим, только если в
-- справочнике есть позиция с таким регионом: у MB-S5WM DriveMods региона не
-- присылает, RUS туда подставлял справочник.
UPDATE "License" l SET "catalogRegion" = upper(trim(l."productRegion"))
WHERE coalesce(trim(l."productRegion"), '') <> ''
  AND EXISTS (
    SELECT 1 FROM "PriceListItem" i
    WHERE i."product" = upper(trim(l."product"))
      AND i."bundle" = upper(coalesce(trim(l."bundle"), ''))
      AND i."region" = upper(trim(l."productRegion"))
  );

-- Регион продукта — рынок ШГУ из версии ПО: SP2CPE.CHN.S5W_M… → CHN.
UPDATE "License" SET "productRegion" = upper(split_part("versionSoftware", '.', 2))
WHERE upper(split_part(coalesce("versionSoftware", ''), '.', 2)) ~ '^[A-Z]{3}$'
  AND coalesce("productRegion", '') <> upper(split_part("versionSoftware", '.', 2));

-- Код рынка не вторым сегментом версии (тот же список, что в src/lib/pricing.ts).
UPDATE "License"
SET "productRegion" = (regexp_match(
  upper("versionSoftware"),
  '(^|[^A-Z0-9])(AUS|BRA|CAN|CHN|CIS|EUR|GCC|GEN|HKG|IND|JPN|KOR|LTN|MES|MEX|NZL|RUS|TUR|TWN|USA)([^A-Z0-9]|$)'
))[2]
WHERE upper(split_part(coalesce("versionSoftware", ''), '.', 2)) !~ '^[A-Z]{3}$'
  AND upper(coalesce("versionSoftware", '')) ~ '(^|[^A-Z0-9])(AUS|BRA|CAN|CHN|CIS|EUR|GCC|GEN|HKG|IND|JPN|KOR|LTN|MES|MEX|NZL|RUS|TUR|TWN|USA)([^A-Z0-9]|$)';
