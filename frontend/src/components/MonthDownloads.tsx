import { useState } from "react";
import { api } from "../api";
import Button from "./ui/Button";
import Select from "./ui/Select";
import { IconDownload } from "./ui/Icons";

interface Props {
  /** wenn unset: aktueller User (eigener Stundenzettel) */
  employeeId?: number;
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
                "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Authentifizierter Download – fetched mit Bearer-Token, weil der
 *  einfache <a download href> den Token nicht mitschicken kann. */
async function authedDownload(url: string, filenameHint: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(await res.text() || "Download fehlgeschlagen");
  const blob = await res.blob();
  const obj = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = obj;
  a.download = filenameHint;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(obj);
}

export default function MonthDownloads({ employeeId }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dl = async (kind: "pdf" | "csv") => {
    setError(null); setBusy(kind);
    try {
      const url = kind === "pdf"
        ? api.pdfUrl(year, month, employeeId)
        : api.exportUrl(year, month, employeeId);
      const ext = kind === "pdf" ? "pdf" : "csv";
      await authedDownload(url, `clok_${year}-${String(month).padStart(2, "0")}.${ext}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        Stundenzettel als PDF (mit Unterschriftsfeld für die Lohnbuchhaltung)
        oder als CSV (für eigene Auswertung) herunterladen.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Jahr</span>
          <input type="number" className="input" value={year}
            onChange={(e) => setYear(parseInt(e.target.value || "0", 10))} />
        </label>
        <div className="block">
          <span className="field-label">Monat</span>
          <Select
            value={String(month)}
            onChange={(v) => setMonth(parseInt(v, 10))}
            options={MONTHS.map((name, idx) => ({ value: String(idx + 1), label: name }))}
            aria-label="Monat"
          />
        </div>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={() => dl("pdf")} disabled={busy !== null}>
          <IconDownload size={16} /> {busy === "pdf" ? "Lade…" : "PDF herunterladen"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => dl("csv")} disabled={busy !== null}>
          <IconDownload size={16} /> {busy === "csv" ? "Lade…" : "CSV herunterladen"}
        </Button>
      </div>
    </div>
  );
}
