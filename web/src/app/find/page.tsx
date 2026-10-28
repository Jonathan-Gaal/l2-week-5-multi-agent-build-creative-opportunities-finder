import BackendFailure from "@/components/BackendFailure";
import FindWizard from "@/components/FindWizard";
import { asBackendError, getMeta } from "@/lib/backend";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v.join(",") : (v ?? "")).split(",").filter(Boolean);

export const metadata = { title: "Find opportunities | Artist Atlas" };

export default async function Find({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const initial = { disciplines: list(q.d), types: list(q.t), places: list(q.p) };
  // The picker lists come from the results service (after searchParams, so this runs per request, not at build).
  let meta;
  try {
    meta = await getMeta();
  } catch (e) {
    const retry = `/find?${new URLSearchParams({ d: initial.disciplines.join(","), t: initial.types.join(","), p: initial.places.join(",") })}`;
    return (
      <div className="wrap narrow">
        <BackendFailure title="We couldn't load the choices" failure={asBackendError(e)} retryHref={retry} />
      </div>
    );
  }
  return (
    <div className="wrap narrow">
      <FindWizard initial={initial} meta={meta} />
    </div>
  );
}
