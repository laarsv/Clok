import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../../components/Shell";
import EntryForm from "../../components/EntryForm";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { IconPlus } from "../../components/ui/Icons";
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

  // Wenn die Route ohne View geöffnet wird (`/zeit`), auf den passenden
  // Default umleiten. Mobile bekommt unabhängig vom localStorage IMMER
  // die Listenansicht – Wochen-/Monats-Grid ist auf 380–768 px-Phones
  // unhandlich. Wer auf Mobile bewusst Woche/Monat will, wechselt per
  // Toggle und landet ab dann unter /zeit/woche resp. /zeit/monat;
  // dieser explizite Pfad wird respektiert.
  useEffect(() => {
    if (!urlView) {
      const target: View = isMobile ? "liste" : readStored();
      navigate(`/zeit/${target}`, { replace: true });
    } else if (VIEWS.includes(urlView)) {
      localStorage.setItem(STORAGE_KEY, urlView);
    }
  }, [urlView, navigate, isMobile]);

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

  return (
    <Shell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-ink/15 bg-paper p-1" role="tablist" aria-label="Ansicht">
            {VIEWS.map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={`rounded-md px-3 py-1.5 text-sm font-bold transition ${
                  view === v ? "bg-royal text-paper" : "text-ink/60 hover:text-ink"
                }`}
                onClick={() => navigate(`/zeit/${v}`)}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <IconPlus size={18} /> Zeit erfassen
          </Button>
        </div>

        {view === "woche" && <Week key={`woche-${refreshTick}`} />}
        {view === "monat" && <Month key={`monat-${refreshTick}`} />}
        {view === "liste" && <Log key={`liste-${refreshTick}`} />}

        <Modal open={showAdd} onClose={() => setShowAdd(false)}>
          <EntryForm onSaved={onSaved} onCancel={() => setShowAdd(false)} />
        </Modal>
      </div>
    </Shell>
  );
}
