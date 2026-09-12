import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  ChevronDown,
  Clock3,
  CreditCard,
  Filter,
  Inbox,
  LayoutGrid,
  LockKeyhole,
  MessageCircle,
  MoreVertical,
  Paperclip,
  PencilLine,
  Plus,
  Search,
  Send,
  Settings,
  TrendingUp,
  TriangleAlert,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

const colors = {
  ink: "#0B1F14",
  green: "#12B85C",
  greenDark: "#0A7A42",
  surface: "#EFF4F1",
  canvas: "#E9EEEB",
  muted: "#4C6355",
  line: "#E3EBE6",
  paleGreen: "#F1FBF6",
  softGreen: "#DFF6EA",
};

const conversations = [
  {
    initials: "CM",
    name: "Carla Menezes",
    company: "Bigteck LTDA",
    message: "Paguei duas vezes a mensalidade…",
    time: "09:52",
    channel: "whatsapp",
    tag: "BIGTECK LTDA",
    tagTone: "green",
    unread: 0,
  },
  {
    initials: "EL",
    name: "Eduardo Lins",
    company: "Lins Comércio",
    message: "Consigo o estorno neste mês?",
    time: "09:31",
    channel: "telegram",
    tag: "SEM RESPOSTA 42MIN",
    tagTone: "red",
    unread: 2,
  },
  {
    initials: "SA",
    name: "Studio Alfa ME",
    company: "Studio Alfa ME",
    message: "Marina: estorno enviado ✓",
    time: "ontem",
    channel: "whatsapp",
    tag: "MARINA A.",
    tagTone: "gray",
    unread: 0,
  },
  {
    initials: "CP",
    name: "Casa Pinheiro",
    company: "Casa Pinheiro",
    message: "Recebi o comprovante, obrigado!",
    time: "ontem",
    channel: "telegram",
    tag: "RESOLVIDA",
    tagTone: "gray",
    unread: 0,
  },
];

const teams = [
  { name: "Reembolso", count: 7, color: "#12B85C" },
  { name: "Cobrança", count: 4, color: "#1D6FA5" },
  { name: "Suporte técnico", count: 5, color: "#B3261E" },
  { name: "Onboarding", count: 2, color: "#4C6355" },
];

function LogoMark() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#12B85C]">
      <svg width="24" height="24" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="23" stroke="#FFFFFF" strokeWidth="10" opacity=".38" />
        <path d="M55 32a23 23 0 01-36 19" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function RailButton({
  label,
  active = false,
  badge,
  children,
}: {
  label: string;
  active?: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => !active && toast.info(`${label}: módulo disponível em uma próxima etapa.`)}
      className={`relative grid size-11 place-items-center rounded-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12B85C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F14] ${
        active ? "bg-[#12B85C] text-white" : "text-[#8FB39E] hover:bg-[#153021]"
      }`}
    >
      {children}
      {badge ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#0B1F14] bg-[#12B85C] px-1 text-[10px] font-bold leading-none text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ChannelPill({ channel, connected = true }: { channel: "WhatsApp" | "Telegram"; connected?: boolean }) {
  const telegram = channel === "Telegram";
  return (
    <button
      type="button"
      onClick={() => toast.success(`${channel} está conectado e operacional.`)}
      className="flex h-10 shrink-0 items-center gap-2 rounded-[11px] bg-white px-[13px] transition-colors hover:bg-[#F8FAF9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12B85C]"
    >
      <span className={`grid size-[22px] place-items-center rounded-[7px] ${telegram ? "bg-[#E3EEF6] text-[#1D6FA5]" : "bg-[#DFF6EA] text-[#0A7A42]"}`}>
        {telegram ? <Send className="size-[13px]" strokeWidth={2.2} /> : <MessageCircle className="size-[13px]" strokeWidth={2.2} />}
      </span>
      <span className="text-[12.5px] font-semibold text-[#0B1F14]">{channel}</span>
      {connected ? <span className="size-[7px] rounded-full bg-[#12B85C]" /> : null}
    </button>
  );
}

function LeftFilters() {
  const [activeTeam, setActiveTeam] = useState("Reembolso");
  const [activeBox, setActiveBox] = useState("Todas");

  const inboxes = [
    { name: "Todas", count: 18, icon: Inbox, tone: colors.muted },
    { name: "Minhas", count: 5, icon: UserRound, tone: colors.muted },
    { name: "Sem resposta", count: 3, icon: Clock3, tone: "#8E1F16" },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-3.5 rounded-[20px] bg-white px-3 py-4">
      <span className="px-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#4C6355]">Caixas de entrada</span>
      <div className="flex flex-col gap-0.5">
        {inboxes.map(({ name, count, icon: Icon, tone }) => (
          <button
            type="button"
            key={name}
            onClick={() => setActiveBox(name)}
            className={`flex items-center gap-2.5 rounded-[11px] px-[11px] py-2.5 text-[13px] text-[#0B1F14] transition-colors hover:bg-[rgba(18,184,92,.08)] ${activeBox === name ? "bg-[#F8FAF9]" : ""}`}
          >
            <Icon className="size-[15px]" stroke={tone} strokeWidth={2} />
            <span className="flex-1 text-left">{name}</span>
            <span className={`text-[11px] font-bold ${name === "Sem resposta" ? "text-[#8E1F16]" : "text-[#4C6355]"}`}>{count}</span>
          </button>
        ))}
      </div>

      <span className="mx-1 h-px bg-[#E3EBE6]" />
      <div className="flex items-center gap-2 px-1">
        <span className="flex-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#4C6355]">Equipes</span>
        <button
          type="button"
          aria-label="Nova equipe"
          onClick={() => toast.info("A criação de equipes será conectada ao banco de dados.")}
          className="grid size-[22px] place-items-center rounded-[7px] text-[#4C6355] transition-colors hover:bg-[rgba(18,184,92,.08)]"
        >
          <Plus className="size-[13px]" strokeWidth={2.4} />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {teams.map((team) => {
          const active = activeTeam === team.name;
          return (
            <button
              type="button"
              key={team.name}
              onClick={() => setActiveTeam(team.name)}
              className={`flex items-center gap-2.5 rounded-[11px] px-[11px] py-2.5 text-[13px] transition-colors ${
                active
                  ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6] font-bold text-[#0A7A42]"
                  : "border-[1.5px] border-transparent text-[#0B1F14] hover:bg-[rgba(18,184,92,.08)]"
              }`}
            >
              <span className="size-2 shrink-0 rounded-[3px]" style={{ backgroundColor: team.color }} />
              <span className="min-w-0 flex-1 truncate text-left">{team.name}</span>
              <span className={active ? "rounded-md bg-[#12B85C] px-[7px] py-0.5 text-[11px] font-bold text-white" : "text-[11px] font-bold text-[#4C6355]"}>
                {team.count}
              </span>
            </button>
          );
        })}
      </div>

      <span className="mx-1 h-px bg-[#E3EBE6]" />
      <span className="px-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#4C6355]">Equipe de reembolso</span>
      <div className="flex flex-col gap-1.5">
        <button type="button" className="flex items-center gap-2 rounded-[10px] px-2 py-[7px] text-left transition-colors hover:bg-[rgba(18,184,92,.08)]">
          <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[#DFF6EA] text-[10.5px] font-bold text-[#0A7A42]">MA</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-[#0B1F14]">Marina A.</span>
            <span className="block text-[11px] text-[#0A7A42]">online · 3 ativas</span>
          </span>
        </button>
        <button type="button" className="flex items-center gap-2 rounded-[10px] px-2 py-[7px] text-left transition-colors hover:bg-[rgba(18,184,92,.08)]">
          <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[#DFF6EA] text-[10.5px] font-bold text-[#0A7A42]">RC</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-[#0B1F14]">Rafael C.</span>
            <span className="block text-[11px] text-[#4C6355]">ausente · 2 ativas</span>
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => toast.info("Convide novos atendentes quando o cadastro de usuários estiver ativo.")}
        className="flex h-[38px] items-center justify-center gap-2 rounded-[11px] border border-dashed border-[#E3EBE6] text-[12.5px] font-semibold text-[#4C6355] transition-colors hover:bg-[rgba(18,184,92,.08)]"
      >
        <Plus className="size-3.5" strokeWidth={2.4} />
        Adicionar à equipe
      </button>
    </aside>
  );
}

function ConversationList({ selected, onSelect }: { selected: string; onSelect: (name: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => conversations.filter((item) => `${item.name} ${item.company} ${item.message}`.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  return (
    <section className="flex w-[330px] shrink-0 flex-col overflow-hidden rounded-[20px] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#E3EBE6] px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-[#0B1F14]">Reembolso</h2>
            <p className="text-xs text-[#4C6355]">7 conversas · 2 sem resposta</p>
          </div>
          <button
            type="button"
            aria-label="Filtros"
            onClick={() => toast.info("Filtros avançados serão habilitados com os dados reais.")}
            className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#F8FAF9] text-[#4C6355] transition-colors hover:bg-[rgba(18,184,92,.08)]"
          >
            <Filter className="size-[15px]" />
          </button>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-[11px] border border-[#E3EBE6] bg-white px-3 focus-within:border-[#12B85C]">
          <Search className="size-3.5 shrink-0 text-[#4C6355]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="text"
            placeholder="Buscar cliente, CNPJ ou protocolo"
            aria-label="Buscar conversa"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-[#0B1F14] outline-none placeholder:text-[#7E8D84]"
          />
        </label>
      </div>
      <div className="support-scroll flex flex-1 flex-col gap-1.5 overflow-auto p-2.5">
        {filtered.map((item) => {
          const active = selected === item.name;
          const greenAvatar = item.name === "Carla Menezes";
          return (
            <button
              type="button"
              key={item.name}
              onClick={() => onSelect(item.name)}
              className={`flex w-full gap-[11px] rounded-[14px] border-[1.5px] p-3 text-left transition-colors ${
                active ? "border-[#12B85C] bg-[#F1FBF6]" : "border-transparent hover:bg-[rgba(18,184,92,.08)]"
              }`}
            >
              <span className="relative shrink-0">
                <span
                  className={`grid size-[38px] place-items-center rounded-full text-[13px] font-bold ${
                    greenAvatar ? "bg-[#12B85C] text-white" : item.name === "Eduardo Lins" ? "bg-[#E3EEF6] text-[#1D6FA5]" : "bg-[#F1F4F2] text-[#4C6355]"
                  }`}
                >
                  {item.initials}
                </span>
                <span className="absolute -bottom-[3px] -right-[3px] grid size-[17px] place-items-center rounded-full bg-white">
                  {item.channel === "telegram" ? <Send className="size-2.5 text-[#4FA3DA]" /> : <MessageCircle className="size-2.5 text-[#12B85C]" />}
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="flex items-baseline gap-2">
                  <span className={`min-w-0 flex-1 truncate text-[13.5px] font-bold ${active ? "text-[#0A7A42]" : "text-[#0B1F14]"}`}>{item.name}</span>
                  <span className="shrink-0 text-[11px] text-[#4C6355]">{item.time}</span>
                </span>
                <span className="truncate text-xs text-[#4C6355]">{item.message}</span>
                <span
                  className={`self-start rounded-md px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[.04em] ${
                    item.tagTone === "red"
                      ? "bg-[#FDECEA] text-[#8E1F16]"
                      : item.tagTone === "green"
                        ? "bg-[#DFF6EA] text-[#0A7A42]"
                        : "bg-[#F1F4F2] text-[#4C6355]"
                  }`}
                >
                  {item.tag}
                </span>
              </span>
              {item.unread ? <span className="self-center grid size-5 shrink-0 place-items-center rounded-full bg-[#12B85C] text-[11px] font-bold text-white">{item.unread}</span> : null}
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <div className="grid flex-1 place-items-center px-5 text-center text-xs leading-5 text-[#4C6355]">Nenhuma conversa encontrada.</div>
        ) : null}
      </div>
    </section>
  );
}

function ConversationPanel({ selectedName }: { selectedName: string }) {
  const conversation = conversations.find((item) => item.name === selectedName) ?? conversations[0];
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [message, setMessage] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const sendMessage = () => {
    const value = message.trim();
    if (!value) {
      toast.error(mode === "reply" ? "Escreva uma mensagem antes de enviar." : "Escreva uma nota interna antes de salvar.");
      return;
    }
    setSentMessages((items) => [...items, value]);
    setMessage("");
    toast.success(mode === "reply" ? "Mensagem adicionada à conversa demonstrativa." : "Nota interna salva nesta demonstração.");
    window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 10);
  };

  return (
    <section className="flex min-w-[520px] flex-1 flex-col overflow-hidden rounded-[20px] bg-white">
      <header className="flex flex-col gap-[11px] border-b border-[#E3EBE6] bg-white px-[18px] py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#12B85C] text-sm font-bold text-white">{conversation.initials}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-[#0B1F14]">{conversation.name}</h2>
            <p className="truncate text-xs text-[#4C6355]">{conversation.company} · protocolo #4821 · aberto há 18min</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-[7px] bg-[#DFF6EA] px-[9px] py-1 text-[11px] font-bold text-[#0A7A42]">
            <MessageCircle className="size-[11px]" strokeWidth={2.6} />
            +55 31 9•••-4471
          </span>
          <button
            type="button"
            aria-label="Mais ações"
            onClick={() => toast.info("As ações da conversa serão conectadas ao CRM.")}
            className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-[#F8FAF9] text-[#4C6355] transition-colors hover:bg-[rgba(18,184,92,.08)]"
          >
            <MoreVertical className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="flex h-9 min-w-0 items-center gap-2 rounded-[10px] border border-[#C7E8D6] bg-[#F1FBF6] px-[11px] text-[12.5px] font-bold text-[#0A7A42]">
            <span className="size-2 shrink-0 rounded-[3px] bg-[#12B85C]" />
            <span className="truncate">Equipe Reembolso</span>
            <ChevronDown className="size-3.5" strokeWidth={2.2} />
          </button>
          <button type="button" className="flex h-9 min-w-0 items-center gap-2 rounded-[10px] border border-[#E3EBE6] bg-[#F8FAF9] px-[11px] text-[12.5px] font-semibold text-[#0B1F14]">
            <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[#DFF6EA] text-[9.5px] font-bold text-[#0A7A42]">MA</span>
            <span className="truncate">Marina A.</span>
            <ChevronDown className="size-3.5 text-[#4C6355]" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <div className="support-scroll flex flex-1 flex-col gap-3.5 overflow-auto bg-[#F8FAF9] p-5">
        <span className="self-center rounded-full bg-[#F1F4F2] px-3 py-[5px] text-[11px] font-bold text-[#4C6355]">Hoje · 12 de setembro</span>
        <div className="flex max-w-[78%] flex-col gap-[5px]">
          <div className="rounded-[16px_16px_16px_6px] border border-[#E3EBE6] bg-white px-3.5 py-3 text-[13.5px] leading-[1.55] text-[#0B1F14]">
            Bom dia! Paguei duas vezes a mensalidade de setembro, saiu R$ 89,90 no dia 10 e de novo hoje.
          </div>
          <span className="pl-1 text-[11px] text-[#4C6355]">09:34 · WhatsApp</span>
        </div>
        <div className="flex max-w-[78%] flex-col items-end gap-[5px] self-end">
          <div className="rounded-[16px_16px_6px_16px] bg-[#0B1F14] px-3.5 py-3 text-[13.5px] leading-[1.55] text-white">
            Bom dia, Carla! Para abrir os dados da conta, me confirma o PIN do seu painel em Configurações › Segurança?
          </div>
          <span className="pr-1 text-[11px] text-[#4C6355]">09:38 · Marina A. · entregue</span>
        </div>
        <div className="flex max-w-[78%] flex-col gap-[5px]">
          <div className="rounded-[16px_16px_16px_6px] border border-[#E3EBE6] bg-white px-3.5 py-3 text-[13.5px] leading-[1.55] text-[#0B1F14]">É 4 8 6 2 1 3</div>
          <span className="pl-1 text-[11px] text-[#4C6355]">09:41 · WhatsApp</span>
        </div>
        <div className="flex items-start gap-2.5 rounded-[14px] border border-dashed border-[#E0C878] bg-[#FFF8E7] px-3.5 py-3">
          <PencilLine className="mt-0.5 size-4 shrink-0 text-[#8A6A16]" strokeWidth={2.2} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-[1.5] text-[#5C4A10]"><strong>Nota interna</strong> — PIN validado. Duas capturas do mesmo valor no Stripe; estorno solicitado, prazo de 5 dias úteis.</p>
            <span className="mt-[3px] block text-[11px] text-[#8A6A16]">Marina A. · 09:44 · visível só para a equipe</span>
          </div>
        </div>
        <div className="flex max-w-[78%] flex-col items-end gap-[5px] self-end">
          <div className="rounded-[16px_16px_6px_16px] bg-[#0B1F14] px-3.5 py-3 text-[13.5px] leading-[1.55] text-white">
            Confirmado, Carla. O estorno já está solicitado — cai no cartão final 4218 em até 5 dias úteis.
          </div>
          <span className="pr-1 text-[11px] text-[#4C6355]">09:52 · Marina A. · lida</span>
        </div>
        {sentMessages.map((item, index) =>
          mode === "note" ? (
            <div key={`${item}-${index}`} className="flex items-start gap-2.5 rounded-[14px] border border-dashed border-[#E0C878] bg-[#FFF8E7] px-3.5 py-3">
              <PencilLine className="mt-0.5 size-4 shrink-0 text-[#8A6A16]" />
              <p className="text-[12.5px] leading-[1.5] text-[#5C4A10]"><strong>Nota interna</strong> — {item}</p>
            </div>
          ) : (
            <div key={`${item}-${index}`} className="flex max-w-[78%] flex-col items-end gap-[5px] self-end">
              <div className="rounded-[16px_16px_6px_16px] bg-[#0B1F14] px-3.5 py-3 text-[13.5px] leading-[1.55] text-white">{item}</div>
              <span className="pr-1 text-[11px] text-[#4C6355]">agora · Marina A. · enviado</span>
            </div>
          ),
        )}
        <div ref={messageEndRef} />
      </div>

      <footer className="flex flex-col gap-2.5 border-t border-[#E3EBE6] bg-white px-4 pb-3.5 pt-3">
        <div className="flex self-start rounded-[10px] bg-[#F1F4F2] p-[3px]">
          <button
            type="button"
            onClick={() => setMode("reply")}
            className={`rounded-lg px-[13px] py-1.5 text-xs font-bold ${mode === "reply" ? "bg-white text-[#0A7A42] shadow-sm" : "text-[#4C6355]"}`}
          >
            Responder
          </button>
          <button
            type="button"
            onClick={() => setMode("note")}
            className={`rounded-lg px-[13px] py-1.5 text-xs font-semibold ${mode === "note" ? "bg-white text-[#8A6A16] shadow-sm" : "text-[#4C6355]"}`}
          >
            Nota interna
          </button>
        </div>
        <div className={`flex flex-col gap-2.5 rounded-[14px] border bg-white px-3.5 py-3 ${mode === "note" ? "border-[#E0C878]" : "border-[#E3EBE6]"}`}>
          <textarea
            rows={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage();
            }}
            placeholder={mode === "reply" ? `Escreva para ${conversation.name.split(" ")[0]} pelo WhatsApp…` : "Escreva uma nota visível apenas para a equipe…"}
            aria-label="Mensagem"
            className="resize-none border-0 bg-transparent text-[13.5px] leading-5 text-[#0B1F14] outline-none placeholder:text-[#849087]"
          />
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Anexo" onClick={() => toast.info("O envio de anexos será habilitado posteriormente.")} className="grid size-[34px] place-items-center rounded-[10px] text-[#4C6355] transition-colors hover:bg-[rgba(18,184,92,.08)]">
              <Paperclip className="size-4" />
            </button>
            <button type="button" onClick={() => setMessage("O estorno foi solicitado e será processado em até 5 dias úteis.")} className="flex h-[34px] items-center gap-[7px] rounded-[10px] border border-[#E3EBE6] bg-[#F8FAF9] px-3 text-[12.5px] font-semibold text-[#0B1F14] transition-colors hover:bg-[rgba(18,184,92,.08)]">
              <Zap className="size-3.5 text-[#4C6355]" />
              Respostas rápidas
            </button>
            <button type="button" className="flex h-[34px] items-center gap-[7px] rounded-[10px] border border-[#E3EBE6] bg-[#F8FAF9] px-3 text-[12.5px] font-semibold text-[#0B1F14]">
              <MessageCircle className="size-3.5 text-[#12B85C]" />
              WhatsApp
              <ChevronDown className="size-[13px] text-[#4C6355]" />
            </button>
            <button
              type="button"
              onClick={sendMessage}
              className={`ml-auto flex h-10 items-center gap-2 rounded-[11px] px-[18px] text-[13.5px] font-bold text-white transition-colors ${mode === "note" ? "bg-[#8A6A16] hover:bg-[#6f5511]" : "bg-[#12B85C] hover:bg-[#0F9E4E]"}`}
            >
              {mode === "note" ? "Salvar" : "Enviar"}
              {mode === "reply" ? <Send className="size-[15px]" strokeWidth={2.4} /> : null}
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}

function CustomerPanel() {
  const [note, setNote] = useState("");

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-[20px] bg-white">
      <header className="flex items-center gap-[11px] border-b border-[#E3EBE6] px-[18px] pb-3.5 pt-4">
        <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-[#12B85C] text-[13px] font-bold text-white">BT</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-[#0B1F14]">Bigteck LTDA</h2>
          <p className="text-xs text-[#4C6355]">12.884.301/0001-45</p>
        </div>
        <button type="button" onClick={() => toast.info("A conta completa do cliente será aberta neste painel.")} className="shrink-0 text-xs font-bold text-[#0A7A42] hover:underline">Abrir conta</button>
      </header>
      <div className="support-scroll flex flex-1 flex-col gap-4 overflow-auto px-[18px] pb-[18px] pt-4">
        <div className="flex flex-col gap-[11px] rounded-2xl border-[1.5px] border-[#12B85C] bg-[#F1FBF6] p-3.5">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-[15px] text-[#0A7A42]" strokeWidth={2.2} />
            <span className="flex-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#0A7A42]">PIN do cliente</span>
            <span className="rounded-md bg-[#12B85C] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[.05em] text-white">Validado</span>
          </div>
          <div className="flex gap-1.5">
            {[4, 8, 6, 2, 1, 3].map((number) => (
              <span key={number} className="grid h-11 flex-1 place-items-center rounded-[10px] border border-[#C7E8D6] bg-white font-mono text-[19px] font-bold text-[#0A7A42]">{number}</span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11.5px] text-[#0B1F14]">Conferido às 09:41 por Marina A.</span>
            <button type="button" onClick={() => toast.success("Solicitação de novo PIN registrada nesta demonstração.")} className="h-[30px] rounded-[9px] border border-[#C7E8D6] bg-white px-[11px] text-[11.5px] font-bold text-[#0A7A42] transition-colors hover:bg-[#F8FAF9]">Pedir novo PIN</button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#4C6355]">Conta do cliente</span>
          <div className="flex flex-col">
            {[
              ["Saldo em caixa", "R$ 184.320,55", "green"],
              ["Plano", "Essencial mensal", "ink"],
              ["Último pagamento", "12/09 · R$ 89,90", "ink"],
              ["Cobrança anterior", "10/09 · R$ 89,90", "ink"],
              ["Papel de Carla", "Administradora", "ink"],
            ].map(([label, value, tone], index, array) => (
              <div key={label} className={`flex items-center gap-2.5 py-2.5 ${index < array.length - 1 ? "border-b border-[#E3EBE6]" : ""}`}>
                <span className="flex-1 text-[12.5px] text-[#4C6355]">{label}</span>
                <span className={`text-[13px] font-bold ${tone === "green" ? "text-[#0A7A42]" : "text-[#0B1F14]"}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-[13px] bg-[#FDECEA] px-[13px] py-3">
          <TriangleAlert className="mt-px size-4 shrink-0 text-[#8E1F16]" strokeWidth={2.2} />
          <p className="text-[12.5px] leading-[1.5] text-[#8E1F16]"><strong>Duas capturas do mesmo valor</strong> em 48h no cartão final 4218. Elegível a estorno automático.</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#4C6355]">Notas internas</span>
          <div className="flex flex-col gap-2 rounded-[13px] border border-[#E3EBE6] bg-white px-3 py-[11px]">
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Escreva uma nota para a equipe…"
              aria-label="Nova nota interna"
              className="resize-none border-0 bg-transparent text-[12.5px] leading-[1.5] text-[#0B1F14] outline-none placeholder:text-[#849087]"
            />
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[11px] text-[#4C6355]">Só a equipe vê.</span>
              <button
                type="button"
                onClick={() => {
                  if (!note.trim()) return toast.error("Escreva uma nota antes de salvar.");
                  toast.success("Nota salva nesta demonstração.");
                  setNote("");
                }}
                className="h-8 rounded-[9px] bg-[#0B1F14] px-[13px] text-xs font-bold text-white transition-colors hover:bg-[#153021]"
              >
                Salvar nota
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-[5px] rounded-[13px] bg-[#F8FAF9] px-3 py-[11px]">
            <p className="text-[12.5px] leading-[1.5] text-[#0B1F14]">Já teve estorno em julho pelo mesmo motivo — vale checar a régua de cobrança.</p>
            <span className="text-[11px] text-[#4C6355]">Marina A. · 09:44</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => toast.success("Estorno preparado em modo demonstrativo.")} className="h-10 rounded-[11px] bg-[#12B85C] text-[12.5px] font-bold text-white transition-colors hover:bg-[#0F9E4E]">Estornar R$ 89,90</button>
          <button type="button" onClick={() => toast.info("O histórico de faturas será exibido quando os dados estiverem conectados.")} className="h-10 rounded-[11px] border border-[#E3EBE6] bg-white text-[12.5px] font-semibold text-[#0B1F14] transition-colors hover:bg-[rgba(18,184,92,.08)]">Ver faturas</button>
        </div>
      </div>
    </aside>
  );
}

export default function Atendimento() {
  const [selectedConversation, setSelectedConversation] = useState("Carla Menezes");

  useEffect(() => {
    const previousTitle = document.title;
    const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const robots = existingRobots ?? document.createElement("meta");

    document.title = "Atendimento | Atende CRM";
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    if (!existingRobots) document.head.appendChild(robots);

    return () => {
      document.title = previousTitle;
      if (!existingRobots) robots.remove();
    };
  }, []);

  return (
    <main className="min-h-screen overflow-auto bg-[#E9EEEB] p-6 pb-16 pt-10 font-[Roboto,'Helvetica_Neue',Arial,sans-serif] text-[#0B1F14]">
      <div className="mx-auto flex h-[860px] w-[1720px] gap-5 rounded-3xl bg-[#EFF4F1] p-5 shadow-[0_18px_44px_rgba(11,31,20,.10)]">
        <nav className="flex w-[76px] shrink-0 flex-col items-center gap-[22px] rounded-[20px] bg-[#0B1F14] py-4">
          <LogoMark />
          <div className="flex flex-col items-center gap-1.5">
            <RailButton label="Visão geral"><LayoutGrid className="size-[18px]" /></RailButton>
            <RailButton label="Empresas"><Building2 className="size-[18px]" /></RailButton>
            <RailButton label="Clientes"><Users className="size-[18px]" /></RailButton>
            <RailButton label="Atendimento" active badge={18}><MessageCircle className="size-[18px]" /></RailButton>
            <RailButton label="Financeiro"><CreditCard className="size-[18px]" /></RailButton>
            <span className="my-2 h-px w-7 bg-[#1F3D2B]" />
            <RailButton label="Crescimento"><TrendingUp className="size-[18px]" /></RailButton>
            <RailButton label="Relatórios"><BarChart3 className="size-[18px]" /></RailButton>
            <RailButton label="Configurações"><Settings className="size-[18px]" /></RailButton>
          </div>
          <button
            type="button"
            onClick={() => toast.info("Perfil de Gustavo Vieira.")}
            className="mt-auto grid size-[34px] place-items-center rounded-full bg-[#12B85C] text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            GV
          </button>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex min-h-11 items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-[-.02em] text-[#0B1F14]">Atendimento</h1>
              <p className="text-[13px] text-[#4C6355]">18 conversas abertas · 1ª resposta em 4min12s</p>
            </div>
            <span className="ml-auto" />
            <ChannelPill channel="WhatsApp" />
            <ChannelPill channel="Telegram" />
            <button
              type="button"
              onClick={() => toast.info("A conexão de novos canais será adicionada na etapa de integrações.")}
              className="flex h-10 shrink-0 items-center gap-2 rounded-[11px] border border-[#E3EBE6] bg-white px-[15px] text-[13px] font-semibold text-[#0B1F14] transition-colors hover:bg-[rgba(18,184,92,.08)]"
            >
              <Plus className="size-[15px]" strokeWidth={2.2} />
              Conectar canal
            </button>
          </header>

          <div className="flex h-[760px] items-stretch gap-3.5">
            <LeftFilters />
            <ConversationList selected={selectedConversation} onSelect={setSelectedConversation} />
            <ConversationPanel selectedName={selectedConversation} />
            <CustomerPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
