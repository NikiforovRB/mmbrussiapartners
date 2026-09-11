# Перенос кабинета на виртуальную машину (Yandex Cloud)

Пошаговый перенос личного кабинета `cabinet.mmbrussia.ru` с App Platform на
обычную ВМ. Приложение — Next.js (SSR), запускается как Node-процесс под
systemd, снаружи стоит nginx с TLS (Let's Encrypt). База данных и S3 остаются
внешними — на ВМ переносится только приложение.

В репозитории лежат готовые файлы (см. эту папку):

- `systemd/mmbrussia-cabinet.service` — юнит автозапуска Node-процесса;
- `nginx/cabinet.mmbrussia.ru.conf` — реверс-прокси и TLS;
- `update.sh` — обновление кабинета (pull → ci → migrate → build → restart).

Значения по умолчанию (можно менять): каталог `/opt/mmbrussia-partners`,
системный пользователь `deploy`, порт приложения `3000`, Ubuntu 24.04 LTS.

---

## 0. Что понадобится

- ВМ Ubuntu 24.04 LTS, 2 vCPU / 4 ГБ (для сборки Next хватает; при нехватке
  памяти сборку можно делать со `swap`).
- Публичный IP у ВМ.
- Группа безопасности (firewall) с входящими портами: `22` (только со своего
  IP), `80`, `443`. Порт `3000` наружу НЕ открываем — на нём слушает только
  localhost.
- Доступ к DNS домена `mmbrussia.ru`, чтобы A-запись `cabinet` навести на ВМ.
- Строки подключения к Б-данных PostgreSQL и ключи S3 (как в `.env.example`).

---

## 1. Создать ВМ

В консоли Yandex Cloud → Compute Cloud → «Создать ВМ»:

- Образ: **Ubuntu 24.04 LTS**.
- vCPU/RAM: 2 / 4 ГБ (гарантированная доля 100%).
- Публичный IP: «Автоматически» (или зарезервируйте статический).
- Доступ: логин `ubuntu`, добавьте свой **SSH-ключ** (публичный).
- Группа безопасности: разрешите входящие `22`, `80`, `443`.

Запишите публичный IP ВМ — он понадобится в DNS.

---

## 2. DNS: навести домен на ВМ

У держателя NS домена `mmbrussia.ru` замените A-запись подстроки `cabinet`:

```
cabinet.mmbrussia.ru.  A  <PUBLIC_IP_ВМ>
```

Сейчас `cabinet` указывает на App Platform (`72.56.246.219`) — меняем на IP ВМ.
Апекс `mmbrussia.ru` и `www` не трогаем, они остаются на прежнем хостинге.
Дождитесь обновления (`nslookup cabinet.mmbrussia.ru` должен вернуть новый IP) —
без этого Let's Encrypt не выпустит сертификат.

---

## 3. Базовая настройка сервера

Зайдите по SSH и подготовьте систему:

```bash
ssh ubuntu@<PUBLIC_IP_ВМ>

sudo apt update && sudo apt -y upgrade

# Отдельный непривилегированный пользователь под приложение.
sudo adduser --system --group --home /opt/mmbrussia-partners deploy

# Локальный firewall (в дополнение к группе безопасности).
sudo apt -y install ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 4. Node.js, nginx, certbot

```bash
# Node.js 20 LTS (репозиторий NodeSource).
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs

# nginx + certbot.
sudo apt -y install nginx certbot python3-certbot-nginx git
node -v   # ожидаем v20.x
```

---

## 5. Deploy key и клонирование репозитория

Репозиторий приватный, поэтому даём ВМ **read-only** доступ через deploy key.

На ВМ сгенерируйте ключ от имени `deploy`:

```bash
sudo -u deploy ssh-keygen -t ed25519 -C "mmbrussia-vm" -f /opt/mmbrussia-partners/.ssh/id_ed25519 -N ""
sudo -u deploy cat /opt/mmbrussia-partners/.ssh/id_ed25519.pub
```

Скопируйте вывод (`ssh-ed25519 …`) и в GitHub → репозиторий
`NikiforovRB/mmbrussiapartners` → **Settings → Deploy keys → Add deploy key**:

- Title: `mmbrussia-vm`;
- Key: вставьте публичный ключ;
- **Allow write access — не включать** (деплой только читает код).

Клонируйте проект:

```bash
sudo -u deploy git clone git@github.com:NikiforovRB/mmbrussiapartners.git /opt/mmbrussia-partners/app
# Приводим к ожидаемому пути /opt/mmbrussia-partners:
sudo rsync -a /opt/mmbrussia-partners/app/ /opt/mmbrussia-partners/
sudo rm -rf /opt/mmbrussia-partners/app
sudo chown -R deploy:deploy /opt/mmbrussia-partners
```

> Проще: сделайте домашним каталогом `deploy` именно `/opt/mmbrussia-partners`
> и клонируйте прямо в него (`git clone … .`). Держите `.ssh` вне дерева git.

---

## 6. Переменные окружения

Создайте `/opt/mmbrussia-partners/.env` (Next читает его и на сборке, и в
рантайме). За основу — `.env.example`, значения — боевые. Ключевое:

```bash
NEXTAUTH_URL="https://cabinet.mmbrussia.ru"     # обязательно https
NEXTAUTH_SECRET="<openssl rand -base64 48>"
DATABASE_URL="postgresql://…"                    # внешняя БД
DIRECT_URL="postgresql://…"
# S3, SMTP, ATOL, DRIVEMODS и NEXT_PUBLIC_* — из .env.example
```

```bash
sudo -u deploy openssl rand -base64 48   # для NEXTAUTH_SECRET
sudo chmod 600 /opt/mmbrussia-partners/.env
sudo chown deploy:deploy /opt/mmbrussia-partners/.env
```

> `NEXT_PUBLIC_*` вшиваются в бандл на сборке — задайте их до `npm run build`,
> иначе придётся пересобирать.

---

## 7. Установка зависимостей, миграции, сборка

```bash
cd /opt/mmbrussia-partners
sudo -u deploy npm ci                 # dev-зависимости нужны для сборки
sudo -u deploy npx prisma migrate deploy
sudo -u deploy npm run build
```

Если сборке недоступна БД (миграции падают на `prisma migrate deploy`) —
примените миграции отдельно, когда БД будет доступна; сборка Next саму базу
не трогает.

---

## 8. Автозапуск через systemd

```bash
sudo cp deploy/systemd/mmbrussia-cabinet.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mmbrussia-cabinet
sudo systemctl status mmbrussia-cabinet --no-pager

# Проверка, что приложение отвечает локально:
curl -fsS http://127.0.0.1:3000/api/health   # → {"ok":true,...}
```

Логи процесса: `sudo journalctl -u mmbrussia-cabinet -f`.

---

## 9. nginx + HTTPS (Let's Encrypt)

Сначала подготовим webroot и выпустим сертификат, затем включим прокси-конфиг:

```bash
# 1. Каталог для ACME-проверки.
sudo mkdir -p /var/www/certbot

# 2. Выпуск сертификата (DNS уже должен указывать на ВМ, п.2).
sudo certbot certonly --webroot -w /var/www/certbot -d cabinet.mmbrussia.ru \
  --agree-tos -m marat@mmbrussia.ru --no-eff-email

# 3. Подключаем конфиг сайта.
sudo cp deploy/nginx/cabinet.mmbrussia.ru.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/cabinet.mmbrussia.ru.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 4. Проверка и перезапуск.
sudo nginx -t && sudo systemctl reload nginx
```

Автопродление сертификата уже настроено пакетом certbot
(`systemctl list-timers | grep certbot`). После продления nginx перечитывает
конфиг сам; при желании добавьте `--deploy-hook "systemctl reload nginx"`.

---

## 10. Проверка

```bash
curl -fsS https://cabinet.mmbrussia.ru/api/health          # {"ok":true,...}
curl -sI  http://cabinet.mmbrussia.ru/ | grep -i location  # 308 → https
```

Откройте `https://cabinet.mmbrussia.ru/login` в браузере, войдите — cookie
сессии должна ставиться и вход не должен слетать (это признак, что
`X-Forwarded-Proto https` доходит и `useSecureCookies` совпадает со схемой).

---

## 11. Обновление после пуша в `main`

```bash
cd /opt/mmbrussia-partners
sudo -u deploy bash deploy/update.sh
```

Скрипт подтянет код, поставит зависимости, применит миграции, пересоберёт и
перезапустит сервис. Для `systemctl restart` пользователю `deploy` нужно
право на эту команду без пароля:

```bash
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart mmbrussia-cabinet' \
  | sudo tee /etc/sudoers.d/mmbrussia-deploy
```

Автодеплой по push (опционально) настраивается позже через GitHub Actions
(self-hosted runner) или webhook, дёргающий `update.sh`.

---

## 12. Отключить старый App Platform

После того как кабинет заработал на ВМ:

- в App Platform отвяжите домен `cabinet.mmbrussia.ru` и остановите/удалите
  приложение, чтобы не платить за него и не путать деплои;
- убедитесь, что DNS `cabinet` указывает только на IP ВМ.

---

## Безопасность

- Приватный ключ TLS и `.env` **не хранятся в репозитории** — только на ВМ.
- Node слушает `127.0.0.1`, наружу открыты только `80/443` (и `22` со своего IP).
- Для кабинета используется Let's Encrypt; сертификат GlobalSign, что был в
  панели, относится к апексу `www.mmbrussia.ru` и здесь не применяется. Если
  его приватный ключ где-то засветился — перевыпустите его у поставщика.
