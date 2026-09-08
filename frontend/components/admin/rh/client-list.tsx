"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, Search, Star } from "lucide-react";
import { listClients, archiveClient } from "@/lib/api/administration";
import { listUsers } from "@/lib/api/hr";
import type { Client, ClientStatus, UserBrief } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { ClientFormModal } from "@/components/admin/rh/client-form-modal";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  CLIENT_ACTIF: "Client actif",
  CLIENT_INACTIF: "Client inactif",
  ARCHIVE: "Archivé",
};

const STATUS_COLORS: Record<ClientStatus, string> = {
  PROSPECT: "bg-amber-100 text-amber-700",
  CLIENT_ACTIF: "bg-primary/10 text-primary",
  CLIENT_INACTIF: "bg-neutral-100 text-neutral-500",
  ARCHIVE: "bg-neutral-100 text-neutral-400",
};

const TABS: { value: ClientStatus | "tous"; label: string }[] = [
  { value: "tous", label: "Tous" },
  { value: "PROSPECT", label: "Prospects" },
  { value: "CLIENT_ACTIF", label: "Actifs" },
  { value: "CLIENT_INACTIF", label: "Inactifs" },
  { value: "ARCHIVE", label: "Archivés" },
];

function Rating({ value }: { value: number | null }) {
  if (!value) return <span className="text-xs text-neutral-300">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("size-3", i < value ? "fill-amber-400 text-amber-400" : "text-neutral-200")} />
      ))}
    </span>
  );
}

export function ClientList() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ClientStatus | "tous">("tous");

  async function load() {
    try {
      const data = await listClients();
      setClients(data.results);
    } catch (err) {
      setError(err instanceof ApiError ? `Erreur ${err.status}` : "Erreur de chargement");
    }
  }

  useEffect(() => {
    load();
    listUsers().then((res) => setUsers(res.results)).catch(() => setUsers([]));
  }, []);

  const userName = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, `${u.first_name} ${u.last_name}`]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "Non assigné");
  }, [users]);

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (tab !== "tous" && c.status !== tab) return false;
      if (!q) return true;
      const haystack = `${c.company_name} ${c.siret ?? ""} ${c.email ?? ""} ${c.sector ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [clients, search, tab]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!clients) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Clients</h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {clients.length} client{clients.length !== 1 ? "s" : ""} — base de données clients (CRM).
          </p>
        </div>
        <ClientFormModal onSaved={load} />
      </div>

      <div className="mb-5 flex items-center gap-3">
        <div className="flex max-w-[360px] flex-1 items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5">
          <Search className="size-4 shrink-0 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client, SIRET, secteur…"
            className="w-full min-w-0 border-0 bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-400"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors",
                tab === t.value ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
            <tr>
              <th className="px-5 py-3">Entreprise</th>
              <th className="px-5 py-3">Secteur</th>
              <th className="px-5 py-3">Statut</th>
              <th className="px-5 py-3">Notation</th>
              <th className="px-5 py-3">Assigné à</th>
              <th className="w-11 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-neutral-50">
                <td className="px-5 py-3.5">
                  <Link href={`/admin/rh/clients/${c.id}`} className="block">
                    <span className="block font-medium text-neutral-900">{c.company_name}</span>
                    <span className="block text-xs text-neutral-400">{c.siret || c.email || "—"}</span>
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-neutral-600">{c.sector || "—"}</td>
                <td className="px-5 py-3.5">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[c.status])}>
                    {STATUS_LABELS[c.status]}
                  </span>
                </td>
                <td className="px-5 py-3.5"><Rating value={c.rating} /></td>
                <td className="px-5 py-3.5 text-neutral-500">{userName(c.assigned_to)}</td>
                <td className="px-5 py-3.5">
                  <Popover>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      }
                    />
                    <PopoverContent className="w-44 p-1" align="end">
                      <Link
                        href={`/admin/rh/clients/${c.id}`}
                        className="block rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
                      >
                        Voir la fiche
                      </Link>
                      <ClientFormModal
                        client={c}
                        onSaved={load}
                        trigger={
                          <button type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50">
                            Modifier
                          </button>
                        }
                      />
                      {c.status !== "ARCHIVE" && (
                        <ConfirmModal
                          title="Archiver le client"
                          description={`Archiver « ${c.company_name} » ? Il restera consultable mais sortira des listes actives.`}
                          confirmLabel="Archiver"
                          onConfirm={async () => { await archiveClient(c.id); load(); }}
                          trigger={
                            <button type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-destructive hover:bg-destructive/5">
                              Archiver
                            </button>
                          }
                        />
                      )}
                    </PopoverContent>
                  </Popover>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  {clients.length === 0 ? "Aucun client pour l'instant." : "Aucun résultat."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
