import Image from "next/image";
import Link from "next/link";
import AuthButtons from "./AuthButtons";

/** Every logo option. In production only the wordmark renders; in dev all render and the Versions panel shows one (see globals.css). */
const LOGOS = [
  { id: "full", src: "/brand/logo-full.png", w: 66, h: 96 },
  { id: "wordmark", src: "/brand/logo-wordmark.png", w: 73, h: 40 },
  { id: "icon-nyc", src: "/brand/logo-icon-nyc.png", w: 48, h: 62 },
  { id: "icon", src: "/brand/logo-icon.png", w: 54, h: 61 },
];

export default function Header({ all = false }: { all?: boolean }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="logo-slot" aria-label="Artist Atlas home">
          {LOGOS.filter((l) => all || l.id === "wordmark").map((l) => (
            <Image key={l.id} className={`lg lg-${l.id}`} src={l.src} alt="" width={l.w} height={l.h} priority />
          ))}
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/find">Find opportunities</Link>
          {process.env.NODE_ENV !== "production" && <Link href="/dev">Dev tools</Link>}
        </nav>
        <AuthButtons />
      </div>
    </header>
  );
}
