#!/usr/bin/env bash
# Обновление кабинета на виртуальной машине: подтянуть код, поставить
# зависимости, применить миграции, пересобрать и перезапустить сервис.
# Запуск: bash deploy/update.sh (из корня проекта, от пользователя deploy).
set -euo pipefail

APP_DIR="/opt/mmbrussia-partners"
SERVICE="mmbrussia-cabinet"
BRANCH="main"

cd "$APP_DIR"

echo "==> git: подтягиваем $BRANCH"
git fetch --prune origin
git reset --hard "origin/$BRANCH"

# npm ci ставит и dev-зависимости — без prisma/typescript/tailwind сборка не пройдёт.
# Поэтому NODE_ENV здесь НЕ должен быть production.
echo "==> npm ci"
NODE_ENV=development npm ci

echo "==> prisma migrate deploy"
npx prisma migrate deploy

echo "==> next build"
npm run build

echo "==> restart $SERVICE"
sudo systemctl restart "$SERVICE"

echo "==> health"
sleep 3
curl -fsS http://127.0.0.1:3000/api/health && echo

echo "==> готово"
