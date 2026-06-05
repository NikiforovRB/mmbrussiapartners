import Link from "next/link";
import {
  ArrowRight,
  KeyRound,
  CheckCircle2,
  PhoneCall,
  Mail,
  Sparkles,
} from "lucide-react";
import { LoginLink } from "@/components/auth/login-link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { FadeUp } from "@/components/animations/fade-up";
import { HeroBackground } from "@/components/marketing/hero-background";
import { getCompanyContacts, getHomepageContent } from "@/lib/company-settings";
import type { HomepageContent } from "@/lib/homepage-content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [content, contacts] = await Promise.all([getHomepageContent(), getCompanyContacts()]);
  const phoneHref = `tel:${contacts.phone.replace(/[^\d+]/g, "")}`;

  return (
    <main className="min-h-screen">
      <Header content={content} />
      <Hero content={content} />
      <Workflow content={content} />
      <CtaContact content={content} phone={contacts.phone} email={contacts.email} phoneHref={phoneHref} />
      <Footer content={content} />
    </main>
  );
}

function Header({ content }: { content: HomepageContent }) {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 h-20 flex items-center justify-between">
        <Logo height={32} />
        <nav className="hidden md:flex items-center gap-1 rounded-panel bg-card-light px-1.5 py-1.5">
          <a href="#workflow" className="px-4 py-2 text-sm rounded-panel hover:bg-white">
            {content.header.navWorkflow}
          </a>
          <a href="#contacts" className="px-4 py-2 text-sm rounded-panel hover:bg-white">
            {content.header.navContacts}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <LoginLink>
            <Button variant="ghost" size="sm">
              {content.header.loginButton}
            </Button>
          </LoginLink>
          <Link href="/register">
            <Button size="sm" icon={<ArrowRight className="h-4 w-4" />}>
              {content.header.registerButton}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero({ content }: { content: HomepageContent }) {
  return (
    <section className="relative overflow-hidden grid-mesh pt-28 pb-24 md:pt-36 md:pb-32 gradient-grid">
      <HeroBackground />
      <div className="relative z-[1] mx-auto max-w-7xl px-6 lg:px-10">
        <FadeUp>
          <span className="inline-flex items-center gap-2 rounded-panel bg-white/70 px-3.5 py-1.5 text-xs tracking-tight text-ink-muted backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> {content.hero.badge}
          </span>
        </FadeUp>
        <FadeUp delay={0.05}>
          <h1 className="mt-6 font-display text-5xl md:text-7xl tracking-tightest leading-[1.02] text-balance">
            {content.hero.titleLine1}
            <br />
            <span className="gradient-text">{content.hero.titleHighlight}</span>
          </h1>
        </FadeUp>
        <FadeUp delay={0.1}>
          <p className="mt-6 max-w-xl text-lg text-ink-muted text-pretty">
            {content.hero.description}
          </p>
        </FadeUp>
        <FadeUp delay={0.18}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <LoginLink>
              <Button size="lg" icon={<KeyRound className="h-4 w-4" />}>{content.hero.loginButton}</Button>
            </LoginLink>
            <Link href="/register">
              <Button size="lg" variant="secondary" icon={<ArrowRight className="h-4 w-4" />}>
                {content.hero.registerButton}
              </Button>
            </Link>
          </div>
        </FadeUp>
        <FadeUp delay={0.25}>
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
            {content.hero.stats.map((s) => (
              <div key={s.label} className="rounded-panel bg-white/60 px-5 py-4 backdrop-blur-sm">
                <div className="font-display text-2xl tracking-tight">{s.value}</div>
                <div className="text-xs text-ink-muted mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

function Workflow({ content }: { content: HomepageContent }) {
  return (
    <section id="workflow" className="relative py-24 surface-dark">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <ScrollReveal>
          <span className="inline-flex items-center gap-2 rounded-panel bg-white/10 px-3.5 py-1.5 text-xs text-white/70">
            <CheckCircle2 className="h-3.5 w-3.5" /> {content.workflow.badge}
          </span>
          <h2 className="mt-4 font-display text-3xl md:text-5xl tracking-tightest text-white">
            {content.workflow.titleLine1}
            <br /> <span className="text-bg-accent">{content.workflow.titleHighlight}</span>
          </h2>
        </ScrollReveal>
        <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {content.workflow.steps.map((s, i) => (
            <ScrollReveal key={s.number} delay={i * 0.05}>
              <div className="rounded-panel surface-glass-dark p-6 h-full">
                <div className="font-display text-3xl text-bg-accent">{s.number}</div>
                <div className="mt-6 font-display tracking-tight text-lg">{s.title}</div>
                <div className="mt-2 text-sm text-white/70">{s.text}</div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaContact({
  content,
  phone,
  email,
  phoneHref,
}: {
  content: HomepageContent;
  phone: string;
  email: string;
  phoneHref: string;
}) {
  return (
    <section id="contacts" className="relative py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="rounded-panel bg-card-light p-8 md:p-14 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <ScrollReveal>
              <h2 className="font-display text-3xl md:text-4xl tracking-tightest">
                {content.cta.title}
              </h2>
              <p className="mt-3 text-ink-muted max-w-md">
                {content.cta.description}
              </p>
              <div className="mt-7 flex gap-3 flex-wrap">
                <Link href="/register">
                  <Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                    {content.cta.registerButton}
                  </Button>
                </Link>
                <LoginLink>
                  <Button size="lg" variant="dark" icon={<KeyRound className="h-4 w-4" />}>
                    {content.cta.loginButton}
                  </Button>
                </LoginLink>
              </div>
            </ScrollReveal>
          </div>
          <div className="space-y-3">
            <ScrollReveal delay={0.1}>
              <a
                href={phoneHref}
                className="flex items-center gap-4 rounded-panel bg-white p-5 hover-lift"
              >
                <span className="grid h-12 w-12 place-items-center rounded-panel bg-card-light text-accent">
                  <PhoneCall className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs text-ink-muted">{content.cta.phoneLabel}</span>
                  <span className="block tracking-tight">{phone}</span>
                </span>
              </a>
            </ScrollReveal>
            <ScrollReveal delay={0.16}>
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-4 rounded-panel bg-white p-5 hover-lift"
              >
                <span className="grid h-12 w-12 place-items-center rounded-panel bg-card-light text-accent">
                  <Mail className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs text-ink-muted">{content.cta.emailLabel}</span>
                  <span className="block tracking-tight">{email}</span>
                </span>
              </a>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ content }: { content: HomepageContent }) {
  return (
    <footer className="py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-muted">
          © {new Date().getFullYear()} {content.footer.copyrightPrefix}
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <LoginLink className="hover:text-ink">{content.footer.loginLink}</LoginLink>
          <span>·</span>
          <Link href="/register" className="hover:text-ink">{content.footer.registerLink}</Link>
        </div>
      </div>
    </footer>
  );
}
