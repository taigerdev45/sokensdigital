"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, KeyRound, ClipboardCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Modal, ModalTrigger, ModalContent, ModalClose } from "@/components/ui/modal";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { useAuth } from "@/lib/auth/auth-context";
import { listUsers } from "@/lib/api/hr";
import {
  listMaintainedApps, createMaintainedApp, assignMaintainedApp,
  getMaintainedAppSecrets, listMaintenanceReports, createMaintenanceReport,
} from "@/lib/api/maintenance";
import type {
  MaintainedApp, MaintainedAppSecrets, MaintenanceFrequency,
  MaintenanceReport, MaintenanceReportStatus, UserBrief,
} from "@/lib/api/types";

/** Le "responsable de l'équipe technique" du cahier des charges — pas de
 * rôle dédié côté back non plus, Chef de Projet/Admin en tiennent lieu. */
const MAINTENANCE_LEADS = ["SUPER_ADMIN", "CHEF_DE_PROJET"];

const FREQUENCY_LABELS: Record<MaintenanceFrequency, string> = {
  TROIS_PAR_SEMAINE: "3× / semaine",
  HEBDOMADAIRE: "Hebdomadaire",
  BIMENSUELLE: "2 semaines",
  MENSUELLE: "Mensuelle",
};

const REPORT_STATUS_LABELS: Record<MaintenanceReportStatus, string> = {
  OK: "Tout fonctionne",
  DEGRADE: "Dégradé",
  INCIDENT: "Incident",
};

const REPORT_STATUS_COLORS: Record<MaintenanceReportStatus, string> = {
  OK: "bg-emerald-100 text-emerald-700",
  DEGRADE: "bg-amber-100 text-amber-700",
  INCIDENT: "bg-destructive/10 text-destructive",
};

export function Maintenance() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Maintenance</h1>
        <p className="text-sm text-neutral-500">
          Applications et sites livrés que l&apos;équipe entretient. Chaque passage donne lieu à
          un rapport visible par toute l&apos;équipe technique.
        </p>
      </div>

      <Tabs defaultValue="apps">
        <TabsList>
          <TabsTab value="apps">Applications</TabsTab>
          <TabsTab value="rapports">Rapports</TabsTab>
          <TabsIndicator />
        </TabsList>

        <TabsPanel value="apps" className="pt-6"><AppsPanel /></TabsPanel>
        <TabsPanel value="rapports" className="pt-6"><ReportsPanel /></TabsPanel>
      </Tabs>
    </div>
  );
}

function AppsPanel() {
  const { profile } = useAuth();
  const isLead = MAINTENANCE_LEADS.includes(profile?.role ?? "");
  const [apps, setApps] = useState<MaintainedApp[] | null>(null);
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [appsRes, usersRes] = await Promise.all([
        listMaintainedApps(),
        isLead ? listUsers() : Promise.resolve({ results: [] as UserBrief[] }),
      ]);
      setApps(appsRes.results);
      setUsers(usersRes.results);
    } catch {
      setError("Impossible de charger les applications maintenues.");
    }
  }, [isLead]);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!apps) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;

  return (
    <div>
      {isLead && (
        <div className="mb-4 flex items-center justify-end">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><Plus className="size-4" /> Nouvelle application</Button>} />
            <SheetContent title="Application à maintenir">
              <AppForm onSaved={() => { setOpen(false); load(); }} />
            </SheetContent>
          </Sheet>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} users={users} isLead={isLead} onChanged={load} />
        ))}
        {apps.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-neutral-400">
            Aucune application enregistrée.
          </p>
        )}
      </div>
    </div>
  );
}

function AppCard({
  app, users, isLead, onChanged,
}: { app: MaintainedApp; users: UserBrief[]; isLead: boolean; onChanged: () => void }) {
  const [assigning, setAssigning] = useState(false);
  // Le compteur remonte l'attendu de la semaine — un passage manquant se
  // voit d'un coup d'œil sans avoir à ouvrir l'onglet Rapports.
  const behind = app.reports_last_7_days < app.expected_reports_per_week;

  async function handleAssign(userId: string) {
    setAssigning(true);
    try {
      await assignMaintainedApp(app.id, userId);
      onChanged();
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-neutral-900">{app.name}</h3>
            {!app.is_active && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">Inactive</span>
            )}
          </div>
          <p className="truncate text-xs text-neutral-400">
            {[app.client_name, app.tech_stack, app.hosting_provider].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {app.url && (
          <a href={app.url} target="_blank" rel="noreferrer" className="shrink-0 text-neutral-400 hover:text-primary">
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
          {FREQUENCY_LABELS[app.maintenance_frequency]}
        </span>
        <span className={`rounded-full px-2 py-0.5 ${behind ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
          {app.reports_last_7_days}/{app.expected_reports_per_week} passages (7j)
        </span>
        {app.last_report_status && (
          <span className={`rounded-full px-2 py-0.5 ${REPORT_STATUS_COLORS[app.last_report_status]}`}>
            {REPORT_STATUS_LABELS[app.last_report_status]}
          </span>
        )}
      </div>

      <p className="mb-3 text-xs text-neutral-500">
        Assignée à :{" "}
        <span className="font-medium text-neutral-700">{app.assigned_to_name ?? "personne"}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <SecretsButton app={app} />
        {isLead && (
          <select
            value={app.assigned_to ?? ""}
            disabled={assigning}
            onChange={(e) => e.target.value && handleAssign(e.target.value)}
            className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600"
          >
            <option value="">Assigner à…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {`${u.first_name} ${u.last_name}`.trim() || u.email}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function SecretsButton({ app }: { app: MaintainedApp }) {
  const [open, setOpen] = useState(false);
  const [secrets, setSecrets] = useState<MaintainedAppSecrets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal(next: boolean) {
    setOpen(next);
    // Chargés seulement à l'ouverture, jamais avec la liste : chaque appel
    // est journalisé côté serveur (AuditLog READ_SECRETS).
    if (!next || secrets) return;
    setLoading(true);
    setError(null);
    try {
      setSecrets(await getMaintainedAppSecrets(app.id));
    } catch {
      setError("Ces accès sont réservés à la personne assignée et aux responsables techniques.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={reveal}>
      <ModalTrigger
        render={
          <button className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            <KeyRound className="size-3.5" /> Accès
          </button>
        }
      />
      <ModalContent title={`Accès — ${app.name}`} className="max-w-lg">
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Ces identifiants ouvrent des systèmes en production. Chaque consultation est
          enregistrée dans le journal d&apos;audit.
        </p>
        {loading && <Loader2 className="size-5 animate-spin text-neutral-400" />}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {secrets && (
          <div className="space-y-4 text-sm">
            <SecretField label="URL admin" value={secrets.admin_url} isLink />
            <SecretField label="Identifiant" value={secrets.admin_username} />
            <SecretField label="Mot de passe" value={secrets.admin_password} mono />
            {secrets.access_notes && <SecretField label="Notes" value={secrets.access_notes} />}

            {secrets.service_accounts.length > 0 && (
              <div className="border-t border-neutral-100 pt-3">
                <p className="mb-2 text-xs font-semibold text-neutral-500 uppercase">Comptes de service</p>
                <div className="space-y-3">
                  {secrets.service_accounts.map((sa) => (
                    <div key={sa.id} className="rounded-lg bg-neutral-50 p-3">
                      <p className="text-xs font-semibold text-neutral-800">{sa.service_name}</p>
                      <SecretField label="Identifiant" value={sa.username} compact />
                      <SecretField label="Mot de passe" value={sa.password} mono compact />
                      {sa.notes && <SecretField label="Notes" value={sa.notes} compact />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <ModalClose render={<Button variant="outline" className="rounded-full px-4">Fermer</Button>} />
        </div>
      </ModalContent>
    </Modal>
  );
}

function SecretField({
  label, value, mono, isLink, compact,
}: { label: string; value: string; mono?: boolean; isLink?: boolean; compact?: boolean }) {
  if (!value) return null;
  return (
    <div className={compact ? "mt-1.5" : ""}>
      <p className="text-xs text-neutral-400">{label}</p>
      {isLink ? (
        <a href={value} target="_blank" rel="noreferrer" className="break-all text-sm text-primary hover:underline">
          {value}
        </a>
      ) : (
        <p className={`break-all text-neutral-800 ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</p>
      )}
    </div>
  );
}

function AppForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", app_type: "SITE_WEB", url: "", description: "",
    tech_stack: "", hosting_provider: "", repository_url: "",
    admin_url: "", admin_username: "", admin_password: "", access_notes: "",
    maintenance_frequency: "TROIS_PAR_SEMAINE",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createMaintainedApp(form as never);
      onSaved();
    } catch {
      setError("Impossible d'enregistrer l'application.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}

      <label className="block">
        <span className={labelClass}>Nom</span>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} required />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Type</span>
          <select value={form.app_type} onChange={(e) => set("app_type", e.target.value)} className={inputClass}>
            <option value="SITE_WEB">Site web</option>
            <option value="APP_WEB">Application web</option>
            <option value="APP_MOBILE">Application mobile</option>
            <option value="API">API / service</option>
            <option value="AUTRE">Autre</option>
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Fréquence</span>
          <select value={form.maintenance_frequency} onChange={(e) => set("maintenance_frequency", e.target.value)} className={inputClass}>
            <option value="TROIS_PAR_SEMAINE">3 fois par semaine</option>
            <option value="HEBDOMADAIRE">Hebdomadaire</option>
            <option value="BIMENSUELLE">Toutes les 2 semaines</option>
            <option value="MENSUELLE">Mensuelle</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>URL de production</span>
        <input type="url" value={form.url} onChange={(e) => set("url", e.target.value)} className={inputClass} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Stack</span>
          <input value={form.tech_stack} onChange={(e) => set("tech_stack", e.target.value)} className={inputClass} placeholder="Next.js, Django…" />
        </label>
        <label className="block">
          <span className={labelClass}>Hébergeur</span>
          <input value={form.hosting_provider} onChange={(e) => set("hosting_provider", e.target.value)} className={inputClass} placeholder="Vercel, Render…" />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>Dépôt Git</span>
        <input type="url" value={form.repository_url} onChange={(e) => set("repository_url", e.target.value)} className={inputClass} />
      </label>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="mb-3 text-xs font-semibold text-neutral-600 uppercase">Accès administration</p>
        <p className="mb-3 text-xs text-neutral-500">
          Chiffrés au repos. Visibles uniquement par la personne assignée et les responsables.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className={labelClass}>URL admin</span>
            <input type="url" value={form.admin_url} onChange={(e) => set("admin_url", e.target.value)} className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Identifiant</span>
              <input value={form.admin_username} onChange={(e) => set("admin_username", e.target.value)} className={inputClass} autoComplete="off" />
            </label>
            <label className="block">
              <span className={labelClass}>Mot de passe</span>
              <input type="password" value={form.admin_password} onChange={(e) => set("admin_password", e.target.value)} className={inputClass} autoComplete="new-password" />
            </label>
          </div>
          <label className="block">
            <span className={labelClass}>Notes d&apos;accès</span>
            <textarea value={form.access_notes} onChange={(e) => set("access_notes", e.target.value)} className={`${inputClass} min-h-16`} />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

function ReportsPanel() {
  const [reports, setReports] = useState<MaintenanceReport[] | null>(null);
  const [apps, setApps] = useState<MaintainedApp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [repRes, appsRes] = await Promise.all([listMaintenanceReports(), listMaintainedApps()]);
      setReports(repRes.results);
      setApps(appsRes.results);
    } catch {
      setError("Impossible de charger les rapports.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!reports) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><ClipboardCheck className="size-4" /> Nouveau rapport</Button>} />
          <SheetContent title="Rapport de maintenance">
            <ReportForm apps={apps} onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Application</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Contrôles</th>
              <th className="px-4 py-3 font-medium">Par</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {reports.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <p className="text-neutral-900">{r.app_name}</p>
                  <p className="max-w-xs truncate text-xs text-neutral-400">{r.summary}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${REPORT_STATUS_COLORS[r.status]}`}>
                    {REPORT_STATUS_LABELS[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <Check ok={r.site_reachable} label="En ligne" />
                    <Check ok={r.ssl_valid} label="SSL" />
                    <Check ok={r.backups_verified} label="Backups" />
                    <Check ok={r.updates_applied} label="MàJ" />
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-500">{r.performed_by_name ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(r.performed_at).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-400">Aucun rapport.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 ${ok ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-400"}`}>
      {label}
    </span>
  );
}

function ReportForm({ apps, onSaved }: { apps: MaintainedApp[]; onSaved: () => void }) {
  const [appId, setAppId] = useState(apps[0]?.id ?? "");
  const [status, setStatus] = useState<MaintenanceReportStatus>("OK");
  const [checks, setChecks] = useState({
    site_reachable: true, ssl_valid: true, backups_verified: false, updates_applied: false,
  });
  const [summary, setSummary] = useState("");
  const [nextActions, setNextActions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createMaintenanceReport({ app: appId, status, summary, next_actions: nextActions, ...checks });
      onSaved();
    } catch {
      setError("Impossible d'enregistrer le rapport.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}

      <label className="block">
        <span className={labelClass}>Application</span>
        <select value={appId} onChange={(e) => setAppId(e.target.value)} className={inputClass} required>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>

      <label className="block">
        <span className={labelClass}>Constat général</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as MaintenanceReportStatus)} className={inputClass}>
          <option value="OK">Tout fonctionne</option>
          <option value="DEGRADE">Dégradé — à surveiller</option>
          <option value="INCIDENT">Incident — action requise</option>
        </select>
      </label>

      <fieldset className="rounded-lg border border-neutral-200 p-3">
        <legend className={labelClass}>Points de contrôle</legend>
        <div className="space-y-2">
          {([
            ["site_reachable", "Le site / l'app répond"],
            ["ssl_valid", "Certificat SSL valide"],
            ["backups_verified", "Sauvegardes vérifiées"],
            ["updates_applied", "Mises à jour appliquées"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={checks[key]}
                onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))}
                className="size-4 rounded border-neutral-300"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className={labelClass}>Ce qui a été fait / constaté</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className={`${inputClass} min-h-24`} required />
      </label>

      <label className="block">
        <span className={labelClass}>À faire au prochain passage</span>
        <textarea value={nextActions} onChange={(e) => setNextActions(e.target.value)} className={`${inputClass} min-h-16`} />
      </label>

      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
