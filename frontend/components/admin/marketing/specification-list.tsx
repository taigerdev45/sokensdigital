"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import { listSpecifications, deleteSpecification, updateSpecification } from "@/lib/api/marketing";
import type { SpecificationListItem, SpecType, SpecStatus } from "@/lib/api/types";

const TYPE_LABELS: Record<SpecType, string> = {
  FONCTIONNEL: "Fonctionnel",
  TECHNIQUE: "Technique",
};

const TYPE_COLORS: Record<SpecType, string> = {
  FONCTIONNEL: "bg-primary/10 text-primary",
  TECHNIQUE: "bg-violet-100 text-violet-700",
};

const STATUS_LABELS: Record<SpecStatus, string> = {
  BROUILLON: "Brouillon",
  FINALISE: "Finalisé",
};

const STATUS_COLORS: Record<SpecStatus, string> = {
  BROUILLON: "bg-neutral-100 text-neutral-500",
  FINALISE: "bg-emerald-100 text-emerald-700",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function SpecificationList({ basePath = "/admin/marketing/cahier-des-charges" }: { basePath?: string }) {
  const [specs, setSpecs] = useState<SpecificationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await listSpecifications();
      setSpecs(data.results);
    } catch {
      setError("Impossible de charger les cahiers des charges.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(spec: SpecificationListItem) {
    setBusyId(spec.id);
    try {
      await updateSpecification(spec.id, { status: spec.status === "FINALISE" ? "BROUILLON" : "FINALISE" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(spec: SpecificationListItem) {
    await deleteSpecification(spec.id);
    load();
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!specs) {
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
          <h1 className="text-2xl font-semibold text-neutral-900">Cahier des charges</h1>
          <p className="text-sm text-neutral-500">
            Document interne partagé entre Technique et Marketing — fonctionnel ou technique.
          </p>
        </div>
        <Link href={`${basePath}/nouveau`}>
          <Button className="gap-1.5 rounded-full px-4">
            <Plus className="size-4" /> Nouveau cahier des charges
          </Button>
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">N°</th>
              <th className="px-4 py-3 font-medium">Titre</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Dernière mise à jour</th>
              <th className="w-11 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {specs.map((spec) => (
              <tr key={spec.id}>
                <td className="px-4 py-3 text-neutral-900">
                  <Link href={`${basePath}/${spec.id}`} className="hover:text-primary hover:underline">
                    {spec.spec_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{spec.title}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${TYPE_COLORS[spec.spec_type]}`}>
                    {TYPE_LABELS[spec.spec_type]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[spec.status]}`}>
                    {STATUS_LABELS[spec.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(spec.updated_at)}</td>
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
                    <PopoverContent className="w-52 p-1" align="end">
                      <Link
                        href={`${basePath}/${spec.id}`}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                      >
                        <Pencil className="size-3.5" /> Modifier
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleStatus(spec)}
                        disabled={busyId === spec.id}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                      >
                        {spec.status === "FINALISE" ? (
                          <><RotateCcw className="size-3.5" /> Remettre en brouillon</>
                        ) : (
                          <><CheckCircle2 className="size-3.5" /> Marquer finalisé</>
                        )}
                      </button>
                      <ConfirmModal
                        title="Supprimer le cahier des charges"
                        description={`Supprimer définitivement "${spec.spec_number}" ? Cette action est irréversible.`}
                        onConfirm={() => handleDelete(spec)}
                        trigger={
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-destructive hover:bg-destructive/5"
                          >
                            <Trash2 className="size-3.5" /> Supprimer
                          </button>
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </td>
              </tr>
            ))}
            {specs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Aucun cahier des charges pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
