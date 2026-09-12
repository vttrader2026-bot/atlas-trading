"use client";

import { useState } from "react";
import Image from "next/image";
import { useLanguage } from "@/lib/i18n";

type Analysis = {
  pair: string;
  bias: string;
  keyLevel: string;
  invalidation: string;
  plan: string;
};

export default function AnalyzerPage() {
  const { t, lang } = useLanguage();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  function onFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("lang", lang);
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("analyzer.genericError"));
      } else {
        setResult(data);
      }
    } catch {
      setError(t("analyzer.connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl tracking-tight">{t("analyzer.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("analyzer.subtitle")}</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className="mt-8 border border-dashed border-line rounded-lg p-10 text-center"
      >
        {preview ? (
          <div className="relative w-full max-w-lg mx-auto aspect-video">
            <Image src={preview} alt="chart preview" fill className="object-contain rounded-md" unoptimized />
          </div>
        ) : (
          <p className="text-text-muted text-sm">{t("analyzer.dragHere")}</p>
        )}
        <label className="mt-4 inline-block cursor-pointer px-4 py-2 rounded-md border border-line text-sm hover:bg-surface transition-colors">
          {t("analyzer.chooseFile")}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {preview && (
        <button
          onClick={analyze}
          disabled={loading}
          className="mt-5 px-5 py-2.5 rounded-md bg-gold text-bg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? t("analyzer.readingChart") : t("analyzer.analyzeChart")}
        </button>
      )}

      {error && (
        <div className="mt-6 border border-bear/30 bg-bear/5 rounded-lg p-5">
          <p className="text-sm text-bear leading-relaxed">{error}</p>
        </div>
      )}

      <div className="mt-6 border border-line rounded-lg bg-surface p-6">
        {result && (
          <div className="mb-5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-bull" />
            <span className="text-sm text-text-muted">{result.pair}</span>
          </div>
        )}
        <div className="grid sm:grid-cols-4 gap-4">
          <Field label={t("analyzer.bias")} value={result?.bias} />
          <Field label={t("analyzer.keyLevel")} value={result?.keyLevel} />
          <Field label={t("analyzer.invalidation")} value={result?.invalidation} />
          <Field label={t("analyzer.plan")} value={result?.plan} />
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className={!value ? "opacity-40" : ""}>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-sm mt-1 leading-relaxed">{value ?? "—"}</div>
    </div>
  );
}
