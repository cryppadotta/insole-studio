import React, { Suspense, lazy, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./styles.css";
import InsoleApp from "./insole/App";
const PrusaGuide = lazy(() => import("./insole/PrusaGuide"));

function Studio() {
  const [guideOpen, setGuideOpen] = useState(() =>
    window.location.hash.startsWith("#/prusa"),
  );
  useEffect(() => {
    const navigate = () => {
      setGuideOpen(window.location.hash.startsWith("#/prusa"));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    document.title = guideOpen
      ? "PrusaSlicer guide · Insole Studio"
      : "Insole Studio — Parametric Insole CAD";
  }, [guideOpen]);
  return (
    <>
      {/* Keep the design, history and WebGL scene when visiting the guide. */}
      <div hidden={guideOpen}>
        <InsoleApp />
      </div>
      {guideOpen && (
        <Suspense
          fallback={<p style={{ padding: 32 }}>Opening the print guide…</p>}
        >
          <PrusaGuide />
        </Suspense>
      )}
    </>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Studio />
  </React.StrictMode>,
);
