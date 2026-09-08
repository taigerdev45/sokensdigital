"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { formatFcfa } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth/auth-context";
import {
  listCashEntries, createCashEntry, reconcileCashEntry,
  downloadCashVoucherPdf, downloadMonthlyCashStatement,
  listBankEntries, createBankEntry, reconcileBankEntry,
  listCapitalContributions, createCapitalContribution, validateCapitalContribution,
  submitCapitalContributionForLegalRegistration, postCapitalContributionJournalEntry,
} from "@/lib/api/treasury";
import type {
  BankEntry, BankEntrySource, CapitalContribution,
  CashEntry, CashEntrySource,
} from "@/lib/api/types";

const CAN_MANAGE_CAISSE = ["SUPER_ADMIN", "DIRECTEUR_FINANCIER", "CAISSIER"];
const CAN_MANAGE_BANQUE_CAPITAL = ["SUPER_ADMIN", "DIRECTEUR_FINANCIER"];

export function Tresorerie() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Trésorerie</h1>
        <p className="text-sm text-neutral-500">
          Caisse physique, compte bancaire et apports en capital — chaque mouvement rapproché poste
          automatiquement son écriture comptable.
        </p>
      </div>

      <Tabs defaultValue="caisse">
        <TabsList>
          <TabsTab value="caisse">Caisse</TabsTab>
          <TabsTab value="banque">Banque</TabsTab>
          <TabsTab value="capital">Apports capital</TabsTab>
          <TabsIndicator />
        </TabsList>

        <TabsPanel value="caisse" className="pt-6">
          <CaissePanel />
        </TabsPanel>
        <TabsPanel value="banque" className="pt-6">
          <BanquePanel />
        </TabsPanel>
        <TabsPanel value="capital" className="pt-6">
          <CapitalPanel />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

const CASH_SOURCE_LABELS: Record<CashEntrySource, string> = {
  CLIENT_ESPECES: "Client paie en espèces",
  RETRAIT_BANQUE: "Retrait compte bancaire",
  DEPOT_BANQUE: "Dépôt espèces → banque",
  DEPENSE_OPERATIONNELLE: "Dépense opérationnelle",
  FOURNISSEUR_ESPECES: "Paiement fournisseur en espèces",
};

function CaissePanel() {
  const { profile } = useAuth();
  const canManage = CAN_MANAGE_CAISSE.includes(profile?.role ?? "");
  const [entries, setEntries] = useState<CashEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function load() {
    try {
      const res = await listCashEntries();
      setEntries(res.results);
    } catch {
      setError("Impossible de charger la caisse.");
    }
  }

  useEffect(() => { load(); }, []);

  async function handleReconcile(id: string) {
    setActingId(id);
    try {
      await reconcileCashEntry(id);
      await load();
    } finally {
      setActingId(null);
    }
  }

  async function handleExportStatement() {
    setExporting(true);
    try {
      const now = new Date();
      await downloadMonthlyCashStatement(now.getFullYear(), now.getMonth() + 1, profile ? `${profile.firstName} ${profile.lastName}` : undefined);
    } finally {
      setExporting(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!entries) {
    return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={handleExportStatement} disabled={exporting} className="gap-1.5 rounded-full px-4">
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          État de caisse (mois en cours)
        </Button>
        {canManage && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><Plus className="size-4" /> Nouvelle pièce</Button>} />
            <SheetContent title="Nouvelle pièce de caisse">
              <CashEntryForm onSaved={() => { setOpen(false); load(); }} />
            </SheetContent>
          </Sheet>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">N° pièce</th>
              <th className="px-4 py-3 font-medium">Motif</th>
              <th className="px-4 py-3 font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              {canManage && <th className="px-4 py-3 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">{entry.voucher_number}</td>
                <td className="px-4 py-3 text-neutral-700">{CASH_SOURCE_LABELS[entry.source]}</td>
                <td className="px-4 py-3 text-neutral-900">
                  <span className={entry.type === "ENTREE" ? "text-emerald-700" : "text-neutral-900"}>
                    {entry.type === "ENTREE" ? "+" : "−"}{formatFcfa(entry.amount)}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500">{entry.date}</td>
                <td className="px-4 py-3">
                  {entry.reconciled_at ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Rapprochée</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">En attente</span>
                  )}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!entry.reconciled_at && (
                        <button
                          disabled={actingId === entry.id}
                          onClick={() => handleReconcile(entry.id)}
                          className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-40"
                        >
                          Rapprocher
                        </button>
                      )}
                      <button
                        onClick={() => downloadCashVoucherPdf(entry)}
                        className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 hover:border-neutral-300"
                      >
                        PDF
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-neutral-400">Aucun mouvement de caisse.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashEntryForm({ onSaved }: { onSaved: () => void }) {
  const [type, setType] = useState<CashEntry["type"]>("ENTREE");
  const [source, setSource] = useState<CashEntrySource>("CLIENT_ESPECES");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sourcesForType: CashEntrySource[] =
    type === "ENTREE" ? ["CLIENT_ESPECES", "RETRAIT_BANQUE"] : ["DEPOT_BANQUE", "DEPENSE_OPERATIONNELLE", "FOURNISSEUR_ESPECES"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createCashEntry({ type, source, amount, date, description });
      onSaved();
    } catch {
      setError("Impossible de créer la pièce de caisse.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}
      <label className="block">
        <span className={labelClass}>Type</span>
        <select value={type} onChange={(e) => { setType(e.target.value as CashEntry["type"]); setSource(e.target.value === "ENTREE" ? "CLIENT_ESPECES" : "DEPOT_BANQUE"); }} className={inputClass}>
          <option value="ENTREE">Entrée</option>
          <option value="SORTIE">Sortie</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Motif</span>
        <select value={source} onChange={(e) => setSource(e.target.value as CashEntrySource)} className={inputClass}>
          {sourcesForType.map((s) => <option key={s} value={s}>{CASH_SOURCE_LABELS[s]}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Montant (FCFA)</span>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} required />
        </label>
        <label className="block">
          <span className={labelClass}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-20`} />
      </label>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}

const BANK_SOURCE_LABELS: Record<BankEntrySource, string> = {
  APPORT_CAPITAL: "Apport capital",
  CLIENT_CHEQUE: "Client paie chèque",
  CLIENT_VIREMENT: "Client paie virement",
  CAISSE_DEPOT: "Dépôt espèces caisse",
  FOURNISSEUR_CHEQUE: "Paiement fournisseur chèque",
  FOURNISSEUR_VIREMENT: "Paiement fournisseur virement",
  RETRAIT_ESPECES: "Retrait espèces",
  AUTRE: "Autre",
};

function BanquePanel() {
  const { profile } = useAuth();
  const canManage = CAN_MANAGE_BANQUE_CAPITAL.includes(profile?.role ?? "");
  const [entries, setEntries] = useState<BankEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await listBankEntries();
      setEntries(res.results);
    } catch {
      setError("Impossible de charger les mouvements bancaires.");
    }
  }

  useEffect(() => { load(); }, []);

  async function handleReconcile(id: string) {
    setActingId(id);
    try {
      await reconcileBankEntry(id);
      await load();
    } finally {
      setActingId(null);
    }
  }

  if (!canManage) {
    return <p className="text-sm text-neutral-400">Réservé au Directeur Financier / Super-Admin.</p>;
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!entries) {
    return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><Plus className="size-4" /> Nouveau mouvement</Button>} />
          <SheetContent title="Nouveau mouvement bancaire">
            <BankEntryForm onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Référence</th>
              <th className="px-4 py-3 font-medium">Motif</th>
              <th className="px-4 py-3 font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">{entry.reference}</td>
                <td className="px-4 py-3 text-neutral-700">{BANK_SOURCE_LABELS[entry.source]}</td>
                <td className="px-4 py-3">
                  <span className={entry.type === "ENTREE" ? "text-emerald-700" : "text-neutral-900"}>
                    {entry.type === "ENTREE" ? "+" : "−"}{formatFcfa(entry.amount)}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500">{entry.date}</td>
                <td className="px-4 py-3">
                  {entry.reconciled_at ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Rapproché</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">En attente</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {!entry.reconciled_at && (
                    <button
                      disabled={actingId === entry.id}
                      onClick={() => handleReconcile(entry.id)}
                      className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-40"
                    >
                      Rapprocher
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Aucun mouvement bancaire.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BankEntryForm({ onSaved }: { onSaved: () => void }) {
  const [type, setType] = useState<BankEntry["type"]>("ENTREE");
  const [source, setSource] = useState<BankEntrySource>("CLIENT_VIREMENT");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sourcesForType: BankEntrySource[] =
    type === "ENTREE"
      ? ["APPORT_CAPITAL", "CLIENT_CHEQUE", "CLIENT_VIREMENT", "CAISSE_DEPOT", "AUTRE"]
      : ["FOURNISSEUR_CHEQUE", "FOURNISSEUR_VIREMENT", "RETRAIT_ESPECES", "AUTRE"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createBankEntry({ type, source, amount, date, reference, description });
      onSaved();
    } catch {
      setError("Impossible de créer le mouvement bancaire.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}
      <label className="block">
        <span className={labelClass}>Type</span>
        <select value={type} onChange={(e) => { setType(e.target.value as BankEntry["type"]); setSource(e.target.value === "ENTREE" ? "CLIENT_VIREMENT" : "FOURNISSEUR_VIREMENT"); }} className={inputClass}>
          <option value="ENTREE">Crédit</option>
          <option value="SORTIE">Débit</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Motif</span>
        <select value={source} onChange={(e) => setSource(e.target.value as BankEntrySource)} className={inputClass}>
          {sourcesForType.map((s) => <option key={s} value={s}>{BANK_SOURCE_LABELS[s]}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Montant (FCFA)</span>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} required />
        </label>
        <label className="block">
          <span className={labelClass}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>N° chèque / virement</span>
        <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} required />
      </label>
      <label className="block">
        <span className={labelClass}>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-20`} />
      </label>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}

const CAPITAL_STATUS_LABELS: Record<CapitalContribution["status"], string> = {
  BROUILLON: "Brouillon",
  DOCUMENTS_TRANSMIS: "Documents transmis",
  VALIDEE: "Validée (Finance)",
  ENREGISTREE: "Enregistrée légalement",
  COMPTABILISEE: "Comptabilisée",
};

const CAPITAL_STATUS_COLORS: Record<CapitalContribution["status"], string> = {
  BROUILLON: "bg-neutral-100 text-neutral-600",
  DOCUMENTS_TRANSMIS: "bg-amber-100 text-amber-700",
  VALIDEE: "bg-primary/10 text-primary",
  ENREGISTREE: "bg-primary/10 text-primary",
  COMPTABILISEE: "bg-emerald-100 text-emerald-700",
};

function CapitalPanel() {
  const { profile } = useAuth();
  const canManage = CAN_MANAGE_BANQUE_CAPITAL.includes(profile?.role ?? "");
  const [contributions, setContributions] = useState<CapitalContribution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await listCapitalContributions();
      setContributions(res.results);
    } catch {
      setError("Impossible de charger les apports en capital.");
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAction(id: string, action: (id: string) => Promise<unknown>) {
    setActingId(id);
    try {
      await action(id);
      await load();
    } finally {
      setActingId(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!contributions) {
    return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><Plus className="size-4" /> Nouvel apport</Button>} />
          <SheetContent title="Nouvel apport en capital">
            <CapitalContributionForm onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Date prévue</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              {canManage && <th className="px-4 py-3 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {contributions.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono text-neutral-900">{formatFcfa(c.amount)}</td>
                <td className="px-4 py-3 text-neutral-500">{c.contribution_date}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${CAPITAL_STATUS_COLORS[c.status]}`}>
                    {CAPITAL_STATUS_LABELS[c.status]}
                  </span>
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    {c.status === "BROUILLON" && (
                      <button disabled={actingId === c.id} onClick={() => handleAction(c.id, validateCapitalContribution)} className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-40">
                        Valider justificatifs
                      </button>
                    )}
                    {c.status === "VALIDEE" && (
                      <button disabled={actingId === c.id} onClick={() => handleAction(c.id, submitCapitalContributionForLegalRegistration)} className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-40">
                        Enregistrer légalement
                      </button>
                    )}
                    {c.status === "ENREGISTREE" && (
                      <button disabled={actingId === c.id} onClick={() => handleAction(c.id, postCapitalContributionJournalEntry)} className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700 disabled:opacity-40">
                        Comptabiliser
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {contributions.length === 0 && (
              <tr><td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-neutral-400">Aucun apport en capital.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CapitalContributionForm({ onSaved }: { onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [contributionDate, setContributionDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createCapitalContribution({ amount, contribution_date: contributionDate });
      onSaved();
    } catch {
      setError("Impossible de créer l'apport en capital.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}
      <label className="block">
        <span className={labelClass}>Montant (FCFA)</span>
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} required />
      </label>
      <label className="block">
        <span className={labelClass}>Date prévue de l&apos;apport</span>
        <input type="date" value={contributionDate} onChange={(e) => setContributionDate(e.target.value)} className={inputClass} required />
      </label>
      <p className="text-xs text-neutral-400">
        Procès-verbal AGE, attestation de dépôt, statuts mis à jour et annonce légale à transmettre au Directeur
        Financier avant validation.
      </p>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}
