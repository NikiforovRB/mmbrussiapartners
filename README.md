# MMB RUSSIA — Личный кабинет представителей

Корпоративный портал MMB RUSSIA с двумя кабинетами — суперадминистратора и партнёра. Генерация лицензий, гео-аналитика, отчёты, управление дилерской сетью, публичный API для основного сайта.

## Стек

- **Next.js 15** (App Router, RSC, Server Actions)
- **TypeScript** (strict)
- **Tailwind CSS 3.4** + кастомные дизайн-токены (без обводок и теней)
- **Framer Motion** (анимации, microinteractions, scroll reveal)
- **PostgreSQL 18** + **Prisma ORM** (`prisma migrate deploy`)
- **Auth.js v5** (Credentials + bcrypt + базовая инфраструктура под TOTP 2FA)
- **AWS SDK v3** для S3 (Twcstorage)
- **exceljs** (отчёты XLSX)
- **Nodemailer** (SMTP)
- **Lucide** outline-иконки

## Быстрый старт

```bash
npm install
cp .env.example .env

npm run db:deploy
npm run db:seed

npm run dev
```

Откройте `http://localhost:3000`. Войдите как первый администратор:

- Email: `nikiforovrb@yandex.ru`
- Пароль: `1vngbwxcn824`

## Скрипты

| Команда | Описание |
| --- | --- |
| `npm run dev` | Dev-сервер |
| `npm run build` | Продакшен-сборка |
| `npm run db:deploy` | `prisma migrate deploy` — продакшен-миграции |
| `npm run db:migrate` | `prisma migrate dev` — создать миграцию |
| `npm run db:seed` | Сидинг (роли, первый админ, шаблоны email) |
| `npm run db:studio` | Prisma Studio |
| `npm run test:integrations` | Проверка DRIVEMODS и АТОЛ Онлайн (можно передать `-- ./device_id.bin`) |
| `npm run test:payments` | Прогон цикла платежа: счёт → оплата → чек |
| `npm run vercel-build` | `prisma generate && prisma migrate deploy && next build` |

## Деплой на Vercel

1. Создайте проект и подключите репозиторий.
2. В Project Settings → Environment Variables — заполните всё из `.env.example`. Обязательные: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, S3-блок, `PUBLIC_SITE_ORIGIN`.

   Генерация лицензий (мастер-аккаунт DRIVEMODS): `DRIVEMODS_STORE_API_URL`, `DRIVEMODS_USERNAME`, `DRIVEMODS_PASSWORD`, `DRIVEMODS_CLIENT_TOKEN`.

   Касса и оплата: `ATOL_LOGIN`, `ATOL_PASSWORD`, `ATOL_GROUP`, `ATOL_BASE_URL`, `ATOL_COMPANY_INN`, `ATOL_COMPANY_EMAIL`, `ATOL_COMPANY_PAYMENT_ADDRESS`, `ATOL_COMPANY_SNO`, `ATOL_VAT_TYPE`, `PAYMENT_PROVIDER`, `PAYMENT_LICENSE_PRICE` (и `ATOL_PAY_API_TOKEN`, если включаете АТОЛ Pay).
3. Build Command — `npm run vercel-build`. Миграции применятся автоматически.
4. Cron-задачи (`vercel.json`):
   - `/api/cron/license-expiry` — ежедневное напоминание об истекающих лицензиях.
   - `/api/cron/expire-licenses` — ежедневный перевод просроченных в `EXPIRED`.

## Структура

```
src/
  app/
    (public)/         публичные страницы (login/register/forgot)
    (dealer)/         кабинет партнёра (/dealer/*)
    (admin)/          кабинет суперадминистратора (/admin/*)
    api/              REST endpoints + публичный API
  components/
    ui/               базовые UI-примитивы (без border, без shadow)
    animations/       Framer Motion обёртки (FadeUp, ScrollReveal, Magnetic)
    cabinet/          Sidebar, Topbar, Pagination, CommandPalette
    licenses/         таблица и редактор лицензий
    reports/          конструктор отчётов
  lib/
    db.ts             Prisma client
    auth.ts           Auth.js (Credentials + bcrypt)
    session.ts        requireSession / requirePermission
    s3.ts             S3 клиент Twcstorage с подписанными URL
    permissions.ts    каталог прав (PERMISSIONS / PERMISSION_GROUPS)
    notifications.ts  email + (заглушка) Telegram
    license-engine.ts генерация device-license.bin (заглушка под внешний API)
    payments/atol.ts  стаб платежей Atol Online
    dates.ts          формат "30 мая, сб", Москва
    utils.ts          cn, formatPhone, formatCurrency, generateLicenseNumber
prisma/
  schema.prisma
  migrations/         фиксированные SQL-миграции
  seed.ts             первый админ + системные роли + email-шаблоны
```

## Дизайн-система (важное)

- Никаких `border` и `box-shadow`. Разделители — через `background-color: var(--line)` и высоту 1px.
- Все кнопки имеют outline-иконку слева (Lucide).
- Дата отображается в формате `30 мая, сб` (Москва) — `formatRuDate()` в `lib/dates.ts`.
- Кастомный DatePicker с собственной модалкой.
- Toggle/Checkbox с spring-анимациями.
- Glassmorphism — только в hero-блоках (`surface-glass`, `surface-glass-dark`).

## Публичный API для mmbrussia.ru

`GET /api/public/representatives` — JSON со списком одобренных представителей с включённым тогглом "Показывать телефон на сайте":

```json
[
  {
    "fio": "Иванов Иван Иванович",
    "organization": "ИП Иванов",
    "phone": "+79250374666",
    "city": "Москва",
    "region": "Москва"
  }
]
```

- `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
- CORS: разрешён только для `PUBLIC_SITE_ORIGIN` (по умолчанию `https://mmbrussia.ru`).

Пример клиента на mmbrussia.ru:

```js
const res = await fetch("https://<your-vercel-domain>/api/public/representatives");
const reps = await res.json();
```

## Лицензии

Поток создания:

1. Дилер заходит в `/dealer/licenses/new`, проходит степпер из 3 шагов.
2. Загружает `device-id.bin` (drag-and-drop, до 5 МБ).
3. Сервер валидирует квоту, сохраняет device-id в S3, вызывает `lib/license-engine.ts`, сохраняет `device-license.bin` в S3, создаёт запись `License`, увеличивает счётчик и пишет аудит.
4. Дилер скачивает `device-license.bin` по подписанной ссылке (5 минут).

Внешний API генерации добавляется через `LICENSE_API_URL` + `LICENSE_API_KEY` в `lib/license-engine.ts` — менять остальной код не потребуется.

Аннулирование/отзыв требуют обязательную причину; при аннулировании уведомление уходит администраторам по email (Telegram-канал готов к подключению).

## Платежи и чеки

Это две независимые задачи, и решают их разные сервисы:

| Задача | Кто отвечает | Код |
| --- | --- | --- |
| Списать деньги с карты | эквайринг (АТОЛ Pay или банк) | `lib/payments/provider.ts` |
| Пробить фискальный чек по 54-ФЗ | облачная касса АТОЛ Онлайн | `lib/payments/atol.ts` |

**АТОЛ Онлайн денег не принимает** — сервис только регистрирует чеки. Реализован полный клиент API v5: `getToken` (токен кэшируется на 20 часов), `sell` (чек «Приход») и `report` (фискальные реквизиты). Ответ приходит либо POST-колбэком на `/api/atol/webhook`, либо опросом из карточки платежа.

Учётные данные для API берутся в личном кабинете АТОЛ Онлайн → Настройки → Интеграция («файл настроек интеграции»). Логин и пароль от самого кабинета для API не подходят.

Приём оплаты выбирается переменной `PAYMENT_PROVIDER`:

- `manual` (по умолчанию) — дилер получает счёт на `/dealer/payments/[id]`, администратор подтверждает поступление кнопкой «Оплачен». Подтверждение сразу запускает фискализацию.
- `atol_pay` — оплата по ссылке АТОЛ Pay, нужен `ATOL_PAY_API_TOKEN` из личного кабинета АТОЛ Pay.

Цикл платежа: счёт (`PENDING`) → оплата (`PAID`, `paidAt`) → чек (`receiptStatus`: `wait` → `done`/`fail`) → ссылка на чек ОФД в карточке платежа и в истории дилера.

Проверить конфигурацию: `npm run test:integrations` (внешние API) и `npm run test:payments` (полный цикл платежа на реальном коде).

## S3 (Twcstorage)

Используется бакет `mmbrussia-baket` с префиксом `partners-portal/`. Папки:

- `partners-portal/device-ids/` — загруженные device-id.bin
- `partners-portal/licenses/` — сгенерированные device-license.bin
- `partners-portal/avatars/` — аватары пользователей
- `partners-portal/exports/` — XLSX-отчёты
- `partners-portal/public/` — резерв под публичные снапшоты

## Roles & Permissions

Системные роли:
- `Администратор` — все права, защищена.
- `Представитель` — базовые права для дилеров.

Кастомные роли создаются на странице `/admin/roles` с галочками-разрешениями. Каталог прав — `src/lib/permissions.ts`.

## Дополнительные удобства

- **Cmd/Ctrl + K** — командная палитра во всех кабинетах.
- **Корзина** — soft delete с восстановлением (`/admin/trash`).
- **Аудит-журнал** (`/admin/audit`) — все действия с лицензиями.
- **Гео-аналитика** (`/admin/geo`) — топ регионов и городов.
- **Cron-напоминания** об истекающих лицензиях.

## Безопасность

- bcrypt 12 раундов для паролей.
- HttpOnly + SameSite cookies (Auth.js v5).
- Все мутации — через server actions / API роуты с проверкой прав.
- CORS на публичном API ограничен `PUBLIC_SITE_ORIGIN`.
- Подписанные S3-URL с TTL 5 минут.

## Следующие шаги (когда вы будете готовы)

- Внести реквизиты кассы (`ATOL_*`) — клиент API v5 уже готов, фискализация включится сама.
- Подключить эквайринг: получить `ATOL_PAY_API_TOKEN` и переключить `PAYMENT_PROVIDER` на `atol_pay`.
- Настроить Telegram-бот: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID`. Канал готов в `lib/notifications.ts`.
- Привязать SMTP (любой провайдер) для email-уведомлений.
