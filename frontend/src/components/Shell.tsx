import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setToken, type Role } from "../api";
import { useCurrentUser } from "../auth/CurrentUser";

const NAV: Record<Role, { to: string; label: string }[]> = {
  employee: [
    { to: "/me", label: "Woche" },
    { to: "/me/month", label: "Monat" },
    { to: "/me/absences", label: "Abwesenheiten" },
    { to: "/me/profile", label: "Profil" },
  ],
  employer: [
    { to: "/employer", label: "Team" },
    { to: "/employer/absences", label: "Anträge" },
    { to: "/me/profile", label: "Profil" },
  ],
  admin: [
    { to: "/admin", label: "Alle Mitarbeiter" },
    { to: "/admin/employers", label: "Arbeitgeber" },
    { to: "/me/profile", label: "Profil" },
  ],
};

export default function Shell({ children }: { children: ReactNode }) {
  const { user, setUser } = useCurrentUser();
  const navigate = useNavigate();
  const loc = useLocation();
  if (!user) return <>{children}</>;
  const items = NAV[user.role];
  return (
    <div className="app">
      <header>
        <h1>Clok</h1>
        <nav className="nav">
          {items.map((it) => (
            <Link key={it.to} to={it.to} className={loc.pathname === it.to ? "active" : ""}>
              {it.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <span>{user.full_name || user.username}</span>
          <button onClick={() => { setToken(null); setUser(null); navigate("/login"); }}>
            Logout
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
