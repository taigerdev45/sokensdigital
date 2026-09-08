"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { getPublicQuote, acceptPublicQuote } from "@/lib/api/public";
import { formatFcfa } from "@/lib/format-currency";
import type { PublicQuote } from "@/lib/api/types";

/** Public, token-authenticated devis acceptance — cahier des charges §4.7
 * "Validation Client — portail de validation client avec signature
 * électronique". e-signature: a hand-drawn signature (mouse/touch/pen,
 * see SignaturePad) sent as a base64 PNG, plus a timestamp + IP recorded
 * server-side as proof (see PublicQuoteAcceptView) — not a third-party
 * e-signature provider. */
export function DevisAcceptancePage({ token }: { token: string }) {
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    getPublicQuote(token)
      .then(setQuote)
      .catch((err) => setError(err instanceof Error ? err.message : "Devis introuvable."));
  }, [token]);

  async function handleAccept() {
    const signature = padRef.current?.toDataURL();
    if (!signature) {
      setError("Merci de signer dans la zone prévue avant de valider.");
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      setQuote(await acceptPublicQuote(token, signature));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'accepter ce devis.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-neutral-50 py-16">
        <div className="mx-auto max-w-3xl px-4">
          {error && !quote && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {!quote && !error && (
            <div className="flex justify-center py-24">
              <Loader2 className="size-6 animate-spin text-neutral-400" />
            </div>
          )}

          {quote && (
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 px-8 py-6">
                <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">{quote.quote_number}</p>
                <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{quote.subject || "Devis"}</h1>
                <p className="mt-1 text-sm text-neutral-500">{quote.client_name}</p>
              </div>

              {quote.status === "ACCEPTE" && (
                <div className="flex items-center justify-between gap-4 bg-emerald-50 px-8 py-4">
                  <div className="flex items-center gap-2.5 text-sm text-emerald-700">
                    <CheckCircle2 className="size-5 shrink-0" />
                    <span>
                      Devis accepté{quote.signed_at ? ` le ${new Date(quote.signed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ""}.
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {quote.signature_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={quote.signature_url} alt="Signature du client" className="h-14 shrink-0 object-contain" />
                    )}
                    {quote.company_stamp_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={quote.company_stamp_url} alt="Cachet Soken's Digital" className="h-14 shrink-0 object-contain" />
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-6 px-8 py-6">
                {quote.description && <p className="text-sm whitespace-pre-wrap text-neutral-700">{quote.description}</p>}

                <div className="overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Prestation</th>
                        <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {quote.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="px-4 py-2.5">
                            <p className="text-neutral-900">{line.service_title}</p>
                            {line.description && <p className="text-xs text-neutral-400">{line.description}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-neutral-700">
                            {line.amount_label || formatFcfa(line.total_line)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <div className="w-56 space-y-1 text-sm">
                    <div className="flex justify-between text-neutral-500">
                      <span>Total HT</span>
                      <span>{formatFcfa(quote.total_ht)}</span>
                    </div>
                    <div className="flex justify-between text-base font-semibold text-neutral-900">
                      <span>Total TTC</span>
                      <span>{formatFcfa(quote.total_ttc)}</span>
                    </div>
                  </div>
                </div>

                {quote.payment_terms.length > 0 && (
                  <div className="rounded-lg bg-neutral-50 p-4 text-xs text-neutral-500">
                    <p className="mb-1.5 font-semibold text-neutral-600">Conditions de paiement</p>
                    {quote.payment_terms.map((term, i) => (
                      <p key={i}>{term.label} — {term.percentage}%</p>
                    ))}
                  </div>
                )}
              </div>

              {quote.status === "ENVOYE" && (
                <div className="border-t border-neutral-100 bg-neutral-50 px-8 py-6">
                  {error && (
                    <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive">
                      {error}
                    </p>
                  )}

                  <label className="flex items-start gap-2.5 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                      className="mt-0.5"
                    />
                    J&apos;ai lu et j&apos;accepte les termes de ce devis.
                  </label>

                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold text-neutral-600 uppercase">Signature</p>
                    <SignaturePad ref={padRef} onChange={setSignatureEmpty} className="max-w-md" />
                  </div>

                  <Button
                    onClick={handleAccept}
                    disabled={!checked || signatureEmpty || accepting}
                    className="mt-4 gap-1.5 rounded-full px-6"
                  >
                    {accepting ? <Loader2 className="size-4 animate-spin" /> : "Accepter le devis"}
                  </Button>
                </div>
              )}

              {quote.status !== "ENVOYE" && quote.status !== "ACCEPTE" && (
                <div className="border-t border-neutral-100 bg-neutral-50 px-8 py-4 text-center text-sm text-neutral-500">
                  Ce devis n&apos;est plus disponible pour acceptation.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
