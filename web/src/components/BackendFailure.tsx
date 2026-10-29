import Link from "next/link";
import type { BackendError } from "@/lib/backend";

/** The results API failed or isn't set up: what happened, how to retry, and (in development) how to set it up. */
export default function BackendFailure({ title, failure, retryHref }: { title: string; failure: BackendError; retryHref: string }) {
  return (
    <div className="empty stack" role="alert" style={{ marginTop: 24 }}>
      <h2>{title}</h2>
      <p>{failure.message}</p>
      {failure.code === "unreachable" && process.env.NODE_ENV !== "production" && (
        <p className="hint">Dev: run <code>npm run dev:local</code> in <code>web/</code> (JSON snapshot, no database), or fill in <code>web/.env</code>. The server log names the missing setting.</p>
      )}
      <Link className="btn" href={retryHref}>Try again</Link>
    </div>
  );
}
