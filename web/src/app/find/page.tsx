import FindWizard from "@/components/FindWizard";
import { getMeta } from "@/lib/backend";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v.join(",") : (v ?? "")).split(",").filter(Boolean);

export const metadata = { title: "Find opportunities | Artist Atlas" };

export default async function Find({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const initial = { disciplines: list(q.d), types: list(q.t), places: list(q.p) };
  const meta = getMeta();
  return (
    <div className="wrap narrow">
      <FindWizard initial={initial} meta={meta} />
    </div>
  );
}
