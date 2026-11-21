import { useState } from "react";
import { RotateCw } from "lucide-react";

// Karta 5:7, která se po kliknutí plynule otočí z líce na rub.
// Použití: <FlipCard front={urlLíce} back={urlRubu} alt="Jméno karty" />
export default function FlipCard({ front, back, alt = "Karta" }) {
  const [flipped, setFlipped] = useState(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const face = {
    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
    objectFit: "contain", background: "#12141C", borderRadius: 12,
    border: "1px solid #2A2E3D", boxSizing: "border-box", display: "block",
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
  };

  return (
    <div style={{ width: "100%" }}>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Zobrazit líc karty" : "Zobrazit rub karty"}
        style={{ display: "block", width: "100%", aspectRatio: "5 / 7", padding: 0, border: 0, background: "transparent", cursor: "pointer", perspective: 1600 }}
      >
        <div
          style={{
            position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
            transition: reduceMotion ? "none" : "transform 0.8s cubic-bezier(0.2, 0.7, 0.2, 1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          <img src={front} alt={`${alt} – líc`} aria-hidden={flipped} style={face} />
          <img src={back} alt={`${alt} – rub`} aria-hidden={!flipped} style={{ ...face, transform: "rotateY(180deg)" }} />
        </div>
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8B92A6" }}>{flipped ? "RUB" : "LÍC"}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#C9A227" }}>
          <RotateCw size={13} aria-hidden="true" /> Klikni pro otočení
        </span>
      </div>
    </div>
  );
}
