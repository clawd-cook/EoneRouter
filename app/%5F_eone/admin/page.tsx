import { AdminPanel } from "./admin-panel";
import { listPackages } from "@/lib/eone/packages";
import { getStorageRoot } from "@/lib/eone/storage-root";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const packages = listPackages(getStorageRoot());
  return <AdminPanel packages={packages} />;
}
