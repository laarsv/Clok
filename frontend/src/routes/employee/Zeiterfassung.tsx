import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../../components/Shell";
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

  return (
    <Shell>
      <div className="zeit">
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

        {view === "woche" && <Week />}
        {view === "monat" && <Month />}
        {view === "liste" && <Log />}
      </div>
    </Shell>
  );
}
