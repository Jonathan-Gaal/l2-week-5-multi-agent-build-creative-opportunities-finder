import { notFound } from "next/navigation";
import DevTools from "@/components/DevTools";
import { getMeta } from "@/lib/backend";

export const metadata = { title: "Dev tools | Artist Atlas" };

/** Developer-only: hidden in production builds. */
export default async function Dev() {
  if (process.env.NODE_ENV === "production") notFound();
  const meta = getMeta();
  return <DevTools meta={meta} />;
}
