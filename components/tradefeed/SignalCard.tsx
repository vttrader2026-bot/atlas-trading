"use client";

// ATLAS-SIGNAL-CARD-v1

import type { ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";
import { formatPrice } from "@/lib/binance";
import type { PublishedTrade } from "@/lib/tradeFeed";
import { TP_ALLOCATION, buildRail, deriveState, type CardState } from "@/lib/tradeFeedView";

// Premium Trade Feed signal card. Presentation only: every price shown is the string Atlas
// published, the live price is the Binance ticker the page already fetched, and the only
// derived values are positions on the price map and the card state (lib/tradeFeedView.ts).

type Tone = "gold" | "bull" | "bear" | "muted";

const STATE_META: Record<CardState, { key: string; msg: string; tone: Tone }> = {
  waiting: { key: "stWaiting", msg: "msgWaiting", tone: "gold" },
  inZone: { key: "stInZone", msg: "msgInZone", tone: "gold" },
  active: { key: "stActive", msg: "msgActive", tone: "gold" },
  tpHit: { key: "stTpHit", msg: "msgTpHit", tone: "bull" },
  completed: { key: "stCompleted", msg: "msgCompleted", tone: "bull" },
  stopped: { key: "stStopped", msg: "msgStopped", tone: "bear" },
  closed: { key: "stClosed", msg: "msgClosed", tone: "muted" },
};

const TONE_TEXT: Record<Tone, string> = {
  gold: "text-gold",
  bull: "text-bull",
  bear: "text-bear",
  muted: "text-text-muted",
};
const TONE_PILL: Record<Tone, string> = {
  gold: "border-gold/40 bg-gold/10 text-gold",
  bull: "border-bull/40 bg-bull/10 text-bull",
  bear: "border-bear/40 bg-bear/10 text-bear",
  muted: "border-line bg-surface-raised text-text-muted",
};
const TONE_RULE: Record<Tone, string> = {
  gold: "from-transparent via-gold to-transparent",
  bull: "from-transparent via-bull to-transparent",
  bear: "from-transparent via-bear to-transparent",
  muted: "from-transparent via-line to-transparent",
};

function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={"font-data " + className} style={{ unicodeBidi: "isolate" }}>
      {children}
    </span>
  );
}

export function SignalCard({
  trade,
  livePrice,
  logo,
  adminAction,
  actions,
}: {
  trade: PublishedTrade;
  /** Latest Binance last price (already fetched by the page), or null when unavailable. */
  livePrice: number | null;
  logo: ReactNode;
  adminAction?: ReactNode;
  /** Connected-workflow actions (Create Trade Plan / I Took This Trade / Watch Signal). */
  actions?: ReactNode;
}) {
  const { t, lang } = useLanguage();
  const isLong = trade.direction === "Long";
  const hit = trade.hitLevels ?? [];

  const { state, lastTp } = deriveState(trade, livePrice);
  const meta = STATE_META[state];
  const rail = isLong ? buildRail(trade, livePrice) : null;
  const finished = state === "completed" || state === "stopped" || state === "closed";
  const tps = [trade.tp1, trade.tp2, trade.tp3];
  // The first target not yet reached is the one in focus ("next") while the trade is live.
  const nextIdx = finished ? -1 : tps.findIndex((_, i) => !hit.includes(`TP${i + 1}`));
  const dateLocale = lang === "ar" ? "en-GB" : lang === "fr" ? "fr" : "en";
  const when = new Date(trade.createdAt).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const msg = t(`tradeFeed.${meta.msg}`);

  return (
    <article
      data-state={state}
      className={
        "@container relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-surface-raised to-surface " +
        "shadow-[0_18px_44px_-24px_color-mix(in_srgb,var(--gold)_55%,transparent)] " +
        (state === "stopped" ? "border-bear/30" : "border-gold/25") +
        (finished ? " opacity-[0.97]" : "")
      }
    >
      <div aria-hidden className={"h-px w-full bg-gradient-to-r " + TONE_RULE[meta.tone]} />

      <div className="flex flex-1 flex-col gap-4 p-4 @md:p-5">
        {/* Identity */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-full p-0.5 ring-1 ring-gold/40">{logo}</div>
            <div className="min-w-0">
              <h3 className="font-heading text-xl font-semibold leading-tight tracking-tight">
                <Num>{trade.pair}</Num>
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider " +
                    (isLong ? "border-bull/40 bg-bull/10 text-bull" : "border-bear/40 bg-bear/10 text-bear")
                  }
                >
                  {isLong ? t("risk.long") : t("risk.short")}
                </span>
                {isLong && (
                  <span className="inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold">
                    {t("tradeFeed.spot")}
                  </span>
                )}
                {trade.timeframe && (
                  <span className="inline-flex items-center rounded-md border border-line px-2 py-0.5 text-xs text-text-muted">
                    <Num>{trade.timeframe}</Num>
                  </span>
                )}
              </div>
            </div>
          </div>

          {adminAction ? <div className="shrink-0">{adminAction}</div> : null}
        </header>

        {/* State + live price */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
              TONE_PILL[meta.tone]
            }
          >
            <span
              aria-hidden
              className={
                "h-1.5 w-1.5 rounded-full bg-current " + (state === "inZone" || state === "active" ? "animate-pulse" : "")
              }
            />
            {t(`tradeFeed.${meta.key}`)}
            {(state === "tpHit" || state === "completed") && lastTp && (
              <>
                <span aria-hidden>·</span>
                <Num>{lastTp}</Num>
              </>
            )}
          </span>
          <time dir="ltr" style={{ unicodeBidi: "isolate" }} dateTime={new Date(trade.createdAt).toISOString()} className="text-xs text-text-muted">
            {when}
          </time>
        </div>
        {livePrice !== null && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-label text-text-muted">{t("tradeFeed.live")}</span>
            <Num className="text-2xl font-bold leading-tight">${formatPrice(livePrice)}</Num>
          </div>
        )}

        {/* Price map */}
        {rail && (
          <div aria-hidden className="relative h-9" dir="ltr">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-bear/70 to-bear/10"
              style={{ left: `${rail.sl}%`, width: `${Math.max(rail.zone.from - rail.sl, 0)}%` }}
            />
            <div
              className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm border border-gold/60 bg-gold/25"
              style={{ left: `${rail.zone.from}%`, width: `max(${rail.zone.to - rail.zone.from}%, 6px)` }}
            />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-bull/10 to-bull/70"
              style={{ left: `${rail.zone.to}%`, width: `${Math.max(rail.tps[2] - rail.zone.to, 0)}%` }}
            />
            <span
              className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-bear"
              style={{ left: `${rail.sl}%` }}
            />
            {rail.tps.map((p, i) => {
              const reached = hit.includes(`TP${i + 1}`);
              return (
                <span
                  key={i}
                  className={
                    "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-bull " +
                    (reached ? "bg-bull" : "bg-surface")
                  }
                  style={{ left: `${p}%` }}
                />
              );
            })}
            {rail.live && !finished && (
              <span
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-gold shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_35%,transparent)]"
                style={{ left: `${rail.live.pos}%` }}
              />
            )}
          </div>
        )}

        {/* Entry zone + stop loss */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-3">
            <div className="text-label text-gold">{t("tradeFeed.entryZone")}</div>
            <Num className="mt-1 block text-base font-semibold break-words">{trade.entryZone || "—"}</Num>
          </div>
          <div className="rounded-xl border border-bear/30 bg-bear/[0.06] p-3">
            <div className="text-label text-bear">{t("tradeFeed.stopLoss")}</div>
            <Num className="mt-1 block text-base font-semibold break-words">{trade.invalidation || "—"}</Num>
          </div>
        </div>

        {/* Take-profit progression: 30 / 40 / 30 */}
        <section aria-label={t("tradeFeed.targets")}>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-label text-text-muted">{t("tradeFeed.targets")}</h4>
            <span className="text-xs text-text-muted">{t("tradeFeed.ofPosition")}</span>
          </div>
          <div className="mt-2 flex h-1.5 gap-1" aria-hidden>
            {TP_ALLOCATION.map((pct, i) => (
              <span
                key={i}
                className={"rounded-full " + (hit.includes(`TP${i + 1}`) ? "bg-bull" : i === nextIdx ? "bg-bull/45" : "bg-line")}
                style={{ flex: pct }}
              />
            ))}
          </div>
          <ol className="mt-2.5 grid grid-cols-3 gap-2">
            {tps.map((price, i) => {
              const reached = hit.includes(`TP${i + 1}`);
              const isNext = i === nextIdx;
              return (
                <li
                  key={i}
                  className={
                    "rounded-xl border p-2.5 " +
                    (reached
                      ? "border-bull/40 bg-bull/10"
                      : isNext
                        ? "border-bull/30 bg-surface-raised"
                        : "border-line bg-surface/60")
                  }
                >
                  <div className="flex items-center justify-between gap-1">
                    <Num className={"text-xs font-semibold " + (reached || isNext ? "text-bull" : "text-text-muted")}>
                      TP{i + 1}
                    </Num>
                    <span className="text-xs text-text-muted">
                      <Num>{TP_ALLOCATION[i]}%</Num>
                    </span>
                  </div>
                  <Num className="mt-1 block text-sm font-semibold break-words">{price || "—"}</Num>
                  <div className={"mt-1 text-xs " + (reached ? "text-bull" : "text-text-muted")}>
                    {reached ? `✓ ${t("tradeFeed.hit")}` : isNext ? t("tradeFeed.next") : " "}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {trade.reasoning && (
          <p className="whitespace-pre-line border-t border-line pt-3 text-sm leading-relaxed text-text-muted">
            {trade.reasoning}
          </p>
        )}

        <footer className="mt-auto flex flex-col gap-1.5">
          <p className={"text-sm font-medium " + TONE_TEXT[meta.tone]}>{msg}</p>
        </footer>
        {actions}
      </div>
    </article>
  );
}
