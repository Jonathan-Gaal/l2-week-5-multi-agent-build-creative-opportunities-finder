import Header from "./Header";
import HeaderOriginal from "./HeaderOriginal";
import DesignVersions from "./DesignVersions";

/** In dev both top bars are on the page and the Versions panel picks one (see globals.css). In production only the real one shows. */
export default function HeaderVersions() {
  if (process.env.NODE_ENV === "production") return <Header />;
  return (
    <>
      <div className="hdr-logos"><Header all /></div>
      <div className="hdr-original"><HeaderOriginal /></div>
      <div className="hdr-original2"><HeaderOriginal icon="/brand/logo-icon-nyc.png" textSize={22} /></div>
      <DesignVersions />
    </>
  );
}
