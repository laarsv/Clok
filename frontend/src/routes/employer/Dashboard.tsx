import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import { api, type EmployerDashboardData } from "../../api";
import { fmtHours } from "../../lib/datetime";

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<EmployerDashboardData | null>(null);
  const [showOff, setShowOff] = useState(false);

  useEffect(() => {
    api.employerDashboard().then(setData);
  }, []);

  if (!data) return <Shell><div className="placeholder">Lade…</div></Shell>;

  const rows = showOff ? data.employees : data.employees.filter((r) => !r.offboarded_at);

  return (
    <Shell>
      <div className="dashboard">
        <div className="dashboard-toolbar">
          <h2>Team · {data.reference_month}</h2>
          <span className="spacer" />
          <label className="toggle">
            <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />
            <span>Offboarded anzeigen</span>
          </label>
          <button onClick={() => navigate("/employer/employees/new")}>+ Mitarbeiter</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Soll</th>
              <th>Ist</th>
              <th>Saldo</th>
              <th>Urlaub genommen</th>
              <th>Resturlaub</th>
              <th>Krank (Monat)</th>
              <th>Krank (Jahr)</th>
              <th>Letzte Aktivität</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/employer/employees/${r.id}`)} style={{ cursor: "pointer" }}>
                <td><Link to={`/employer/employees/${r.id}`}>{r.full_name}</Link></td>
                <td>{r.target_hours_month ? fmtHours(r.target_hours_month) : "—"}</td>
                <td>{fmtHours(r.actual_hours_month)}</td>
                <td className={r.balance_hours < 0 ? "negative" : ""}>{fmtHours(r.balance_hours)}</td>
                <td>{r.vacation_used} d</td>
                <td>{r.vacation_remaining} d</td>
                <td>{r.sick_days_month}</td>
                <td>{r.sick_days_year}</td>
                <td>{r.last_activity ?? "—"}</td>
                <td>{r.offboarded_at ? <span className="status status-rejected">offboarded</span> : <span className="status status-approved">aktiv</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="muted">Noch keine Mitarbeiter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
