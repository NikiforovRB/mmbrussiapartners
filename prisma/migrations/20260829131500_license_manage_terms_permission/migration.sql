-- Изменение статуса, срока и типа лицензии вынесено из licenses.edit
-- в отдельное право: licenses.edit есть и у представителя (иначе он не
-- отредактировал бы карточку клиента), поэтому оно не могло ограничить его.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'licenses.manageTerms')
WHERE "isSystem" = TRUE
  AND "name" = 'Администратор'
  AND NOT ('licenses.manageTerms' = ANY ("permissions"));

-- Право на выдачу без оплаты добавили в код, но существующим ролям оно
-- не досталось: сид переписывает права только при повторном запуске.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'licenses.issueFree')
WHERE "isSystem" = TRUE
  AND "name" = 'Администратор'
  AND NOT ('licenses.issueFree' = ANY ("permissions"));
