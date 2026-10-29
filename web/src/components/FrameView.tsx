import type { Frame } from "@/lib/types";

/** One step of a run: what the pipeline did and what it decided. */
export default function FrameView({ frame }: { frame: Frame }) {
  switch (frame.kind) {
    case "request":
    case "call":
    case "filter":
      return (
        <div className={`frame k-${frame.kind}`}>
          <h4>{frame.title}</h4>
          <ul>{frame.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      );
    case "candidates":
      return (
        <div className="frame k-candidates">
          <h4>{frame.title}</h4>
          <ol>
            {frame.items.map((c) => (
              <li key={c.id}>
                <span className="id">{c.id}</span> {c.title}
                {c.org ? ` · ${c.org}` : ""}
                {c.deadline ? ` · ${c.deadline}` : " · no deadline"}
                {c.unverified && <span className="flag"> · not rechecked</span>}
                {c.injected && <span className="flag"> · injected test listing</span>}
              </li>
            ))}
          </ol>
        </div>
      );
    case "ranker":
      return (
        <div className="frame k-ranker">
          <h4>{frame.title}</h4>
          {frame.note && <p className="flag">{frame.note}</p>}
          <ol>
            {frame.items.map((r) => (
              <li key={r.id}>
                <span className="id">{r.id}</span> {r.title ?? ""}
                {r.unverified && <span className="flag"> · not rechecked</span>}
                <br />
                <em>{r.reason}</em>
              </li>
            ))}
          </ol>
        </div>
      );
    case "checks":
      return (
        <div className="frame k-checks">
          <h4>
            {frame.title} <span className={`verdict ${frame.problems.length ? "reject" : "accept"}`}>{frame.problems.length ? "failed" : "passed"}</span>
          </h4>
          {frame.problems.length > 0 && <ul>{frame.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      );
    case "reviewer":
      return (
        <div className={`frame k-reviewer ${frame.verdict === "not run" ? "" : frame.verdict}`}>
          <h4>
            {frame.title} <span className={`verdict ${frame.verdict === "not run" ? "not-run" : frame.verdict}`}>{frame.verdict}</span>
          </h4>
          <p className="quote">{frame.critique}</p>
        </div>
      );
    case "result":
      return (
        <div className="frame k-result">
          <h4>
            {frame.title} <span className="verdict accept">{frame.tier === 3 ? "empty" : `tier ${frame.tier}`}</span>
          </h4>
          <ul>{frame.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      );
  }
}
