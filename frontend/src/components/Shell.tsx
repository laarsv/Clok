import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setToken, type Role } from "../api";
import { useCurrentUser } from "../auth/CurrentUser";
import { IconMenu, IconX } from "./ui/Icons";

const NAV: Record<Role, { to: string; label: string }[]> = {
  employee: [
    { to: "/zeit", label: "Zeiterfassung" },
    { to: "/me/absences", label: "Abwesenheiten" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/feedback", label: "Feedback" },
    { to: "/me/profile", label: "Profil" },
  ],
  employer: [
    { to: "/employer", label: "Team" },
    { to: "/employer/absences", label: "Anträge" },
    { to: "/employer/calendar", label: "Kalender" },
    { to: "/employer/projects", label: "Projekte" },
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

          <div className="hidden items-center gap-3 md:flex">
            <span className="max-w-[14rem] truncate text-sm text-ink/70">
              {user.full_name || user.username}
            </span>
            <button onClick={logout} className="btn-outline btn-sm">Logout</button>
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
