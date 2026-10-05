-- Удаление записей о платежах — отдельное право; выдаём его существующей
-- системной роли без повторного запуска сида.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'payments.delete')
WHERE "isSystem" = TRUE
  AND "name" = 'Администратор'
  AND NOT ('payments.delete' = ANY ("permissions"));
