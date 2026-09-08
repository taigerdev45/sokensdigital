"use client";

import { useRef } from "react";
import { ChevronDown, Diamond } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { Button } from "@/components/ui/button";
import { HeroBackground } from "@/components/sections/hero-background";
import type { PageSection } from "@/lib/api/types";

const DEFAULT_KICKER = "L'innovation de demain, aujourd'hui";
const DEFAULT_TITLE = "Excellence Digitale sur Mesure";
const DEFAULT_DESCRIPTION =
  "Nous transformons vos visions en solutions technologiques haute performance. Logiciels critiques, applications cloud et infrastructures sécurisées.";
const DEFAULT_STATS = [
  { value: "150+", label: "Projets livrés" },
  { value: "50+", label: "Clients satisfaits" },
  { value: "10 ans", label: "D'expertise" },
];

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export function Hero({ section }: { section?: PageSection | null }) {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const glowY = useTransform(scrollYProgress, [0, 1], ["0%", "35%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);

  const kicker = section?.kicker || DEFAULT_KICKER;
  const title = section?.title || DEFAULT_TITLE;
  const description = section?.subtitle || DEFAULT_DESCRIPTION;
  const ctaLabel = section?.cta_label || "Démarrer un Projet";
  const ctaLink = section?.cta_link || "/demarrer-un-projet";
  const ctaSecondaryLabel = section?.cta_secondary_label || "Voir nos expertises";
  const ctaSecondaryLink = section?.cta_secondary_link || "#expertise";
  const stats = section?.items?.length
    ? (section.items as { value: string; label: string }[])
    : DEFAULT_STATS;

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <HeroBackground />

      <motion.div
        aria-hidden
        style={{ y: glowY }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_88%),transparent)]"
      />

      <motion.div
        style={{ opacity: contentOpacity, y: contentY }}
        variants={container}
        initial="hidden"
        animate="show"
        className="pointer-events-none mx-auto max-w-5xl px-4 pt-28 pb-16 text-center sm:px-6 sm:pt-36 sm:pb-20 lg:px-8"
      >
        <motion.div
          variants={item}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-[11px] font-medium tracking-[0.15em] text-primary uppercase sm:text-xs"
        >
          <Diamond className="size-2.5 fill-primary" />
          {kicker}
        </motion.div>

        <motion.h1
          variants={item}
          className="mx-auto max-w-2xl text-4xl leading-[1.1] font-semibold tracking-tight text-foreground sm:max-w-none sm:text-5xl md:text-6xl"
        >
          {title}
        </motion.h1>

        <motion.p
          variants={item}
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {description}
        </motion.p>

        <motion.div
          variants={item}
          className="pointer-events-auto mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button
            render={<a href={ctaLink}>{ctaLabel}</a>}
            nativeButton={false}
            size="lg"
            className="h-12 w-full rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
          />
          <Button
            render={
              <a href={ctaSecondaryLink}>
                {ctaSecondaryLabel}
                <span aria-hidden>→</span>
              </a>
            }
            nativeButton={false}
            size="lg"
            variant="outline"
            className="h-12 w-full rounded-full border-white/15 bg-transparent px-7 text-sm font-semibold text-foreground hover:bg-white/5 sm:w-auto"
          />
        </motion.div>

        <motion.div variants={item} className="mt-14 flex justify-center sm:mt-16">
          <ChevronDown className="size-5 animate-bounce text-muted-foreground/60" />
        </motion.div>
      </motion.div>

      <div className="border-y border-white/10 bg-white/[0.02]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as const }}
          className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-10 sm:grid-cols-3 sm:gap-0 sm:px-6 lg:px-8"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] as const }}
              className="flex flex-col items-center gap-1.5 px-2 text-center"
            >
              <span className="text-3xl font-bold text-primary sm:text-4xl">
                {stat.value}
              </span>
              <span className="text-[11px] tracking-[0.1em] text-muted-foreground uppercase sm:text-xs">
                {stat.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
