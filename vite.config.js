import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Čas sestavení se zobrazí v patičce, aby bylo vidět, která verze appky opravdu běží.
const buildDate = new Date().toLocaleString("cs-CZ", {
  timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_DATE__: JSON.stringify(buildDate) },
});
