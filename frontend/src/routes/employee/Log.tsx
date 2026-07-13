import EntriesLog from "../../components/EntriesLog";
import { useCurrentUser } from "../../auth/CurrentUser";

export default function Log() {
  const { user } = useCurrentUser();
  if (!user) return null;
  const canEditAll = user.role === "admin" || user.role === "employer";
  return (
    <div className="card p-4 sm:p-5">
      <h2 className="text-base font-black sm:text-lg">Alle Einträge</h2>
      <div className="mt-3">
        <EntriesLog employeeId={user.id} canEditAll={canEditAll} />
      </div>
    </div>
  );
}
