import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setToken, type Role } from "../api";
import { useCurrentUser } from "../auth/CurrentUser";

const NAV: Record<Role, { to: string; label: string }[]> = {
  employee: [
    { to: "/me", label: "Woche" },
    { to: "/me/month", label: "Monat" },
    { to: "/me/log", label: "Liste" },
    { to: "/me/year", label: "Jahr" },
    { to: "/me/absences", label: "Abwesenheiten" },
    { to: "/feedback", label: "Feedback" },
    { to: "/me/profile", label: "Profil" },
  ],
  employer: [
    { to: "/employer", label: "Team" },
    { to: "/employer/absences", label: "Anträge" },
    { to: "/feedback", label: "Feedback" },
    { to: "/me/profile", label: "Profil" },
  ],
  admin: [
    { to: "/admin", label: "Arbeitgeber" },
    { to: "/admin/invites", label: "Einladungen" },
    { to: "/admin/feedback", label: "Feedback" },
    { to: "/me/profile", label: "Profil" },
  ],
};

export default function Shell({ children }: { children: ReactNode }) {
  const { user, setUser } = useCurrentUser();
  const navigate = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Drawer schließt automatisch bei Routenwechsel und beim Verlassen des Mobile-Breakpoints
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 900) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Body-Scroll blockieren, solange Drawer offen ist
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  if (!user) return <>{children}</>;
  const items = NAV[user.role];
  const logout = () => { setToken(null); setUser(null); navigate("/login"); };

  return (
    <div className="app">
      <header>
        <Link to="/" className="brand" aria-label="Clok">
          <img src="/clok-icon.png" alt="" className="brand-icon" />
          <span className="brand-text">clok</span>
        </Link>
        <nav className="nav nav-inline">
          {items.map((it) => (
            <Link key={it.to} to={it.to} className={loc.pathname === it.to ? "active" : ""}>
              {it.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions header-actions-inline">
          <span>{user.full_name || user.username}</span>
          <button onClick={logout}>Logout</button>
        </div>
        <button className="burger" aria-label="Menü öffnen"
          aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <span /><span /><span />
        </button>
      </header>

      {menuOpen && (
        <div className="drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()}
               aria-label="Hauptnavigation">
            <div className="drawer-head">
              <span className="muted small">Angemeldet als</span>
              <strong>{user.full_name || user.username}</strong>
              <button className="drawer-close" aria-label="Schließen"
                onClick={() => setMenuOpen(false)}>×</button>
            </div>
            <div className="drawer-links">
              {items.map((it) => (
                <Link key={it.to} to={it.to}
                  className={loc.pathname === it.to ? "active" : ""}>
                  {it.label}
                </Link>
              ))}
            </div>
            <button className="drawer-logout danger" onClick={logout}>
              Logout
            </button>
          </nav>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}
