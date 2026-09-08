"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { inputClass, labelClass, readOnlyInputClass } from "@/components/admin/form-styles";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfileModal } from "@/lib/admin/profile-modal-context";
import { updateOwnProfile } from "@/lib/firebase/profile";
import { updateMe } from "@/lib/api/me";
import { uploadAvatar } from "@/lib/api/upload";
import { ROLE_LABELS } from "@/lib/firebase/types";

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export function ProfileSheet() {
  const { user, profile, refreshProfile } = useAuth();
  const { open, closeProfileModal } = useProfileModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && profile) {
      setFirstName(profile.firstName ?? "");
      setLastName(profile.lastName ?? "");
      setAvatarUrl(profile.avatarUrl ?? null);
      setSaved(false);
      setError(null);
    }
  }, [open, profile]);

  if (!user || !profile) return null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      setAvatarUrl(await uploadAvatar(file));
    } catch {
      setError("Impossible de charger cette photo. Réessayez.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateOwnProfile(user.uid, { firstName, lastName, avatarUrl });
      await updateMe({ first_name: firstName, last_name: lastName, avatar_url: avatarUrl });
      await refreshProfile();
      setSaved(true);
    } catch {
      setError("Impossible d'enregistrer les modifications. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) closeProfileModal(); }}>
      <SheetContent title="Mon profil">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="relative">
              <span className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-semibold text-primary">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, not a local/optimizable asset
                  <img src={avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  initials(firstName, lastName)
                )}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label="Changer la photo de profil"
                className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm transition-colors hover:bg-neutral-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <p className="text-xs text-neutral-400">JPG, PNG — 5 Mo max</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={labelClass}>Prénom</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} required />
            </label>
            <label className="block">
              <span className={labelClass}>Nom</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} required />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Email</span>
            <input value={profile.email} disabled className={readOnlyInputClass} />
          </label>

          <label className="block">
            <span className={labelClass}>Rôle</span>
            <input value={ROLE_LABELS[profile.role]} disabled className={readOnlyInputClass} />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving || uploading} className="rounded-full px-6">
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <Check className="size-3.5" /> Enregistré
              </span>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
