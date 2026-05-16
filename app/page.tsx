import { getProperties } from "@/lib/store";
import { DealDashboard } from "./deal-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const properties = await getProperties();
  return <DealDashboard initialProperties={properties} />;
}
