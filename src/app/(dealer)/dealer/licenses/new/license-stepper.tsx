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
  Mail,
  Phone,
  User as UserIcon,
  Building2,
  Car,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { formatRuDate, addMonths } from "@/lib/dates";

type Step = 1 | 2 | 3 | 4;

const FEATURES_DEFAULT: Record<string, boolean> = {
  carplay: true,
  android_auto: true,
  navi: true,
  voice: true,
  hidden_menu: false,
  dvr: false,
  hud: false,
};

const FEATURE_LABELS: Record<string, string> = {
  carplay: "CarPlay",
  android_auto: "Android Auto",
  navi: "Навигация",
  voice: "Голосовое управление",
  hidden_menu: "Скрытые функции",
  dvr: "Видеорегистратор",
  hud: "HUD",
};

export function LicenseStepper({ limit, used }: { limit: number; used: number }) {
  const router = useRouter();
  const remaining = Math.max(0, limit - used);
  const [step, setStep] = React.useState<Step>(1);

  const [file, setFile] = React.useState<File | null>(null);
  const [type, setType] = React.useState<"ECO" | "FULL" | "CUSTOM">("FULL");
  const [features, setFeatures] = React.useState(FEATURES_DEFAULT);
  const [termStart, setTermStart] = React.useState<Date | null>(new Date());
  const [termEnd, setTermEnd] = React.useState<Date | null>(addMonths(new Date(), 12));
  const [customer, setCustomer] = React.useState({
    fio: "",
    organization: "",
    email: "",
    phone: "",
    region: "",
    city: "",
    vehicleVin: "",
    vehicleModel: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{
    licenseId: string;
    number: string;
    downloadUrl: string;
  } | null>(null);

  function next() {
    if (step === 1 && !file) {
      toast.error("Загрузите файл device-id.bin");
      return;
    }
    if (step === 2) {
      if (!customer.fio.trim()) {
        toast.error("Укажите ФИО клиента");
        return;
      }
      if (!termStart || !termEnd) {
        toast.error("Укажите срок действия");
        return;
      }
      if (termEnd.getTime() <= termStart.getTime()) {
        toast.error("Срок окончания должен быть позже начала");
        return;
      }
    }
    setStep((s) => (Math.min(4, s + 1) as Step));
  }
  function back() {
    setStep((s) => (Math.max(1, s - 1) as Step));
  }

  async function submit() {
    if (!file || !termStart || !termEnd) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.append("device", file);
    fd.append("type", type);
    fd.append("features", JSON.stringify(features));
    fd.append("termStart", termStart.toISOString());
    fd.append("termEnd", termEnd.toISOString());
    fd.append("customerFio", customer.fio);
    fd.append("customerOrganization", customer.organization);
    fd.append("customerEmail", customer.email);
    fd.append("customerPhone", customer.phone);
    fd.append("customerRegion", customer.region);
    fd.append("customerCity", customer.city);
    fd.append("vehicleVin", customer.vehicleVin);
    fd.append("vehicleModel", customer.vehicleModel);

    const res = await fetch("/api/licenses/generate", { method: "POST", body: fd });
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
            { id: 1, label: "Загрузка device-id.bin" },
            { id: 2, label: "Параметры лицензии" },
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
                  <div className="font-display text-lg  tracking-tight">Загрузите файл device-id.bin</div>
                </div>
                <p className="text-sm text-ink-muted mb-5">
                  Файл создаётся ШГУ автоматически после прошивки и сохраняется на USB-флешке.
                </p>
                <DropZone file={file} onChange={setFile} />
                <div className="mt-6 flex justify-end gap-2">
                  <Button onClick={next} icon={<ArrowRight className="h-4 w-4" />}>
                    Далее
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : null}

          {step === 2 ? (
            <motion.div key="s2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="grid gap-5">
                <Card>
                  <div className="font-display text-lg  tracking-tight mb-4">Тип лицензии</div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {(["ECO", "FULL", "CUSTOM"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setType(t);
                          if (t === "ECO") setFeatures({ ...FEATURES_DEFAULT, hidden_menu: false, dvr: false, hud: false, voice: false });
                          if (t === "FULL") setFeatures({ ...FEATURES_DEFAULT, hidden_menu: true, dvr: true, hud: true });
                        }}
                        className={`rounded-panel bg-white p-5 text-left transition-all ${
                          type === t ? "ring-0 outline-none scale-[1.01] bg-accent text-white" : ""
                        }`}
                      >
                        <div className="font-display text-2xl  tracking-tight">{t}</div>
                        <div className={`text-xs mt-1 ${type === t ? "text-white/70" : "text-ink-muted"}`}>
                          {t === "ECO" && "Базовые функции"}
                          {t === "FULL" && "Все функции"}
                          {t === "CUSTOM" && "Свой набор опций"}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="divider my-5" />
                  <div className="grid sm:grid-cols-2 gap-3">
                    {Object.keys(FEATURE_LABELS).map((k) => (
                      <Checkbox
                        key={k}
                        checked={features[k]}
                        onChange={(v) => setFeatures((f) => ({ ...f, [k]: v }))}
                        label={FEATURE_LABELS[k]}
                      />
                    ))}
                  </div>
                </Card>
                <Card>
                  <div className="font-display text-lg  tracking-tight mb-4">Срок действия</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <DatePicker label="Начало" value={termStart} onChange={setTermStart} />
                    <DatePicker label="Окончание" value={termEnd} onChange={setTermEnd} min={termStart ?? undefined} />
                  </div>
                </Card>
                <Card>
                  <div className="font-display text-lg  tracking-tight mb-4">Данные клиента</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Input
                      label="ФИО *"
                      icon={<UserIcon className="h-4 w-4" />}
                      value={customer.fio}
                      onChange={(e) => setCustomer({ ...customer, fio: e.target.value })}
                      placeholder="Иванов Иван Иванович"
                    />
                    <Input
                      label="Организация"
                      icon={<Building2 className="h-4 w-4" />}
                      value={customer.organization}
                      onChange={(e) => setCustomer({ ...customer, organization: e.target.value })}
                      placeholder="ООО / ИП"
                    />
                    <Input
                      label="Email"
                      icon={<Mail className="h-4 w-4" />}
                      value={customer.email}
                      onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                      placeholder="example@mail.ru"
                    />
                    <Input
                      label="Телефон"
                      icon={<Phone className="h-4 w-4" />}
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      placeholder="+7 ___ ___-__-__"
                    />
                    <Input
                      label="Регион"
                      value={customer.region}
                      onChange={(e) => setCustomer({ ...customer, region: e.target.value })}
                      placeholder="Москва"
                    />
                    <Input
                      label="Город"
                      value={customer.city}
                      onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                      placeholder="Москва"
                    />
                    <Input
                      label="VIN автомобиля"
                      icon={<Car className="h-4 w-4" />}
                      value={customer.vehicleVin}
                      onChange={(e) => setCustomer({ ...customer, vehicleVin: e.target.value })}
                      placeholder="WDB..."
                    />
                    <Input
                      label="Модель автомобиля"
                      value={customer.vehicleModel}
                      onChange={(e) => setCustomer({ ...customer, vehicleModel: e.target.value })}
                      placeholder="Mercedes-Benz E-class"
                    />
                  </div>
                </Card>
                <div className="flex justify-between gap-2">
                  <Button variant="ghost" onClick={back} icon={<ArrowLeft className="h-4 w-4" />}>
                    Назад
                  </Button>
                  <Button onClick={next} iconRight={<ArrowRight className="h-4 w-4" />}>Подтверждение</Button>
                </div>
              </div>
            </motion.div>
          ) : null}

          {step === 3 ? (
            <motion.div key="s3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <Card>
                <div className="font-display text-lg  tracking-tight mb-4">Подтверждение</div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <Row label="Тип лицензии" value={<Tag tone="accent">{type}</Tag>} />
                  <Row label="Файл device-id.bin" value={file ? `${file.name} · ${formatBytes(file.size)}` : "—"} />
                  <Row label="Срок начала" value={termStart ? formatRuDate(termStart) : "—"} />
                  <Row label="Срок окончания" value={termEnd ? formatRuDate(termEnd) : "—"} />
                  <Row label="ФИО клиента" value={customer.fio || "—"} />
                  <Row label="Организация" value={customer.organization || "—"} />
                  <Row label="Email клиента" value={customer.email || "—"} />
                  <Row label="Телефон" value={customer.phone || "—"} />
                  <Row label="Регион / Город" value={[customer.region, customer.city].filter(Boolean).join(", ") || "—"} />
                  <Row label="Авто (VIN / Модель)" value={[customer.vehicleVin, customer.vehicleModel].filter(Boolean).join(" · ") || "—"} />
                </div>
                <div className="divider my-5" />
                <div className="font-display  tracking-tight mb-3">Включённые функции</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(features).filter(([, v]) => v).map(([k]) => (
                    <Tag key={k} tone="accent">{FEATURE_LABELS[k]}</Tag>
                  ))}
                  {Object.values(features).every((v) => !v) ? (
                    <span className="text-sm text-ink-muted">— ни одной не выбрано</span>
                  ) : null}
                </div>
                <div className="mt-6 flex justify-between gap-2">
                  <Button variant="ghost" onClick={back} icon={<ArrowLeft className="h-4 w-4" />}>
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
                  <h2 className="mt-4 font-display text-3xl  tracking-tightest">
                    {result.number}
                  </h2>
                  <p className="mt-2 text-white/70">
                    Файл device-license.bin готов к скачиванию. Передайте его клиенту вместе с инструкцией.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <a href={result.downloadUrl} download="device-license.bin">
                      <Button variant="primary" icon={<Download className="h-4 w-4" />}>Скачать device-license.bin</Button>
                    </a>
                    <a href={`/dealer/licenses/${result.licenseId}`}>
                      <Button variant="ghost" className="text-white hover:bg-white/10" icon={<FileBox className="h-4 w-4" />}>
                        Открыть карточку
                      </Button>
                    </a>
                  </div>
                </div>
              </Card>
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
        drag ? "scale-[1.01]" : ""
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
