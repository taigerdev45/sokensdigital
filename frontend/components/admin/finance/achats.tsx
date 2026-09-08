"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Modal, ModalTrigger, ModalContent, ModalClose } from "@/components/ui/modal";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { formatFcfa } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth/auth-context";
import { listDepartments } from "@/lib/api/hr";
import { listDisbursementRequests } from "@/lib/api/finance";
import {
  listSuppliers, createSupplier,
  listProcurementRequests, createProcurementRequest,
  approveProcurementRcf, rejectProcurementRcf, approveProcurementManager, rejectProcurementManager,
  listSupplierQuotes, createSupplierQuote,
  validateSupplierQuoteRcf, validateSupplierQuoteManager, rejectSupplierQuote,
  listSupplierInvoices, createSupplierInvoice, validateSupplierInvoice,
} from "@/lib/api/procurement";
import type {
  Department, DisbursementRequest, ProcurementRequest, Supplier, SupplierInvoice, SupplierQuote,
} from "@/lib/api/types";

const CAN_APPROVE = ["SUPER_ADMIN", "DIRECTEUR_FINANCIER", "COMPTABLE"];
const CAN_MANAGE_SUPPLIERS = ["SUPER_ADMIN", "DIRECTEUR_FINANCIER"];
const CAN_VALIDATE_INVOICE = ["SUPER_ADMIN", "DIRECTEUR_FINANCIER"];

export function Achats() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Opérations d&apos;achats</h1>
        <p className="text-sm text-neutral-500">
          Fiche besoins → devis fournisseur → décaissement → facture. Chaque devis validé déclenche
          automatiquement la demande de décaissement correspondante.
        </p>
      </div>

      <Tabs defaultValue="fiches">
        <TabsList>
          <TabsTab value="fiches">Fiches besoins</TabsTab>
          <TabsTab value="devis">Devis fournisseur</TabsTab>
          <TabsTab value="factures">Factures fournisseur</TabsTab>
          <TabsTab value="fournisseurs">Fournisseurs</TabsTab>
          <TabsIndicator />
        </TabsList>

        <TabsPanel value="fiches" className="pt-6"><FichesPanel /></TabsPanel>
        <TabsPanel value="devis" className="pt-6"><DevisPanel /></TabsPanel>
        <TabsPanel value="factures" className="pt-6"><FacturesPanel /></TabsPanel>
        <TabsPanel value="fournisseurs" className="pt-6"><FournisseursPanel /></TabsPanel>
      </Tabs>
    </div>
  );
}

const PROCUREMENT_STATUS_LABELS: Record<ProcurementRequest["status"], string> = {
  BROUILLON: "Brouillon",
  EN_ATTENTE_RCF: "En attente RCF",
  EN_ATTENTE_MANAGER: "En attente Gérant",
  APPROUVEE: "Approuvée",
  REJETEE: "Rejetée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
};

const PROCUREMENT_STATUS_COLORS: Record<ProcurementRequest["status"], string> = {
  BROUILLON: "bg-neutral-100 text-neutral-600",
  EN_ATTENTE_RCF: "bg-amber-100 text-amber-700",
  EN_ATTENTE_MANAGER: "bg-amber-100 text-amber-700",
  APPROUVEE: "bg-emerald-100 text-emerald-700",
  REJETEE: "bg-destructive/10 text-destructive",
  EN_COURS: "bg-primary/10 text-primary",
  TERMINEE: "bg-emerald-100 text-emerald-700",
};

const DISBURSEMENT_STATUS_LABELS: Record<DisbursementRequest["status"], string> = {
  EN_ATTENTE_N1: "En attente (N1)",
  EN_ATTENTE_N2: "En attente (N2)",
  EN_ATTENTE_N3: "En attente (N3)",
  APPROUVE: "Approuvé",
  REJETE: "Rejeté",
  EXECUTE: "Exécuté",
};

const DISBURSEMENT_STATUS_COLORS: Record<DisbursementRequest["status"], string> = {
  EN_ATTENTE_N1: "bg-amber-100 text-amber-700",
  EN_ATTENTE_N2: "bg-amber-100 text-amber-700",
  EN_ATTENTE_N3: "bg-amber-100 text-amber-700",
  APPROUVE: "bg-emerald-100 text-emerald-700",
  REJETE: "bg-destructive/10 text-destructive",
  EXECUTE: "bg-primary/10 text-primary",
};

function FichesPanel() {
  const { profile } = useAuth();
  const canApprove = CAN_APPROVE.includes(profile?.role ?? "");
  const [requests, setRequests] = useState<ProcurementRequest[] | null>(null);
  const [disbursements, setDisbursements] = useState<DisbursementRequest[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    try {
      // Une demande de décaissement EST l'expression d'un besoin, au même
      // titre qu'une fiche état des besoins — les deux remontent donc dans
      // ce tableau. Elles gardent en revanche leur circuit d'approbation
      // propre (N1/N2/N3 selon le montant, écran Technique > Décaissements) :
      // on les affiche ici en lecture, sans dupliquer ce workflow.
      const [reqRes, deptRes, disbRes] = await Promise.all([
        listProcurementRequests(),
        listDepartments(),
        listDisbursementRequests(),
      ]);
      setRequests(reqRes.results);
      setDepartments(deptRes.results);
      setDisbursements(disbRes.results);
    } catch {
      setError("Impossible de charger les fiches besoins.");
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

  async function handleReject(id: string, reason: string, isRcf: boolean) {
    setActingId(id);
    try {
      await (isRcf ? rejectProcurementRcf(id, reason) : rejectProcurementManager(id, reason));
      await load();
    } finally {
      setActingId(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!requests) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><Plus className="size-4" /> Nouvelle fiche</Button>} />
          <SheetContent title="Nouvelle fiche état des besoins">
            <ProcurementRequestForm departments={departments} onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Origine</th>
              <th className="px-4 py-3 font-medium">Titre</th>
              <th className="px-4 py-3 font-medium">Département</th>
              <th className="px-4 py-3 font-medium">Montant estimé</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              {canApprove && <th className="px-4 py-3 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Fiche besoins</span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-neutral-900">{r.title}</p>
                  <p className="max-w-xs truncate text-xs text-neutral-400">{r.description}</p>
                </td>
                <td className="px-4 py-3 text-neutral-500">{r.department_name}</td>
                <td className="px-4 py-3 font-mono text-neutral-900">{formatFcfa(r.estimated_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${PROCUREMENT_STATUS_COLORS[r.status]}`}>
                    {PROCUREMENT_STATUS_LABELS[r.status]}
                  </span>
                  {r.status === "REJETEE" && r.rejection_reason && (
                    <p className="mt-1 max-w-xs truncate text-xs text-destructive" title={r.rejection_reason}>Motif : {r.rejection_reason}</p>
                  )}
                </td>
                {canApprove && (
                  <td className="px-4 py-3">
                    {r.status === "EN_ATTENTE_RCF" && (
                      <div className="flex gap-2">
                        <button disabled={actingId === r.id} onClick={() => handleAction(r.id, approveProcurementRcf)} className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700 disabled:opacity-40">Approuver (RCF)</button>
                        <RejectButton disabled={actingId === r.id} onReject={(reason) => handleReject(r.id, reason, true)} />
                      </div>
                    )}
                    {r.status === "EN_ATTENTE_MANAGER" && (
                      <div className="flex gap-2">
                        <button disabled={actingId === r.id} onClick={() => handleAction(r.id, approveProcurementManager)} className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700 disabled:opacity-40">Approuver (Gérant)</button>
                        <RejectButton disabled={actingId === r.id} onReject={(reason) => handleReject(r.id, reason, false)} />
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {disbursements.map((d) => (
              <tr key={d.id} className="bg-neutral-50/40">
                <td className="px-4 py-3">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Décaissement</span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-neutral-900">{d.beneficiary}</p>
                  <p className="max-w-xs truncate text-xs text-neutral-400">{d.reason}</p>
                </td>
                <td className="px-4 py-3 text-neutral-500">—</td>
                <td className="px-4 py-3 font-mono text-neutral-900">{formatFcfa(d.amount)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${DISBURSEMENT_STATUS_COLORS[d.status]}`}>
                    {DISBURSEMENT_STATUS_LABELS[d.status]}
                  </span>
                  {d.status === "REJETE" && d.rejection_reason && (
                    <p className="mt-1 max-w-xs truncate text-xs text-destructive" title={d.rejection_reason}>Motif : {d.rejection_reason}</p>
                  )}
                </td>
                {canApprove && (
                  <td className="px-4 py-3">
                    {/* Le circuit N1/N2/N3 vit dans son propre écran — pas
                        de duplication du workflow d'approbation ici. */}
                    <a href="/admin/technique/decaissements" className="text-xs text-primary hover:underline">
                      Traiter →
                    </a>
                  </td>
                )}
              </tr>
            ))}
            {requests.length === 0 && disbursements.length === 0 && (
              <tr><td colSpan={canApprove ? 6 : 5} className="px-4 py-8 text-center text-neutral-400">Aucun besoin enregistré.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RejectButton({ onReject, disabled }: { onReject: (reason: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  function handleConfirm() {
    if (!reason.trim()) return;
    onReject(reason.trim());
    setReason("");
    setOpen(false);
  }

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger render={<button disabled={disabled} className="rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive disabled:opacity-40">Rejeter</button>} />
      <ModalContent title="Rejeter la demande" className="max-w-sm">
        <label className="block">
          <span className={labelClass}>Motif du rejet (obligatoire)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={`${inputClass} resize-none`} required />
        </label>
        <div className="mt-5 flex items-center justify-end gap-3">
          <ModalClose render={<button type="button" className="rounded-full border border-neutral-200 px-4 py-1.5 text-xs font-semibold text-neutral-600 hover:border-neutral-300">Annuler</button>} />
          <Button type="button" disabled={!reason.trim()} onClick={handleConfirm} className="gap-1.5 rounded-full bg-destructive px-5 text-white hover:bg-destructive/90">Rejeter</Button>
        </div>
      </ModalContent>
    </Modal>
  );
}

function ProcurementRequestForm({ departments, onSaved }: { departments: Department[]; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createProcurementRequest({ title, description, estimated_amount: estimatedAmount, department: departmentId });
      onSaved();
    } catch {
      setError("Impossible de créer la fiche.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}
      <label className="block">
        <span className={labelClass}>Titre</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
      </label>
      <label className="block">
        <span className={labelClass}>Département</span>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass} required>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Montant estimé (FCFA)</span>
        <input type="number" step="0.01" value={estimatedAmount} onChange={(e) => setEstimatedAmount(e.target.value)} className={inputClass} required />
      </label>
      <label className="block">
        <span className={labelClass}>Besoins détaillés</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-24`} required />
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

const QUOTE_STATUS_LABELS: Record<SupplierQuote["status"], string> = {
  BROUILLON: "Brouillon",
  EN_ATTENTE: "En attente validation",
  VALIDE: "Validé",
  REJETE: "Rejeté",
};

const QUOTE_STATUS_COLORS: Record<SupplierQuote["status"], string> = {
  BROUILLON: "bg-neutral-100 text-neutral-600",
  EN_ATTENTE: "bg-amber-100 text-amber-700",
  VALIDE: "bg-emerald-100 text-emerald-700",
  REJETE: "bg-destructive/10 text-destructive",
};

function DevisPanel() {
  const { profile } = useAuth();
  const canApprove = CAN_APPROVE.includes(profile?.role ?? "");
  const [quotes, setQuotes] = useState<SupplierQuote[] | null>(null);
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    try {
      const [quoteRes, reqRes, supRes] = await Promise.all([listSupplierQuotes(), listProcurementRequests(), listSuppliers()]);
      setQuotes(quoteRes.results);
      setRequests(reqRes.results);
      setSuppliers(supRes.results);
    } catch {
      setError("Impossible de charger les devis.");
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
  if (!quotes) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><Plus className="size-4" /> Nouveau devis</Button>} />
          <SheetContent title="Nouveau devis fournisseur">
            <SupplierQuoteForm requests={requests} suppliers={suppliers} onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">N°</th>
              <th className="px-4 py-3 font-medium">Fournisseur</th>
              <th className="px-4 py-3 font-medium">Montant TTC</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              {canApprove && <th className="px-4 py-3 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {quotes.map((q) => (
              <tr key={q.id}>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">{q.quote_number}</td>
                <td className="px-4 py-3 text-neutral-900">{q.supplier_name}</td>
                <td className="px-4 py-3 font-mono text-neutral-900">{formatFcfa(q.amount_ttc)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${QUOTE_STATUS_COLORS[q.status]}`}>{QUOTE_STATUS_LABELS[q.status]}</span>
                </td>
                {canApprove && (
                  <td className="px-4 py-3">
                    {q.status === "EN_ATTENTE" && (
                      <div className="flex gap-2">
                        {!q.rcf_validated_at && (
                          <button disabled={actingId === q.id} onClick={() => handleAction(q.id, validateSupplierQuoteRcf)} className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-40">Valider (RCF)</button>
                        )}
                        <button disabled={actingId === q.id} onClick={() => handleAction(q.id, validateSupplierQuoteManager)} className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700 disabled:opacity-40">Valider (Gérant)</button>
                        <button disabled={actingId === q.id} onClick={() => handleAction(q.id, rejectSupplierQuote)} className="rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive disabled:opacity-40">Rejeter</button>
                      </div>
                    )}
                    {q.status === "VALIDE" && (
                      <p className="text-xs text-neutral-400">Décaissement auto-créé</p>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr><td colSpan={canApprove ? 5 : 4} className="px-4 py-8 text-center text-neutral-400">Aucun devis fournisseur.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierQuoteForm({ requests, suppliers, onSaved }: { requests: ProcurementRequest[]; suppliers: Supplier[]; onSaved: () => void }) {
  const [procurementId, setProcurementId] = useState(requests[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountHt, setAmountHt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createSupplierQuote({ procurement: procurementId, supplier: supplierId, quote_date: quoteDate, amount_ht: amountHt });
      onSaved();
    } catch {
      setError("Impossible de créer le devis.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}
      <label className="block">
        <span className={labelClass}>Fiche besoins</span>
        <select value={procurementId} onChange={(e) => setProcurementId(e.target.value)} className={inputClass} required>
          {requests.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Fournisseur</span>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass} required>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Date devis</span>
          <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className={inputClass} required />
        </label>
        <label className="block">
          <span className={labelClass}>Montant HT</span>
          <input type="number" step="0.01" value={amountHt} onChange={(e) => setAmountHt(e.target.value)} className={inputClass} required />
        </label>
      </div>
      <p className="text-xs text-neutral-400">TVA 18 % appliquée automatiquement.</p>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}

const INVOICE_STATUS_LABELS: Record<SupplierInvoice["status"], string> = {
  RECUE: "Reçue",
  VALIDEE: "Validée",
  PAYEE: "Payée",
};

const INVOICE_STATUS_COLORS: Record<SupplierInvoice["status"], string> = {
  RECUE: "bg-amber-100 text-amber-700",
  VALIDEE: "bg-primary/10 text-primary",
  PAYEE: "bg-emerald-100 text-emerald-700",
};

function FacturesPanel() {
  const { profile } = useAuth();
  const canValidate = CAN_VALIDATE_INVOICE.includes(profile?.role ?? "");
  const [invoices, setInvoices] = useState<SupplierInvoice[] | null>(null);
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    try {
      const [invRes, reqRes, supRes] = await Promise.all([listSupplierInvoices(), listProcurementRequests(), listSuppliers()]);
      setInvoices(invRes.results);
      setRequests(reqRes.results);
      setSuppliers(supRes.results);
    } catch {
      setError("Impossible de charger les factures fournisseur.");
    }
  }

  useEffect(() => { load(); }, []);

  async function handleValidate(id: string) {
    setActingId(id);
    try {
      await validateSupplierInvoice(id);
      await load();
    } finally {
      setActingId(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!invoices) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><Plus className="size-4" /> Nouvelle facture</Button>} />
          <SheetContent title="Nouvelle facture fournisseur">
            <SupplierInvoiceForm requests={requests} suppliers={suppliers} onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">N° facture</th>
              <th className="px-4 py-3 font-medium">Fournisseur</th>
              <th className="px-4 py-3 font-medium">Montant TTC</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              {canValidate && <th className="px-4 py-3 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-3 text-neutral-900">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-neutral-700">{inv.supplier_name}</td>
                <td className="px-4 py-3 font-mono text-neutral-900">{formatFcfa(inv.amount_ttc)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${INVOICE_STATUS_COLORS[inv.status]}`}>{INVOICE_STATUS_LABELS[inv.status]}</span>
                </td>
                {canValidate && (
                  <td className="px-4 py-3">
                    {inv.status === "RECUE" && (
                      <button disabled={actingId === inv.id} onClick={() => handleValidate(inv.id)} className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-40">
                        Valider
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={canValidate ? 5 : 4} className="px-4 py-8 text-center text-neutral-400">Aucune facture fournisseur.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierInvoiceForm({ requests, suppliers, onSaved }: { requests: ProcurementRequest[]; suppliers: Supplier[]; onSaved: () => void }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [procurementId, setProcurementId] = useState(requests[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountHt, setAmountHt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createSupplierInvoice({
        supplier: supplierId, procurement: procurementId,
        invoice_number: invoiceNumber, invoice_date: invoiceDate, amount_ht: amountHt,
      });
      onSaved();
    } catch {
      setError("Impossible de créer la facture.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}
      <label className="block">
        <span className={labelClass}>Fournisseur</span>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass} required>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Fiche besoins</span>
        <select value={procurementId} onChange={(e) => setProcurementId(e.target.value)} className={inputClass} required>
          {requests.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>N° facture fournisseur</span>
        <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputClass} required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Date facture</span>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputClass} required />
        </label>
        <label className="block">
          <span className={labelClass}>Montant HT</span>
          <input type="number" step="0.01" value={amountHt} onChange={(e) => setAmountHt(e.target.value)} className={inputClass} required />
        </label>
      </div>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}

function FournisseursPanel() {
  const { profile } = useAuth();
  const canManage = CAN_MANAGE_SUPPLIERS.includes(profile?.role ?? "");
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      const res = await listSuppliers();
      setSuppliers(res.results);
    } catch {
      setError("Impossible de charger les fournisseurs.");
    }
  }

  useEffect(() => { load(); }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!suppliers) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>;

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex items-center justify-end">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button className="gap-1.5 rounded-full px-4"><Plus className="size-4" /> Nouveau fournisseur</Button>} />
            <SheetContent title="Nouveau fournisseur">
              <SupplierForm onSaved={() => { setOpen(false); load(); }} />
            </SheetContent>
          </Sheet>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Téléphone</th>
              <th className="px-4 py-3 font-medium">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 text-neutral-900">{s.name}</td>
                <td className="px-4 py-3 text-neutral-700">{s.contact_person}</td>
                <td className="px-4 py-3 text-neutral-500">{s.phone}</td>
                <td className="px-4 py-3 text-neutral-500">{s.email}</td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">Aucun fournisseur.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createSupplier({ name, email, phone, address, bank_account: bankAccount, contact_person: contactPerson });
      onSaved();
    } catch {
      setError("Impossible de créer le fournisseur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>}
      <label className="block">
        <span className={labelClass}>Nom</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </label>
      <label className="block">
        <span className={labelClass}>Contact</span>
        <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputClass} required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
        </label>
        <label className="block">
          <span className={labelClass}>Téléphone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Adresse</span>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} className={`${inputClass} min-h-16`} required />
      </label>
      <label className="block">
        <span className={labelClass}>Compte bancaire (IBAN)</span>
        <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className={inputClass} required />
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
