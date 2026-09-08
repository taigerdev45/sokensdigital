"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass, labelClass, cardClass } from "@/components/admin/form-styles";
import { listProjects, listProjectTasks, listTimesheets, submitTimesheet, validateTimesheet } from "@/lib/api/projects";
import { TeamTimesheet } from "@/components/admin/technique/team-timesheet";
import type { Project, ProjectTask, Timesheet, TimesheetStatus } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

const STATUS_LABELS: Record<TimesheetStatus, string> = {
  SOUMIS: "Soumis",
  VALIDE: "Validé",
  REJETE: "Rejeté",
};

const STATUS_COLORS: Record<TimesheetStatus, string> = {
  SOUMIS: "bg-amber-100 text-amber-700",
  VALIDE: "bg-emerald-100 text-emerald-700",
  REJETE: "bg-destructive/10 text-destructive",
};

export function TimesheetList() {
  const { profile } = useAuth();
  const isChefDeProjet = profile?.role === "CHEF_DE_PROJET" || profile?.role === "SUPER_ADMIN";
  const [tab, setTab] = useState<"team" | "mine">(isChefDeProjet ? "team" : "mine");

  if (isChefDeProjet) {
    return (
      <div>
        <div className="mb-5 flex items-center gap-1 border-b border-neutral-200">
          {([
            { key: "team", label: "Équipe" },
            { key: "mine", label: "Ma saisie" },
          ] as { key: "team" | "mine"; label: string }[]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "border-primary text-primary" : "border-transparent text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "team" ? <TeamTimesheet /> : <MyTimesheetEntries isChefDeProjet={isChefDeProjet} />}
      </div>
    );
  }

  return <MyTimesheetEntries isChefDeProjet={isChefDeProjet} />;
}

function MyTimesheetEntries({ isChefDeProjet }: { isChefDeProjet: boolean }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [entries, setEntries] = useState<Timesheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then((data) => {
        setProjects(data.results);
        if (data.results.length > 0) setSelectedProjectId(data.results[0].id);
      })
      .catch(() => setError("Impossible de charger les projets."));
  }, []);

  async function loadEntries(projectId: string) {
    try {
      setEntries(await listTimesheets(projectId));
    } catch {
      setError("Impossible de charger les feuilles de temps.");
    }
  }

  useEffect(() => {
    if (selectedProjectId) {
      setEntries(null);
      loadEntries(selectedProjectId);
    }
  }, [selectedProjectId]);

  async function handleValidate(entry: Timesheet, newStatus: "VALIDE" | "REJETE") {
    setBusyId(entry.id);
    try {
      await validateTimesheet(selectedProjectId, entry.id, newStatus);
      loadEntries(selectedProjectId);
    } catch {
      setError("Impossible de mettre à jour cette feuille de temps.");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!projects) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{isChefDeProjet ? "Détail par projet" : "Timesheets"}</h1>
          <p className="text-sm text-neutral-500">
            {isChefDeProjet
              ? "Consultation et validation des heures saisies, projet par projet."
              : "Saisie quotidienne de tes heures de travail."}
          </p>
        </div>
        <Button
          data-tour="module-technique-timesheets"
          onClick={() => setShowForm((v) => !v)}
          className="gap-1.5 rounded-full px-4"
        >
          <Plus className="size-4" /> Nouvelle saisie
        </Button>
      </div>

      <label className="mb-4 block max-w-xs">
        <span className={labelClass}>Projet</span>
        <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} className={inputClass}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      {projects.length === 0 && (
        <p className="text-sm text-neutral-400">Tu n&apos;es rattaché à aucun projet pour l&apos;instant.</p>
      )}

      {showForm && selectedProjectId && (
        <NewEntryForm
          projectId={selectedProjectId}
          onSaved={() => {
            setShowForm(false);
            loadEntries(selectedProjectId);
          }}
        />
      )}

      {entries === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
              <tr>
                {isChefDeProjet && <th className="px-4 py-3 font-medium">Collaborateur</th>}
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Tâche</th>
                <th className="px-4 py-3 font-medium">Heures</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  {isChefDeProjet && (
                    <td className="px-4 py-3 text-neutral-900">
                      {entry.user.first_name} {entry.user.last_name}
                    </td>
                  )}
                  <td className="px-4 py-3 text-neutral-500">{entry.date}</td>
                  <td className="px-4 py-3 text-neutral-500">{entry.task_title ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-900">{entry.hours}h</td>
                  <td className="px-4 py-3 text-neutral-500">{entry.description || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[entry.status]}`}>
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isChefDeProjet && entry.status === "SOUMIS" && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleValidate(entry, "VALIDE")}
                          disabled={busyId === entry.id}
                          aria-label="Valider"
                          className="text-neutral-400 hover:text-primary"
                        >
                          <Check className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleValidate(entry, "REJETE")}
                          disabled={busyId === entry.id}
                          aria-label="Rejeter"
                          className="text-neutral-400 hover:text-destructive"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={isChefDeProjet ? 7 : 6} className="px-4 py-8 text-center text-neutral-400">
                    Aucune feuille de temps pour l&apos;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewEntryForm({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("8");
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState("");
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTaskId("");
    listProjectTasks(projectId).then(setTasks).catch(() => setTasks([]));
  }, [projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await submitTimesheet(projectId, { date, hours, description, task_id: taskId || undefined });
      onSaved();
    } catch {
      setError("Impossible d'enregistrer — une saisie existe peut-être déjà pour cette date sur cette tâche.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`mb-6 space-y-4 ${cardClass}`}>
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </label>
        <label className="block">
          <span className={labelClass}>Heures</span>
          <input type="number" step="0.5" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)} className={inputClass} required />
        </label>
        <label className="block">
          <span className={labelClass}>Tâche (optionnel)</span>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </label>
      <Button type="submit" disabled={saving} className="rounded-full px-5">
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
      </Button>
    </form>
  );
}
