import FindWizard from "@/components/FindWizard";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v.join(",") : (v ?? "")).split(",").filter(Boolean);

export const metadata = { title: "Find opportunities | Artist Atlas" };

export default async function Find({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  return (
    <div className="wrap narrow">
      <FindWizard initial={{ disciplines: list(q.d), types: list(q.t), places: list(q.p) }} />
    </div>
  );
}
