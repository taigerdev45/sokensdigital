"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Building2,
  FileText,
  FolderKanban,
  Globe,
  Loader2,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Search,
  Send,
  Smile,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getOrCreateDirectRoom,
  sendMessage,
  subscribeToMessages,
  subscribeToRooms,
  toggleReaction,
  togglePinned,
  uploadChatAttachment,
} from "@/lib/firebase/chat";
import { listProfiles } from "@/lib/firebase/profile";
import type { ChatMessage, ChatRoom, LinkedEntityType, Profile } from "@/lib/firebase/types";
import { inputClass } from "@/components/admin/form-styles";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { listProjects } from "@/lib/api/projects";
import { listLeads, listQuotes } from "@/lib/api/marketing";

const ROOM_TYPE_ICON: Record<ChatRoom["roomType"], React.ComponentType<{ className?: string }>> = {
  COMPANY: Globe,
  DEPARTMENT: Building2,
  PROJECT: FolderKanban,
  DIRECT: MessageSquare,
};

const ROOM_TYPE_LABEL: Record<ChatRoom["roomType"], string> = {
  COMPANY: "Entreprise",
  DEPARTMENT: "Département",
  PROJECT: "Projets",
  DIRECT: "Direct",
};

const ROOM_TYPE_ORDER: ChatRoom["roomType"][] = ["COMPANY", "DEPARTMENT", "PROJECT"];

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];

const LINKED_ENTITY_META: Record<LinkedEntityType, { label: string; icon: React.ComponentType<{ className?: string }>; href: (id: string) => string }> = {
  project: { label: "Projet", icon: FolderKanban, href: (id) => `/admin/technique/projets/${id}` },
  lead: { label: "Lead", icon: Target, href: () => `/admin/marketing/leads` },
  quote: { label: "Devis", icon: FileText, href: () => `/admin/marketing/devis` },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

function formatTime(value: unknown) {
  const d = toDate(value);
  return d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
}

function formatDay(value: unknown) {
  const d = toDate(value);
  if (!d) return "";
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "Aujourd'hui";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function toDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export function Chat() {
  const { user, profile } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"rooms" | "direct">("rooms");
  const [search, setSearch] = useState("");
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<ChatMessage["attachment"]>(null);
  const [pendingLink, setPendingLink] = useState<ChatMessage["linkedEntity"]>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToRooms(
      { departmentId: profile?.departmentId ?? null, uid: user.uid },
      (nextRooms) => {
        setRooms(nextRooms);
        setActiveRoomId((current) => current ?? nextRooms.find((r) => r.roomType !== "DIRECT")?.id ?? nextRooms[0]?.id ?? null);
      }
    );
  }, [user, profile?.departmentId]);

  useEffect(() => {
    setThreadRootId(null);
    if (!activeRoomId) {
      setMessages([]);
      return;
    }
    return subscribeToMessages(activeRoomId, setMessages);
  }, [activeRoomId]);

  useEffect(() => {
    if (!threadRootId) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, threadRootId]);

  const groupedRooms = useMemo(() => {
    return ROOM_TYPE_ORDER.map((roomType) => ({
      roomType,
      rooms: rooms.filter((room) => room.roomType === roomType && matchesSearch(room, search, user?.uid)),
    })).filter((group) => group.rooms.length > 0);
  }, [rooms, search, user?.uid]);

  const directRooms = useMemo(
    () => rooms.filter((room) => room.roomType === "DIRECT" && matchesSearch(room, search, user?.uid)),
    [rooms, search, user?.uid]
  );

  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const rootMessages = messages.filter((m) => !m.parentMessageId);
  const repliesOf = (id: string) => messages.filter((m) => m.parentMessageId === id);
  const threadRoot = threadRootId ? messages.find((m) => m.id === threadRootId) ?? null : null;
  const pinnedMessages = messages.filter((m) => m.pinned);
  const filesMessages = messages.filter((m) => m.attachment);

  const canPostInActiveRoom =
    !activeRoom ||
    activeRoom.roomType !== "COMPANY" ||
    profile?.role === "SUPER_ADMIN" ||
    profile?.role === "RESPONSABLE_MARKETING";

  function roomDisplayName(room: ChatRoom) {
    if (room.roomType === "DIRECT" && user) {
      const otherUid = room.memberUids?.find((uid) => uid !== user.uid);
      return (otherUid && room.participantNames?.[otherUid]) || "Conversation";
    }
    return room.name;
  }

  async function handleStartDm(other: Profile & { uid: string }) {
    if (!user || !profile) return;
    const roomId = await getOrCreateDirectRoom(
      { uid: user.uid, name: `${profile.firstName} ${profile.lastName}` },
      { uid: other.uid, name: `${other.firstName} ${other.lastName}` }
    );
    setSidebarTab("direct");
    setActiveRoomId(roomId);
  }

  async function handleSend(text: string, parentMessageId?: string) {
    if (!text.trim() || !activeRoomId || !user || !profile) return;
    await sendMessage(activeRoomId, {
      text: text.trim(),
      authorUid: user.uid,
      authorName: `${profile.firstName} ${profile.lastName}`,
      parentMessageId,
      attachment: parentMessageId ? undefined : pendingAttachment,
      linkedEntity: parentMessageId ? undefined : pendingLink,
    });
    if (!parentMessageId) {
      setPendingAttachment(null);
      setPendingLink(null);
    }
  }

  async function handleReact(message: ChatMessage, emoji: string) {
    if (!activeRoomId || !user) return;
    const already = (message.reactions?.[emoji] ?? []).includes(user.uid);
    await toggleReaction(activeRoomId, message.id, emoji, user.uid, already);
  }

  async function handlePin(message: ChatMessage) {
    if (!activeRoomId || !user) return;
    await togglePinned(activeRoomId, message.id, !message.pinned, user.uid);
  }

  // `dvh` et non `vh` : la barre d'URL mobile fausse `100vh`, ce qui faisait
  // dépasser la messagerie sous la barre de navigation. La marge basse plus
  // généreuse sous `lg` laisse la place à celle-ci.
  return (
    <div className="flex h-[calc(100dvh-12rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm lg:h-[calc(100dvh-8rem)]">
      {/* Sous `lg`, liste et conversation ne tiennent pas côte à côte :
          312px + 340px + les messages débordaient largement d'un écran de
          téléphone, et la page ne s'affichait qu'au prix d'un dézoom. On
          n'en montre donc qu'une à la fois, la liste cédant la place dès
          qu'une conversation est ouverte. */}
      <aside
        data-tour="module-messagerie"
        className={cn(
          "flex-col border-r border-neutral-200 lg:flex lg:w-[312px] lg:shrink-0",
          activeRoom ? "hidden" : "flex w-full"
        )}
      >
        <div className="shrink-0 p-4 pb-3">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-neutral-900">Messagerie</h1>
            <NewDmButton onPick={handleStartDm} currentUid={user?.uid} />
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            <Search className="size-3.5 shrink-0 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans les messages"
              className="w-full min-w-0 bg-transparent text-xs text-neutral-700 outline-none placeholder:text-neutral-400"
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
            <button
              type="button"
              onClick={() => setSidebarTab("rooms")}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                sidebarTab === "rooms" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              )}
            >
              Salons
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab("direct")}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                sidebarTab === "direct" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              )}
            >
              Direct
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {sidebarTab === "rooms" ? (
            <>
              {groupedRooms.length === 0 && <p className="p-4 text-xs text-neutral-400">Aucun salon.</p>}
              {groupedRooms.map((group) => {
                const Icon = ROOM_TYPE_ICON[group.roomType];
                return (
                  <div key={group.roomType} className="py-2">
                    <p className="px-2.5 py-1 text-[0.65rem] font-semibold tracking-wider text-neutral-400 uppercase">
                      {ROOM_TYPE_LABEL[group.roomType]}
                    </p>
                    {group.rooms.map((room) => (
                      <RoomButton
                        key={room.id}
                        icon={Icon}
                        name={roomDisplayName(room)}
                        active={room.id === activeRoomId}
                        onClick={() => setActiveRoomId(room.id)}
                      />
                    ))}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="py-2">
              {directRooms.length === 0 && (
                <p className="p-4 text-xs text-neutral-400">Aucune conversation directe pour l&apos;instant.</p>
              )}
              {directRooms.map((room) => (
                <RoomButton
                  key={room.id}
                  icon={MessageSquare}
                  name={roomDisplayName(room)}
                  active={room.id === activeRoomId}
                  onClick={() => setActiveRoomId(room.id)}
                  isDirect
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className={cn("flex-1 flex-col bg-white lg:flex", activeRoom ? "flex" : "hidden lg:flex")}>
        {activeRoom ? (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3 lg:px-5">
              {/* Retour à la liste — le seul chemin de sortie sur mobile,
                  où la liste n'est plus affichée à côté. */}
              <button
                type="button"
                onClick={() => setActiveRoomId(null)}
                aria-label="Retour aux conversations"
                className="-ml-1 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 lg:hidden"
              >
                <ChevronLeft className="size-5" />
              </button>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {(() => {
                  const Icon = ROOM_TYPE_ICON[activeRoom.roomType];
                  return <Icon className="size-4" />;
                })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">{roomDisplayName(activeRoom)}</p>
                <p className="text-xs text-neutral-400">{ROOM_TYPE_LABEL[activeRoom.roomType]}</p>
              </div>
              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <Pin className="size-3.5" /> {pinnedMessages.length} épinglé{pinnedMessages.length !== 1 ? "s" : ""}
                    </button>
                  }
                />
                <PopoverContent className="w-72 max-h-80 overflow-y-auto p-2" align="end">
                  {pinnedMessages.length === 0 && <p className="p-3 text-xs text-neutral-400">Aucun message épinglé.</p>}
                  {pinnedMessages.map((m) => (
                    <div key={m.id} className="rounded-lg px-2.5 py-2 hover:bg-neutral-50">
                      <p className="text-xs font-medium text-neutral-900">{m.authorName}</p>
                      <p className="truncate text-xs text-neutral-500">{m.text}</p>
                    </div>
                  ))}
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <Paperclip className="size-3.5" /> Fichiers
                    </button>
                  }
                />
                <PopoverContent className="w-72 max-h-80 overflow-y-auto p-2" align="end">
                  {filesMessages.length === 0 && <p className="p-3 text-xs text-neutral-400">Aucun fichier partagé.</p>}
                  {filesMessages.map((m) => (
                    <a
                      key={m.id}
                      href={m.attachment?.url}
                      target="_blank"
                      rel="noreferrer"
                      download={m.attachment?.name}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-neutral-700 hover:bg-neutral-50"
                    >
                      <Paperclip className="size-3.5 shrink-0 text-neutral-400" />
                      <span className="truncate">{m.attachment?.name}</span>
                    </a>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className="relative flex flex-1 overflow-hidden">
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-1 overflow-y-auto px-5 py-4">
                  {rootMessages.map((message, index) => {
                    const prevDay = index > 0 ? formatDay(rootMessages[index - 1].createdAt) : null;
                    const day = formatDay(message.createdAt);
                    return (
                      <div key={message.id}>
                        {day !== prevDay && (
                          <div className="my-4 flex items-center gap-3">
                            <span className="h-px flex-1 bg-neutral-100" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{day}</span>
                            <span className="h-px flex-1 bg-neutral-100" />
                          </div>
                        )}
                        <MessageBubble
                          message={message}
                          isSelf={message.authorUid === user?.uid}
                          replyCount={repliesOf(message.id).length}
                          onReact={(emoji) => handleReact(message, emoji)}
                          onPin={() => handlePin(message)}
                          onOpenThread={() => setThreadRootId(message.id)}
                          currentUid={user?.uid}
                        />
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="shrink-0 border-t border-neutral-200 p-3">
                  {canPostInActiveRoom ? (
                    <Composer
                      onSend={(text) => handleSend(text)}
                      pendingAttachment={pendingAttachment}
                      onAttach={setPendingAttachment}
                      pendingLink={pendingLink}
                      onLink={setPendingLink}
                    />
                  ) : (
                    <p className="text-center text-xs text-neutral-400">
                      Seuls les annonces de la direction/marketing peuvent être publiées ici.
                    </p>
                  )}
                </div>
              </div>

              {/* En dessous de `lg`, le fil se superpose au lieu de prendre
                  une troisième colonne : il n'y a pas la largeur pour trois. */}
              {threadRoot && (
                <aside className="absolute inset-0 z-20 flex flex-col border-l border-neutral-200 bg-neutral-50/50 lg:static lg:z-auto lg:w-[340px] lg:shrink-0">
                  <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Fil de discussion</p>
                      <p className="text-xs text-neutral-400">{repliesOf(threadRoot.id).length} réponse(s)</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setThreadRootId(null)}
                      className="flex size-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <div className="rounded-xl border border-neutral-200 bg-white p-3">
                      <MessageBubble
                        message={threadRoot}
                        isSelf={threadRoot.authorUid === user?.uid}
                        replyCount={0}
                        compact
                        onReact={(emoji) => handleReact(threadRoot, emoji)}
                        onPin={() => handlePin(threadRoot)}
                        currentUid={user?.uid}
                      />
                    </div>
                    <div className="mt-4 space-y-3">
                      {repliesOf(threadRoot.id).map((reply) => (
                        <MessageBubble
                          key={reply.id}
                          message={reply}
                          isSelf={reply.authorUid === user?.uid}
                          replyCount={0}
                          compact
                          onReact={(emoji) => handleReact(reply, emoji)}
                          onPin={() => handlePin(reply)}
                          currentUid={user?.uid}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 border-t border-neutral-200 p-3">
                    <Composer onSend={(text) => handleSend(text, threadRoot.id)} compact />
                  </div>
                </aside>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
            Sélectionnez un salon.
          </div>
        )}
      </div>
    </div>
  );
}

function matchesSearch(room: ChatRoom, search: string, uid?: string) {
  if (!search.trim()) return true;
  const q = search.trim().toLowerCase();
  const name = room.roomType === "DIRECT" && uid
    ? Object.entries(room.participantNames ?? {}).find(([id]) => id !== uid)?.[1] ?? ""
    : room.name;
  return name.toLowerCase().includes(q);
}

function RoomButton({
  icon: Icon,
  name,
  active,
  onClick,
  isDirect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  active: boolean;
  onClick: () => void;
  isDirect?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        active ? "bg-primary/10 text-primary" : "text-neutral-700 hover:bg-neutral-50"
      )}
    >
      {isDirect ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-600">
          {initials(name)}
        </span>
      ) : (
        <Icon className="size-4 shrink-0" />
      )}
      <span className="truncate">{name}</span>
    </button>
  );
}

function MessageBubble({
  message,
  isSelf,
  replyCount,
  onReact,
  onPin,
  onOpenThread,
  currentUid,
  compact,
}: {
  message: ChatMessage;
  isSelf: boolean;
  replyCount: number;
  onReact: (emoji: string) => void;
  onPin: () => void;
  onOpenThread?: () => void;
  currentUid?: string;
  compact?: boolean;
}) {
  const linkMeta = message.linkedEntity ? LINKED_ENTITY_META[message.linkedEntity.type] : null;
  const LinkIcon = linkMeta?.icon;

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50",
        compact && "px-0 hover:bg-transparent",
        isSelf && !compact && "bg-primary/[0.03]"
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
          isSelf ? "bg-primary/15 text-primary" : "bg-neutral-200 text-neutral-600"
        )}
      >
        {initials(message.authorName)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-neutral-900">
            {message.authorName}
            {isSelf && <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">Vous</span>}
          </span>
          <span className="text-[11px] text-neutral-400">{formatTime(message.createdAt)}</span>
          {message.pinned && <Pin className="size-3 fill-primary text-primary" />}
        </div>
        {message.text && <p className="whitespace-pre-wrap text-sm text-neutral-800">{message.text}</p>}

        {message.attachment && (
          <a
            href={message.attachment.url}
            target="_blank"
            rel="noreferrer"
            download={message.attachment.name}
            className="mt-2 flex max-w-[320px] items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-500">
              <Paperclip className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-neutral-900">{message.attachment.name}</span>
              <span className="block text-[11px] text-neutral-400">{Math.round(message.attachment.size / 1024)} Ko</span>
            </span>
          </a>
        )}

        {message.linkedEntity && linkMeta && LinkIcon && (
          <Link
            href={linkMeta.href(message.linkedEntity.id)}
            className="mt-2 flex max-w-[320px] items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 hover:border-primary/40"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LinkIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{linkMeta.label} lié</span>
              <span className="block truncate text-xs font-semibold text-neutral-900">{message.linkedEntity.label}</span>
            </span>
          </Link>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {Object.entries(message.reactions ?? {})
            .filter(([, uids]) => uids.length > 0)
            .map(([emoji, uids]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  currentUid && uids.includes(currentUid)
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-neutral-200 bg-white text-neutral-600"
                )}
              >
                {emoji} <span>{uids.length}</span>
              </button>
            ))}
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-full border border-dashed border-neutral-200 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
                >
                  <Smile className="size-3.5" />
                </button>
              }
            />
            <PopoverContent className="flex w-auto gap-1 p-1.5" align="start">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  className="flex size-8 items-center justify-center rounded-lg text-lg hover:bg-neutral-100"
                >
                  {emoji}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={onPin}
            className="flex size-6 items-center justify-center rounded-full text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
            title={message.pinned ? "Désépingler" : "Épingler"}
          >
            <Pin className={cn("size-3.5", message.pinned && "fill-primary text-primary")} />
          </button>
        </div>

        {onOpenThread && (
          <button
            type="button"
            onClick={onOpenThread}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <MessageSquare className="size-3.5" />
            {replyCount > 0 ? `${replyCount} réponse${replyCount > 1 ? "s" : ""}` : "Répondre"}
          </button>
        )}
      </div>
    </div>
  );
}

function Composer({
  onSend,
  pendingAttachment,
  onAttach,
  pendingLink,
  onLink,
  compact,
}: {
  onSend: (text: string) => void;
  pendingAttachment?: ChatMessage["attachment"];
  onAttach?: (attachment: ChatMessage["attachment"]) => void;
  pendingLink?: ChatMessage["linkedEntity"];
  onLink?: (link: ChatMessage["linkedEntity"]) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onAttach) return;
    setUploading(true);
    try {
      onAttach(await uploadChatAttachment(file));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      onSend(draft);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {pendingAttachment && (
        <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 text-xs text-neutral-600">
          <Paperclip className="size-3.5" /> {pendingAttachment.name}
          <button type="button" onClick={() => onAttach?.(null)} className="ml-auto text-neutral-400 hover:text-destructive">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {pendingLink && (
        <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 text-xs text-neutral-600">
          {LINKED_ENTITY_META[pendingLink.type].label} : {pendingLink.label}
          <button type="button" onClick={() => onLink?.(null)} className="ml-auto text-neutral-400 hover:text-destructive">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <textarea
          rows={compact ? 1 : 2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Écrire un message…"
          className="w-full resize-none rounded-t-2xl border-0 bg-transparent px-4 py-3 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
        />
        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          {onAttach && (
            <>
              <input ref={fileInputRef} type="file" onChange={handleFile} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
                title="Joindre un fichier"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              </button>
            </>
          )}
          {onLink && <LinkEntityButton onPick={(link) => onLink(link)} />}
          <span className="flex-1" />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Envoyer <Send className="size-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}

function LinkEntityButton({ onPick }: { onPick: (link: ChatMessage["linkedEntity"]) => void }) {
  const [type, setType] = useState<LinkedEntityType>("project");
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadOptions(t: LinkedEntityType) {
    setLoading(true);
    try {
      if (t === "project") {
        const data = await listProjects();
        setOptions(data.results.map((p) => ({ id: p.id, label: p.name })));
      } else if (t === "lead") {
        const data = await listLeads();
        setOptions(data.results.map((l) => ({ id: l.id, label: `${l.first_name} ${l.last_name} — ${l.company_name}` })));
      } else {
        const data = await listQuotes();
        setOptions(data.results.map((q) => ({ id: q.id, label: `${q.quote_number} — ${q.client_name}` })));
      }
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            onClick={() => loadOptions(type)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
          >
            <Target className="size-3.5" /> Lier
          </button>
        }
      />
      <PopoverContent className="w-72 p-2">
        <div className="mb-2 flex gap-1 rounded-lg bg-neutral-100 p-0.5">
          {(Object.keys(LINKED_ENTITY_META) as LinkedEntityType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setType(t); loadOptions(t); }}
              className={cn(
                "flex-1 rounded-md py-1 text-xs font-medium",
                type === t ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              )}
            >
              {LINKED_ENTITY_META[t].label}
            </button>
          ))}
        </div>
        <div className="max-h-56 overflow-y-auto">
          {loading && <Loader2 className="mx-auto my-3 size-4 animate-spin text-neutral-400" />}
          {!loading && options.length === 0 && <p className="p-2 text-xs text-neutral-400">Rien à afficher.</p>}
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onPick({ type, id: opt.id, label: opt.label })}
              className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NewDmButton({ onPick, currentUid }: { onPick: (profile: Profile & { uid: string }) => void; currentUid?: string }) {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<(Profile & { uid: string })[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open && profiles === null) {
      listProfiles().then(setProfiles).catch(() => setProfiles([]));
    }
  }, [open, profiles]);

  const filtered = (profiles ?? []).filter(
    (p) => p.uid !== currentUid && `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            title="Nouvelle conversation"
            className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:border-primary/40 hover:text-primary"
          >
            <Plus className="size-4" />
          </button>
        }
      />
      <SheetContent title="Nouvelle conversation">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un collègue…"
          className={inputClass}
        />
        <div className="mt-4 space-y-1">
          {profiles === null && <Loader2 className="mx-auto my-6 size-5 animate-spin text-neutral-400" />}
          {profiles !== null && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-400">Aucun collègue trouvé.</p>
          )}
          {filtered.map((p) => (
            <button
              key={p.uid}
              type="button"
              onClick={() => { onPick(p); setOpen(false); }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-neutral-50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600">
                {initials(`${p.firstName} ${p.lastName}`)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-900">{p.firstName} {p.lastName}</span>
                <span className="block truncate text-xs text-neutral-400">{p.email}</span>
              </span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
