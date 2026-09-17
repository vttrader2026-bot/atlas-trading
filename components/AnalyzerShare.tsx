"use client";

import { useRef, useState } from "react";
import html2canvas from "html2canvas";

type Props = {
  bias: string;
  timeframe: string;
  confidence: string;
  support: string;
  resistance: string;
  summary: string;
};

export default function AnalyzerShare({
  bias,
  timeframe,
  confidence,
  support,
  resistance,
  summary,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const textSummary = [
    `Bias: ${bias}`,
    `Timeframe: ${timeframe}`,
    `Confidence: ${confidence}`,
    `Support: ${support}`,
    `Resistance: ${resistance}`,
    `Summary: ${summary}`,
  ].join("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(textSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);

    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 2,
    });

    const link = document.createElement("a");
    link.download = "analyzer-share.png";
    link.href = canvas.toDataURL("image/png");
    link.click();

    setDownloading(false);
  };

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-4 text-white">
      <div ref={cardRef} className="rounded-xl bg-slate-950 p-5">
        <div className="text-sm uppercase tracking-widest text-cyan-400">
          Share this read
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <p><span className="text-slate-400">Bias:</span> {bias}</p>
          <p><span className="text-slate-400">Timeframe:</span> {timeframe}</p>
          <p><span className="text-slate-400">Confidence:</span> {confidence}</p>
          <p><span className="text-slate-400">Support:</span> {support}</p>
          <p><span className="text-slate-400">Resistance:</span> {resistance}</p>
          <p className="pt-2 text-slate-300">{summary}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={handleCopy}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-black"
        >
          {copied ? "Copied" : "Copy text summary"}
        </button>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
        >
          {downloading ? "Downloading..." : "Download image"}
        </button>
      </div>
    </div>
  );
}
