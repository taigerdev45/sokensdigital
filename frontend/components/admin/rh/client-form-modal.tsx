"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalTrigger, ModalContent, ModalClose } from "@/components/ui/modal";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { createClient, updateClient, type ClientInput } from "@/lib/api/administration";
import { listUsers } from "@/lib/api/hr";
import type { Client, ClientStatus, UserBrief } from "@/lib/api/types";

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "CLIENT_ACTIF", label: "Client actif" },
  { value: "CLIENT_INACTIF", label: "Client inactif" },
  { value: "ARCHIVE", label: "Archivé" },
];

export function ClientFormModal({
  client,
  onSaved,
  trigger,
}: {
  /** Present → edit mode. Absent → create mode. */
  client?: Client;
  onSaved: () => void;
  trigger?: React.ReactElement;
}) {
  const isEdit = Boolean(client);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [form, setForm] = useState<ClientInput>({
    company_name: client?.company_name ?? "",
    siret: client?.siret ?? "",
    sector: client?.sector ?? "",
    address: client?.address ?? "",
    city: client?.city ?? "",
    postal_code: client?.postal_code ?? "",
    country: client?.country ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    website: client?.website ?? "",
    status: client?.status ?? "PROSPECT",
    rating: client?.rating ?? null,
    notes: client?.notes ?? "",
    assigned_to: client?.assigned_to ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      company_name: client?.company_name ?? "",
      siret: client?.siret ?? "",
      sector: client?.sector ?? "",
      address: client?.address ?? "",
      city: client?.city ?? "",
      postal_code: client?.postal_code ?? "",
      country: client?.country ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      website: client?.website ?? "",
      status: client?.status ?? "PROSPECT",
      rating: client?.rating ?? null,
      notes: client?.notes ?? "",
      assigned_to: client?.assigned_to ?? null,
    });
    listUsers().then((res) => setUsers(res.results)).catch(() => setUsers([]));
  }, [open, client]);

  function set<K extends keyof ClientInput>(key: K, value: ClientInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isEdit && client) {
        await updateClient(client.id, form);
      } else {
        await createClient(form);
      }
      onSaved();
      setOpen(false);
    } catch {
      setError("Impossible d'enregistrer — vérifie le SIRET (14 chiffres, unique) et les champs obligatoires.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger
        render={
          trigger ?? (
            <Button className="gap-1.5 rounded-full px-4">
              <Plus className="size-4" /> Nouveau client
            </Button>
          )
        }
      />
      <ModalContent title={isEdit ? "Modifier le client" : "Nouveau client"} className="max-w-xl">
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
              {error}
            </p>
          )}

          <label className="block">
            <span className={labelClass}>Raison sociale</span>
            <input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className={inputClass} required />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>SIRET</span>
              <input value={form.siret ?? ""} onChange={(e) => set("siret", e.target.value)} className={inputClass} maxLength={14} placeholder="14 chiffres" />
            </label>
            <label className="block">
              <span className={labelClass}>Secteur d&apos;activité</span>
              <input value={form.sector ?? ""} onChange={(e) => set("sector", e.target.value)} className={inputClass} />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Adresse</span>
            <input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} className={inputClass} />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={labelClass}>Ville</span>
              <input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Code postal</span>
              <input value={form.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Pays</span>
              <input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} className={inputClass} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Email</span>
              <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Téléphone</span>
              <input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Site web</span>
            <input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} className={inputClass} placeholder="https://" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Statut</span>
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Notation</span>
              <select
                value={form.rating ?? ""}
                onChange={(e) => set("rating", e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{"★".repeat(n)}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Assigné à</span>
            <select
              value={form.assigned_to ?? ""}
              onChange={(e) => set("assigned_to", e.target.value || null)}
              className={inputClass}
            >
              <option value="">Non assigné</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>Notes</span>
            <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} className={`${inputClass} resize-none`} />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving} className="rounded-full px-6">
              {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? "Enregistrer" : "Créer"}
            </Button>
            <ModalClose render={<Button type="button" variant="outline" className="rounded-full px-5">Annuler</Button>} />
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
