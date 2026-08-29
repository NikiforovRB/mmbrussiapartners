-- Право licenses.cancel означает аннулирование ЛЮБОЙ лицензии сети, а не
-- только своей: маршрут /cancel пропускал по нему без проверки владельца.
-- Представителю оно не нужно — на свою лицензию он подаёт заявку через
-- /cancel-request, доступ к которой даёт само владение.
UPDATE "Role"
SET "permissions" = array_remove("permissions", 'licenses.cancel')
WHERE "isSystem" = TRUE
  AND "name" = 'Представитель';
