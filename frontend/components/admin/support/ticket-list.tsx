"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, Eye } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { listTickets } from "@/lib/api/support";
import type { SupportTicketListItem, TicketStatus } from "@/lib/api/types";

const STATUS_LABELS: Record<TicketStatus, string> = {
  OUVERT: "Ouvert",
  EN_COURS: "En cours",
  FERME: "Fermé",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  OUVERT: "bg-amber-100 text-amber-700",
  EN_COURS: "bg-primary/10 text-primary",
  FERME: "bg-neutral-100 text-neutral-500",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TicketList() {
  const [tickets, setTickets] = useState<SupportTicketListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTickets()
      .then((data) => setTickets(data.results))
      .catch(() => setError("Impossible de charger les tickets."));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!tickets) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Tickets</h1>
        <p className="text-sm text-neutral-500">Demandes reçues via le widget de chat et le formulaire de contact du site.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Visiteur</th>
              <th className="px-4 py-3 font-medium">Sujet</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Assigné à</th>
              <th className="px-4 py-3 font-medium">Dernière mise à jour</th>
              <th className="w-11 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td className="px-4 py-3 text-neutral-900">
                  <Link href={`/admin/support/tickets/${ticket.id}`} className="hover:text-primary hover:underline">
                    {ticket.visitor_name}
                  </Link>
                  <p className="text-xs text-neutral-400">{ticket.visitor_email}</p>
                </td>
                <td className="px-4 py-3 text-neutral-600">{ticket.subject || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {ticket.assigned_to ? `${ticket.assigned_to.first_name} ${ticket.assigned_to.last_name}` : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(ticket.updated_at)}</td>
                <td className="px-4 py-3">
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
                    <PopoverContent className="w-48 p-1" align="end">
                      <Link
                        href={`/admin/support/tickets/${ticket.id}`}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                      >
                        <Eye className="size-3.5" /> Voir / Répondre
                      </Link>
                    </PopoverContent>
                  </Popover>
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Aucun ticket pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
