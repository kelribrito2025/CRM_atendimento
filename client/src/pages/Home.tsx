import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  Mail,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const queueItems = [
  {
    initials: "MA",
    name: "Marina Alves",
    subject: "Dúvida sobre meu pedido",
    channel: "WhatsApp",
    time: "agora",
    color: "bg-[#ddf7f3] text-[#087f73]",
  },
  {
    initials: "RC",
    name: "Rafael Costa",
    subject: "Preciso alterar meu cadastro",
    channel: "E-mail",
    time: "2 min",
    color: "bg-[#e7edff] text-[#3857b9]",
  },
  {
    initials: "LS",
    name: "Larissa Souza",
    subject: "Status da solicitação #2148",
    channel: "Chat",
    time: "5 min",
    color: "bg-[#fff0da] text-[#a55b06]",
  },
];

function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Atende CRM">
      <div
        className={`relative grid size-10 place-items-center rounded-[14px] shadow-sm ${
          inverted ? "bg-white/14 text-white ring-1 ring-white/20" : "bg-[#173f74] text-white"
        }`}
      >
        <MessageCircleMore className="size-5" strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-current bg-[#27c6a8]" />
      </div>
      <div>
        <div className={`font-display text-[19px] font-bold leading-none tracking-[-0.04em] ${inverted ? "text-white" : "text-[#112f56]"}`}>
          Atende
        </div>
        <div className={`mt-1 text-[9px] font-bold uppercase tracking-[0.22em] ${inverted ? "text-white/55" : "text-[#73839a]"}`}>
          CRM
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (!email || !password) {
      toast.error("Preencha seu e-mail e sua senha para continuar.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Digite um endereço de e-mail válido.");
      return;
    }

    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      toast.success("Acesso demonstrativo validado.");
      setLocation("/atendimento");
    }, 850);
  };

  return (
    <div className="w-full max-w-[430px] animate-login-in">
      <div className="mb-9">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#eef4fb] px-3 py-1.5 text-xs font-bold text-[#31547d] ring-1 ring-[#dce8f5]">
          <Sparkles className="size-3.5 text-[#1da98f]" />
          Ambiente de demonstração
        </div>
        <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-bold leading-[1.08] tracking-[-0.045em] text-[#102d50]">
          Que bom ter você de volta.
        </h1>
        <p className="mt-3 max-w-[390px] text-[15px] leading-6 text-[#6c7d92]">
          Acesse sua central e transforme cada conversa em um atendimento memorável.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] font-bold text-[#29445f]">
            E-mail profissional
          </Label>
          <div className="group relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#8b9bae] transition-colors group-focus-within:text-[#185b9d]" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nome@suaempresa.com"
              className="h-13 rounded-xl border-[#d9e2eb] bg-[#fbfcfe] pl-11 pr-4 text-[15px] text-[#183653] shadow-[0_1px_2px_rgba(16,45,80,0.03)] placeholder:text-[#a1aebb] focus-visible:border-[#4f87bd] focus-visible:ring-[#d7e9f8]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-[13px] font-bold text-[#29445f]">
            Senha
          </Label>
          <div className="group relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#8b9bae] transition-colors group-focus-within:text-[#185b9d]" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Digite sua senha"
              className="h-13 rounded-xl border-[#d9e2eb] bg-[#fbfcfe] px-11 text-[15px] text-[#183653] shadow-[0_1px_2px_rgba(16,45,80,0.03)] placeholder:text-[#a1aebb] focus-visible:border-[#4f87bd] focus-visible:ring-[#d7e9f8]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-[#7e8fa3] transition-colors hover:bg-[#edf3f8] hover:text-[#244b72] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f87bd]"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(checked) => setRemember(Boolean(checked))}
              className="border-[#c7d3df] data-[state=checked]:border-[#1a5c9a] data-[state=checked]:bg-[#1a5c9a]"
            />
            <Label htmlFor="remember" className="cursor-pointer text-[13px] font-semibold text-[#53677d]">
              Manter conectado
            </Label>
          </div>
          <button
            type="button"
            onClick={() => toast.info("A recuperação de senha será habilitada junto com a autenticação.")}
            className="rounded-md text-[13px] font-bold text-[#185b9d] transition-colors hover:text-[#103f70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f87bd] focus-visible:ring-offset-2"
          >
            Esqueci minha senha
          </button>
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="group h-13 w-full rounded-xl bg-[#173f74] text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(23,63,116,0.2)] transition-all duration-200 hover:bg-[#12355f] hover:shadow-[0_12px_28px_rgba(23,63,116,0.28)] active:scale-[0.97]"
        >
          {isLoading ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              Validando acesso...
            </>
          ) : (
            <>
              Entrar no Atende
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-8 flex items-start gap-3 rounded-xl bg-[#f5f8fb] px-4 py-3.5 ring-1 ring-[#e5ecf2]">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white text-[#1d9f87] shadow-sm ring-1 ring-[#e2ebe9]">
          <ShieldCheck className="size-4" />
        </div>
        <p className="text-[12px] leading-[1.55] text-[#718196]">
          <strong className="font-bold text-[#40566e]">Seus dados estarão protegidos.</strong>{" "}
          Esta versão ainda não envia nem armazena informações.
        </p>
      </div>
    </div>
  );
}

function ProductPreview() {
  return (
    <section className="relative hidden min-h-screen overflow-hidden bg-[#071b3a] lg:block">
      <img
        src="/manus-storage/atende-crm-abstract-b_852c3ecc.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,21,49,0.25)_0%,rgba(5,21,49,0.08)_48%,rgba(5,21,49,0.72)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0%,rgba(4,17,42,0.05)_38%,rgba(4,17,42,0.25)_100%)]" />

      <div className="relative z-10 flex min-h-screen flex-col px-[clamp(2rem,4.2vw,4.5rem)] py-10">
        <div className="flex items-center justify-between animate-preview-in">
          <BrandMark inverted />
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[11px] font-bold text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-white/14 backdrop-blur-xl">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#47e2c5] opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-[#47e2c5]" />
            </span>
            Operação online
          </div>
        </div>

        <div className="my-auto py-12">
          <div className="mx-auto max-w-[560px] animate-card-in rounded-[26px] border border-white/15 bg-[#f9fbff]/96 p-5 shadow-[0_28px_90px_rgba(0,8,29,0.42)] backdrop-blur-2xl xl:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-[#8796a8]">Visão geral</p>
                <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.035em] text-[#173653]">Central de atendimento</h2>
              </div>
              <div className="flex -space-x-2">
                {[
                  ["AR", "bg-[#dbe9ff] text-[#365e9e]"],
                  ["JM", "bg-[#dff6ed] text-[#237d67]"],
                  ["+3", "bg-[#173f74] text-white"],
                ].map(([initials, styles]) => (
                  <div key={initials} className={`grid size-8 place-items-center rounded-full border-2 border-white text-[9px] font-extrabold ${styles}`}>
                    {initials}
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl bg-[#edf4ff] p-3.5 ring-1 ring-[#dce8f7]">
                <div className="mb-2 flex items-center justify-between text-[#386b9e]">
                  <MessageCircleMore className="size-4" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wider">Agora</span>
                </div>
                <p className="font-display text-2xl font-bold tracking-[-0.05em] text-[#153b63]">18</p>
                <p className="mt-0.5 text-[10px] font-semibold text-[#6c8197]">Conversas</p>
              </div>
              <div className="rounded-2xl bg-[#eaf8f5] p-3.5 ring-1 ring-[#d6eee8]">
                <div className="mb-2 flex items-center justify-between text-[#1b907c]">
                  <Clock3 className="size-4" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wider">Média</span>
                </div>
                <p className="font-display text-2xl font-bold tracking-[-0.05em] text-[#176f63]">1m 42s</p>
                <p className="mt-0.5 text-[10px] font-semibold text-[#67847f]">1ª resposta</p>
              </div>
              <div className="rounded-2xl bg-[#fff5e8] p-3.5 ring-1 ring-[#f3e5d0]">
                <div className="mb-2 flex items-center justify-between text-[#ad711e]">
                  <Users className="size-4" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wider">Equipe</span>
                </div>
                <p className="font-display text-2xl font-bold tracking-[-0.05em] text-[#825518]">8</p>
                <p className="mt-0.5 text-[10px] font-semibold text-[#8c7a63]">Disponíveis</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-2.5 shadow-[0_8px_30px_rgba(20,51,82,0.07)] ring-1 ring-[#e5ebf1]">
              <div className="mb-1 flex items-center justify-between px-2 py-1.5">
                <span className="text-[11px] font-extrabold text-[#3d536a]">Fila de atendimento</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-[#1b927d]">
                  <Check className="size-3" /> Tudo em dia
                </span>
              </div>
              <div className="space-y-1">
                {queueItems.map((item) => (
                  <div key={item.name} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[#f6f9fc]">
                    <div className={`grid size-9 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold ${item.color}`}>
                      {item.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[11px] font-extrabold text-[#2b435b]">{item.name}</p>
                        <span className="rounded bg-[#f0f4f8] px-1.5 py-0.5 text-[8px] font-bold text-[#74879a]">{item.channel}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-[#8291a1]">{item.subject}</p>
                    </div>
                    <span className="shrink-0 text-[9px] font-semibold text-[#9aa7b4]">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="animate-preview-in">
          <p className="max-w-[540px] font-display text-[clamp(1.55rem,2.5vw,2.3rem)] font-semibold leading-[1.18] tracking-[-0.04em] text-white">
            Atendimento organizado. Clientes mais próximos.
          </p>
          <p className="mt-3 max-w-[470px] text-[13px] leading-6 text-white/60">
            Centralize conversas, acompanhe sua equipe e não deixe nenhuma oportunidade sem resposta.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f9fc] text-[#183653]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(520px,0.9fr)_minmax(570px,1.1fr)]">
        <section className="flex min-h-screen flex-col bg-white px-5 py-6 sm:px-10 sm:py-8 lg:px-[clamp(3.5rem,7vw,7.5rem)] lg:py-10">
          <header className="flex items-center justify-between">
            <BrandMark />
            <button
              type="button"
              onClick={() => toast.info("O canal de suporte será conectado em uma próxima etapa.")}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#536b84] transition-colors hover:bg-[#f2f6fa] hover:text-[#244d76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f87bd]"
            >
              <Headphones className="size-4" />
              <span className="hidden sm:inline">Precisa de ajuda?</span>
            </button>
          </header>

          <div className="flex flex-1 items-center justify-center py-12 lg:py-8">
            <LoginForm />
          </div>

          <footer className="flex flex-col gap-2 text-[11px] font-semibold text-[#94a0ae] sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Atende CRM</span>
            <div className="flex gap-4">
              <button type="button" onClick={() => toast.info("Política de privacidade em preparação.")} className="transition-colors hover:text-[#496178]">
                Privacidade
              </button>
              <button type="button" onClick={() => toast.info("Termos de uso em preparação.")} className="transition-colors hover:text-[#496178]">
                Termos de uso
              </button>
            </div>
          </footer>
        </section>

        <ProductPreview />
      </div>
    </main>
  );
}
