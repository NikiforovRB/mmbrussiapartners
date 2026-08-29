-- Кнопки заявки на главной переименованы в «Подать заявку на партнёрство».
-- Тексты главной редактируются в админке и хранятся в CompanySettings.homepage,
-- поэтому правки одних дефолтов в коде на сохранённый контент не влияют.
UPDATE "CompanySettings"
SET "homepage" = jsonb_set(
      jsonb_set(
        "homepage"::jsonb,
        '{hero,registerButton}',
        '"Подать заявку на партнёрство"'::jsonb,
        false
      ),
      '{cta,registerButton}',
      '"Подать заявку на партнёрство"'::jsonb,
      false
    )
WHERE "homepage" IS NOT NULL
  AND jsonb_typeof("homepage"::jsonb) = 'object';
