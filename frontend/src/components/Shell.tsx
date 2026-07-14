import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setToken, type Role, type User } from "../api";
import { useCurrentUser } from "../auth/CurrentUser";
import { IconMenu, IconX } from "./ui/Icons";

const NAV: Record<Role, { to: string; label: string }[]> = {
  employee: [
    { to: "/zeit", label: "Zeiterfassung" },
    { to: "/me/absences", label: "Abwesenheiten" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/feedback", label: "Feedback" },
  ],
  employer: [
    { to: "/employer", label: "Team" },
    { to: "/employer/absences", label: "Anträge" },
    { to: "/employer/calendar", label: "Kalender" },
    { to: "/employer/projects", label: "Projekte" },
    { to: "/feedback", label: "Feedback" },
  ],
  admin: [
    { to: "/admin", label: "Arbeitgeber" },
    { to: "/admin/invites", label: "Einladungen" },
    { to: "/admin/feedback", label: "Feedback" },
  ],
};

function initials(user: User): string {
  const name = (user.full_name || user.username || user.email || "?").trim();
  const parts = name.split(/[\s.@_-]+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return chars.toUpperCase();
}

/** Runde Profil-Bubble oben rechts (Desktop): Initialen → Dropdown mit
 *  Name/E-Mail, Profil-Link und Abmelden. Schließt bei Klick außerhalb. */
function ProfilBubble({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profil-Menü"
        title={user.full_name || user.username}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-royal text-sm font-black text-paper outline-none transition hover:opacity-90 focus:ring-2 focus:ring-royal/40"
      >
        {initials(user)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-ink/10 bg-paper py-1 shadow-lg">
          <div className="border-b border-ink/10 px-4 py-2">
            <div className="truncate text-sm font-bold">{user.full_name || user.username}</div>
            {user.email && <div className="truncate text-xs text-ink/50">{user.email}</div>}
          </div>
          <Link
            to="/me/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm font-medium text-ink hover:bg-royal/10"
          >
            Profil
          </Link>
          <button
            onClick={onLogout}
            className="w-full border-t border-ink/10 px-4 py-2 text-left text-sm font-medium text-ink hover:bg-royal/10"
          >
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { user, setUser } = useCurrentUser();
  const navigate = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  if (!user) return <>{children}</>;
  const items = NAV[user.role];
  const logout = () => { setToken(null); setUser(null); navigate("/login"); };
  const isActive = (to: string) =>
    loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to + "/"));

  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2" aria-label="Clok">
            <img src="/clok-icon.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-xl font-black tracking-tight text-royal">Clok</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {items.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                className={`rounded-md px-3 py-1.5 text-sm font-bold transition ${
                  isActive(it.to) ? "text-royal" : "text-ink/60 hover:text-ink"
                }`}
              >
                {it.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center md:flex">
            <ProfilBubble user={user} onLogout={logout} />
          </div>

          <button
            className="btn-ghost -mr-2 p-2 md:hidden"
            aria-label="Menü öffnen"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <IconMenu size={24} />
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
            aria-label="Menü schließen"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-[85%] max-w-xs flex-col bg-paper shadow-xl">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs text-ink/60">Angemeldet als</div>
                <div className="truncate font-bold">{user.full_name || user.username}</div>
              </div>
              <button className="btn-ghost p-2" aria-label="Schließen" onClick={() => setMenuOpen(false)}>
                <IconX size={22} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              {items.map((it) => (
                <Link
                  key={it.to}
                  to={it.to}
                  className={`block px-4 py-3 text-sm font-bold transition ${
                    isActive(it.to) ? "bg-royal/10 text-royal" : "text-ink hover:bg-ink/5"
                  }`}
                >
                  {it.label}
                </Link>
              ))}
              <Link
                to="/me/profile"
                className={`block px-4 py-3 text-sm font-bold transition ${
                  isActive("/me/profile") ? "bg-royal/10 text-royal" : "text-ink hover:bg-ink/5"
                }`}
              >
                Profil
              </Link>
            </nav>
            <div className="border-t border-ink/10 p-3">
              <button onClick={logout} className="btn-danger w-full">Logout</button>
            </div>
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
