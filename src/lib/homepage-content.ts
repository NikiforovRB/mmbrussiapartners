import { z } from "zod";

const statSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

const stepSchema = z.object({
  number: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
});

export const homepageContentSchema = z.object({
  header: z.object({
    navWorkflow: z.string().min(1),
    navContacts: z.string().min(1),
    loginButton: z.string().min(1),
    registerButton: z.string().min(1),
  }),
  hero: z.object({
    badge: z.string().min(1),
    titleLine1: z.string().min(1),
    titleHighlight: z.string().min(1),
    description: z.string().min(1),
    loginButton: z.string().min(1),
    registerButton: z.string().min(1),
    stats: z.array(statSchema).length(4),
  }),
  workflow: z.object({
    badge: z.string().min(1),
    titleLine1: z.string().min(1),
    titleHighlight: z.string().min(1),
    steps: z.array(stepSchema).length(4),
  }),
  cta: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    registerButton: z.string().min(1),
    loginButton: z.string().min(1),
    phoneLabel: z.string().min(1),
    emailLabel: z.string().min(1),
  }),
  footer: z.object({
    copyrightPrefix: z.string().min(1),
    loginLink: z.string().min(1),
    registerLink: z.string().min(1),
  }),
});

export type HomepageContent = z.infer<typeof homepageContentSchema>;

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  header: {
    navWorkflow: "Как это работает",
    navContacts: "Контакты",
    loginButton: "Войти",
    registerButton: "Стать дилером",
  },
  hero: {
    badge: "Личный кабинет представителей нового поколения",
    titleLine1: "Управляйте лицензиями",
    titleHighlight: "в три клика",
    description:
      "Кабинет представителей MMB RUSSIA: генерация лицензий по device-id.bin, мониторинг сроков, гео-аналитика и управление дилерской сетью — всё в одном пространстве.",
    loginButton: "Войти в кабинет",
    registerButton: "Подать заявку на партнёрство",
    stats: [
      { value: "24/7", label: "Доступ к кабинету" },
      { value: "<1с", label: "Генерация лицензии" },
      { value: "85+", label: "Регионов России" },
      { value: "100%", label: "На стороне дилера" },
    ],
  },
  workflow: {
    badge: "4 шага",
    titleLine1: "От заявки до выдачи —",
    titleHighlight: "за один сеанс.",
    steps: [
      {
        number: "01",
        title: "Регистрация дилера",
        text: "Дилер регистрируется, администратор одобряет заявку, телефон автоматически попадает на сайт.",
      },
      {
        number: "02",
        title: "Загрузка device-id.bin",
        text: "Дилер выбирает тип лицензии и срок, загружает device-id.bin от ШГУ.",
      },
      {
        number: "03",
        title: "Выдача device-license.bin",
        text: "Сервер собирает лицензию, сохраняет в S3, дилер скачивает по подписанной ссылке.",
      },
      {
        number: "04",
        title: "Аудит и аналитика",
        text: "Каждое действие фиксируется. Отчёты, гео-аналитика, экспорт XLSX за любой период.",
      },
    ],
  },
  cta: {
    title: "Готовы подключиться?",
    description:
      "Зарегистрируйтесь как представитель — администратор одобрит вашу заявку и выдаст лимит лицензий.",
    registerButton: "Подать заявку на партнёрство",
    loginButton: "Войти",
    phoneLabel: "Телефон",
    emailLabel: "Почта",
  },
  footer: {
    copyrightPrefix: "MMB RUSSIA. Все права защищены.",
    loginLink: "Войти",
    registerLink: "Регистрация",
  },
};

export function mergeHomepageContent(raw: unknown): HomepageContent {
  const base = structuredClone(DEFAULT_HOMEPAGE_CONTENT);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<HomepageContent>;
  return {
    header: { ...base.header, ...data.header },
    hero: {
      ...base.hero,
      ...data.hero,
      stats: data.hero?.stats?.length === 4 ? data.hero.stats : base.hero.stats,
    },
    workflow: {
      ...base.workflow,
      ...data.workflow,
      steps: data.workflow?.steps?.length === 4 ? data.workflow.steps : base.workflow.steps,
    },
    cta: { ...base.cta, ...data.cta },
    footer: { ...base.footer, ...data.footer },
  };
}
