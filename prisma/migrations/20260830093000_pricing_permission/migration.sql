-- Справочник цен появился отдельным правом: сид переписывает права ролей
-- только при повторном запуске, поэтому выдаём его существующей роли явно.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'pricing.manage')
WHERE "isSystem" = TRUE
  AND "name" = 'Администратор'
  AND NOT ('pricing.manage' = ANY ("permissions"));
