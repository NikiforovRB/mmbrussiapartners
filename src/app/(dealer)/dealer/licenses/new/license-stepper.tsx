"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileBox,
  KeyRound,
  Download,
  User as UserIcon,
  Building2,
  Mail,
  Phone,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { LICENSE_TYPE_OPTIONS } from "@/lib/license-options";

type Step = 1 | 2 | 3 | 4;

type LicItem = {
  index: number;
  product: string;
  bundle: string | null;
  region: string | null;
  fullName: string;
};

type LicInfo = {
  recoverable: boolean;
  versionSoftware: string;
  versionCustom: string;
  deviceId: string;
  items: LicItem[];
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function LicenseStepper({
  limit,
  used,
  context = "dealer",
  dealerName = "",
}: {
  limit: number;
  used: number;
  context?: "dealer" | "admin";
  dealerName?: string;
}) {
  const router = useRouter();
  const isAdmin = context === "admin";
  const basePath = isAdmin ? "/admin/licenses" : "/dealer/licenses";
  const remaining = Math.max(0, limit - used);
  const [step, setStep] = React.useState<Step>(1);

  const [file, setFile] = React.useState<File | null>(null);
  const [deviceBase64, setDeviceBase64] = React.useState<string>("");
  const [loadingInfo, setLoadingInfo] = React.useState(false);
  const [info, setInfo] = React.useState<LicInfo | null>(null);

  const [type, setType] = React.useState<string>("Генерация");
  const [productIndex, setProductIndex] = React.useState<string>("");
  const [dealerComment, setDealerComment] = React.useState<string>(dealerName);
  const [withoutPayment, setWithoutPayment] = React.useState<boolean>(isAdmin);
  const [customer, setCustomer] = React.useState({
    fio: "",
    organization: "",
    email: "",
    phone: "",
    region: "",
    city: "",
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{
    licenseId: string;
    number: string;
    downloadUrl: string;
    filename?: string;
    payment?: { id: string; amount: number; payUrl: string | null } | null;
  } | null>(null);

  const selectedItem = info?.items.find((i) => String(i.index) === productIndex) ?? null;

  async function checkLicense() {
    if (!file) {
      toast.error("Загрузите файл device_id.bin");
      return;
    }
    setLoadingInfo(true);
    try {
      const [b64, res] = await Promise.all([
        fileToBase64(file),
        (async () => {
          const fd = new FormData();
          fd.append("device", file);
          return fetch("/api/drivemods/licinfo", { method: "POST", body: fd });
        })(),
      ]);
      setDeviceBase64(b64);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "Не удалось получить данные лицензии");
        return;
      }
      const data: LicInfo = await res.json();
      setInfo(data);
      if (data.items.length > 0) setProductIndex(String(data.items[0].index));
      setStep(2);
    } catch {
      toast.error("Ошибка запроса к сервису лицензий");
    } finally {
      setLoadingInfo(false);
    }
  }

  function toStep3() {
    if (!selectedItem) {
      toast.error("Выберите продукт");
      return;
    }
    if (!dealerComment.trim()) {
      toast.error("Укажите комментарий дилера (имя субдилера)");
      return;
    }
    setStep(3);
  }

  async function submit() {
    if (!selectedItem || !deviceBase64 || !info) return;
    setSubmitting(true);
    const res = await fetch("/api/drivemods/createlic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceBase64,
        deviceId: info.deviceId,
        type,
        product: selectedItem.product,
        bundle: selectedItem.bundle,
        region: selectedItem.region,
        versionSoftware: info.versionSoftware,
        versionCustom: info.versionCustom,
        dealerComment: dealerComment.trim(),
        customerFio: customer.fio,
        customerOrganization: customer.organization,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerRegion: customer.region,
        customerCity: customer.city,
        ...(isAdmin ? { issuedWithoutPayment: withoutPayment } : {}),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сгенерировать лицензию");
      return;
    }
    const data = await res.json();
    setResult({
      licenseId: data.licenseId,
      number: data.number,
      downloadUrl: data.downloadUrl,
      filename: data.filename,
      payment: data.payment ?? null,
    });
    setStep(4);
    router.refresh();
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      <Card className="h-fit">
        <div className="text-xs uppercase tracking-widest text-ink-muted">Шаги</div>
        <ol className="mt-4 space-y-1.5">
          {[
            { id: 1, label: "Загрузка device_id.bin" },
            { id: 2, label: "Продукт и параметры" },
            { id: 3, label: "Подтверждение" },
            { id: 4, label: "Готово" },
          ].map((s) => {
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-3 rounded-panel px-3 py-2.5 text-sm ${
                  isActive ? "bg-white" : "text-ink-muted"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-panel text-[11px] ${
                    isDone ? "bg-accent text-white" : isActive ? "bg-bg-dark text-white" : "bg-card-light text-ink-muted"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.id}
                </span>
                <span>{s.label}</span>
              </li>
            );
          })}
        </ol>
        <div className="divider mt-5 mb-5" />
        <div className="text-xs text-ink-muted">Доступно лицензий</div>
        <div className="mt-1 font-display text-2xl  tracking-tight">
          {remaining}
          <span className="text-ink-subtle text-sm font-normal"> / {limit}</span>
        </div>
      </Card>

      <div className="min-h-[480px]">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="s1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <Card>
                <div className="flex items-center gap-3 mb-2">
                  <Sparkles className="h-5 w-5 text-accent" />
                  <div className="font-display text-lg  tracking-tight">Загрузите файл device_id.bin</div>
                </div>
                <p className="text-sm text-ink-muted mb-5">
                  Файл создаётся ШГУ автоматически. Мы отправим его в сервис DRIVEMODS и покажем доступные продукты.
                </p>
                <DropZone file={file} onChange={setFile} />
                <div className="mt-6 flex justify-end gap-2">
                  <Button loading={loadingInfo} onClick={checkLicense} icon={<ArrowRight className="h-4 w-4" />}>
                    Проверить лицензию
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : null}

          {step === 2 && info ? (
            <motion.div key="s2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="grid gap-5">
                <Card>
                  <div className="font-display text-lg  tracking-tight mb-4">Данные ШГУ</div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <Info label="Версия ПО" value={info.versionSoftware || "—"} />
                    <Info label="Версия кастома" value={info.versionCustom || "—"} />
                    <Info label="ID устройства" value={info.deviceId || "—"} />
                  </div>
                  <div className="mt-3">
                    {info.recoverable ? (
                      <Tag tone="success">Восстановление доступно</Tag>
                    ) : (
                      <Tag tone="muted">Восстановление недоступно</Tag>
                    )}
                  </div>
                </Card>

                <Card>
                  <div className="font-display text-lg  tracking-tight mb-4">Продукт и тип</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Select
                      label="Тип лицензии"
                      value={type}
                      onChange={setType}
                      options={LICENSE_TYPE_OPTIONS}
                    />
                    <Select
                      label="Продукт"
                      value={productIndex}
                      onChange={setProductIndex}
                      placeholder="Выберите продукт"
                      options={info.items.map((it) => ({ value: String(it.index), label: it.fullName }))}
                    />
                  </div>
                  {info.items.length === 0 ? (
                    <p className="mt-3 text-sm text-danger">
                      Для этого устройства нет доступных продуктов для генерации.
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <Input
                      label="Комментарий дилера (имя субдилера) *"
                      value={dealerComment}
                      onChange={(e) => setDealerComment(e.target.value)}
                      placeholder="Например: Артур, Москва"
                      icon={<UserIcon className="h-4 w-4" />}
                    />
                  </div>
                </Card>

                <Card>
                  <div className="font-display text-lg  tracking-tight mb-1">Данные клиента</div>
                  <p className="text-xs text-ink-muted mb-4">Необязательно, для вашего учёта.</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Input
                      label="ФИО"
                      icon={<UserIcon className="h-4 w-4" />}
                      value={customer.fio}
                      onChange={(e) => setCustomer({ ...customer, fio: e.target.value })}
                    />
                    <Input
                      label="Организация"
                      icon={<Building2 className="h-4 w-4" />}
                      value={customer.organization}
                      onChange={(e) => setCustomer({ ...customer, organization: e.target.value })}
                    />
                    <Input
                      label="Email"
                      icon={<Mail className="h-4 w-4" />}
                      value={customer.email}
                      onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    />
                    <Input
                      label="Телефон"
                      icon={<Phone className="h-4 w-4" />}
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    />
                    <Input
                      label="Регион"
                      value={customer.region}
                      onChange={(e) => setCustomer({ ...customer, region: e.target.value })}
                    />
                    <Input
                      label="Город"
                      value={customer.city}
                      onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                    />
                  </div>
                </Card>

                <div className="flex justify-between gap-2">
                  <Button variant="ghost" onClick={() => setStep(1)} icon={<ArrowLeft className="h-4 w-4" />}>
                    Назад
                  </Button>
                  <Button onClick={toStep3} iconRight={<ArrowRight className="h-4 w-4" />}>
                    Подтверждение
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}

          {step === 3 && info ? (
            <motion.div key="s3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <Card>
                <div className="font-display text-lg  tracking-tight mb-4">Подтверждение</div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <Row label="Тип лицензии" value={<Tag tone="accent">{type}</Tag>} />
                  <Row label="Продукт" value={selectedItem?.fullName ?? "—"} />
                  <Row label="Версия ПО" value={info.versionSoftware || "—"} />
                  <Row label="Версия кастома" value={info.versionCustom || "—"} />
                  <Row label="ID устройства" value={info.deviceId || "—"} />
                  <Row label="Комментарий дилера" value={dealerComment || "—"} />
                  <Row label="Файл device_id.bin" value={file ? `${file.name} · ${formatBytes(file.size)}` : "—"} />
                  <Row label="Клиент" value={customer.fio || "—"} />
                </div>

                {isAdmin ? (
                  <>
                    <div className="divider my-5" />
                    <div className="rounded-panel bg-white p-4">
                      <Checkbox
                        checked={withoutPayment}
                        onChange={setWithoutPayment}
                        label="Выдать без оплаты"
                        description="Лицензия будет помечена как выданная без оплаты (комплимент/тест)."
                      />
                    </div>
                  </>
                ) : null}

                <div className="mt-6 flex justify-between gap-2">
                  <Button variant="ghost" onClick={() => setStep(2)} icon={<ArrowLeft className="h-4 w-4" />}>
                    Назад
                  </Button>
                  <Button loading={submitting} onClick={submit} icon={<KeyRound className="h-4 w-4" />}>
                    Сгенерировать лицензию
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : null}

          {step === 4 && result ? (
            <motion.div key="s4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <Card tone="dark" className="relative overflow-hidden">
                <div className="absolute -top-32 -right-20 h-80 w-80 rounded-full blob"
                  style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)" }} />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-panel bg-white/10 px-3.5 py-1.5 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-bg-accent" /> Лицензия сгенерирована
                  </div>
                  <h2 className="mt-4 font-display text-3xl  tracking-tightest">{result.number}</h2>
                  <p className="mt-2 text-white/70">
                    Файл {result.filename ?? "device-license.bin"} готов к скачиванию. Передайте его клиенту.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <a href={result.downloadUrl} download={result.filename ?? "device-license.bin"}>
                      <Button variant="primary" icon={<Download className="h-4 w-4" />}>Скачать лицензию</Button>
                    </a>
                    <a href={`${basePath}/${result.licenseId}`}>
                      <Button variant="ghost" className="text-white hover:bg-white/10" icon={<FileBox className="h-4 w-4" />}>
                        Открыть карточку
                      </Button>
                    </a>
                  </div>
                </div>
              </Card>
              {result.payment ? (
                <Card className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-accent" />
                        <div className="font-display tracking-tight">Счёт на оплату</div>
                      </div>
                      <p className="mt-1 text-sm text-ink-muted">
                        К оплате {result.payment.amount.toLocaleString("ru-RU")} ₽. Фискальный чек
                        придёт после подтверждения оплаты.
                      </p>
                    </div>
                    <a href={result.payment.payUrl ?? `/dealer/payments/${result.payment.id}`}>
                      <Button variant="secondary">Перейти к оплате</Button>
                    </a>
                  </div>
                </Card>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-tight text-ink-subtle">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel bg-white p-3">
      <div className="text-[11px] uppercase tracking-tight text-ink-subtle">{label}</div>
      <div className="mt-1 text-sm break-all">{value}</div>
    </div>
  );
}

function DropZone({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = React.useState(false);

  function onSelect(f: File) {
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Файл слишком большой (>5 МБ)");
      return;
    }
    onChange(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onSelect(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-panel bg-white p-10 text-center transition-all ${
        drag ? "ring-2 ring-accent" : ""
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".bin,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
        }}
      />
      {file ? (
        <div className="flex items-center justify-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-panel bg-card-light text-accent">
            <FileBox className="h-6 w-6" />
          </div>
          <div className="text-left">
            <div className="">{file.name}</div>
            <div className="text-xs text-ink-muted">{formatBytes(file.size)}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-panel bg-card-light text-accent">
            <Upload className="h-7 w-7" />
          </div>
          <div className="mt-4 ">Перетащите файл или нажмите для выбора</div>
          <div className="text-xs text-ink-muted mt-1">Только .bin, до 5 МБ</div>
        </>
      )}
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

void ShieldCheck;
