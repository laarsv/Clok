import { useState } from "react";
import { api } from "../api";

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
    <div>
      <p className="muted small">
        Stundenzettel als PDF (mit Unterschriftsfeld für die Lohnbuchhaltung)
        oder als CSV (für eigene Auswertung) herunterladen.
      </p>
      <div className="manual-grid">
        <label>Jahr
          <input type="number" value={year}
            onChange={(e) => setYear(parseInt(e.target.value || "0", 10))} />
        </label>
        <label>Monat
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
            {MONTHS.map((name, idx) => (
              <option key={idx} value={idx + 1}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button onClick={() => dl("pdf")} disabled={busy !== null}>
          {busy === "pdf" ? "Lade…" : "PDF herunterladen"}
        </button>
        <button onClick={() => dl("csv")} disabled={busy !== null}>
          {busy === "csv" ? "Lade…" : "CSV herunterladen"}
        </button>
      </div>
    </div>
  );
}
