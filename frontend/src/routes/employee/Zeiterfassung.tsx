import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../../components/Shell";
import EntryForm from "../../components/EntryForm";
import { useMediaQuery } from "../../lib/useMediaQuery";
import Week from "./Week";
import Month from "./Month";
import Log from "./Log";

type View = "woche" | "monat" | "liste";
const VIEWS: View[] = ["woche", "monat", "liste"];
const VIEW_LABELS: Record<View, string> = {
  woche: "Woche", monat: "Monat", liste: "Liste",
};
const STORAGE_KEY = "clok:zeit-view";
const DEFAULT_VIEW: View = "woche";

function readStored(): View {
  const v = localStorage.getItem(STORAGE_KEY);
  return (VIEWS as string[]).includes(v ?? "") ? (v as View) : DEFAULT_VIEW;
}

export default function Zeiterfassung() {
  const navigate = useNavigate();
  const params = useParams<{ view?: string }>();
  const urlView = params.view as View | undefined;
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Wenn die Route ohne View geöffnet wird (`/zeit`), auf den
  // gemerkten View umleiten – damit Bookmarks und Refresh funktionieren.
  useEffect(() => {
    if (!urlView) {
      navigate(`/zeit/${readStored()}`, { replace: true });
    } else if (VIEWS.includes(urlView)) {
      localStorage.setItem(STORAGE_KEY, urlView);
    }
  }, [urlView, navigate]);

  const view: View = (urlView && VIEWS.includes(urlView)) ? urlView : readStored();

  // Modal-State + Refresh-Mechanik: nach Speichern erhöhen wir den
  // refreshTick. Die View-Komponenten werden über `key` neu gemountet,
  // dadurch laden sie ihre Daten frisch (kein eigener API-Hook in der
  // Sub-View nötig).
  const [showAdd, setShowAdd] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const onSaved = () => {
    setShowAdd(false);
    setRefreshTick((t) => t + 1);
  };

  const backdropClass = `modal-backdrop ${isMobile ? "as-bottom-sheet" : ""}`;
  const modalClass = `modal ${isMobile ? "as-bottom-sheet-modal" : ""}`;

  return (
    <Shell>
      <div className="zeit">
        <div className="zeit-header">
          <div className="segment-control" role="tablist" aria-label="Ansicht">
            {VIEWS.map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={`segment ${view === v ? "active" : ""}`}
                onClick={() => navigate(`/zeit/${v}`)}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          <button className="primary add-entry-btn" onClick={() => setShowAdd(true)}>
            + Zeit erfassen
          </button>
        </div>

        {view === "woche" && <Week key={`woche-${refreshTick}`} />}
        {view === "monat" && <Month key={`monat-${refreshTick}`} />}
        {view === "liste" && <Log key={`liste-${refreshTick}`} />}

        {showAdd && (
          <div className={backdropClass} onClick={() => setShowAdd(false)}>
            <div className={modalClass} onClick={(e) => e.stopPropagation()}>
              <EntryForm onSaved={onSaved} onCancel={() => setShowAdd(false)} />
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
