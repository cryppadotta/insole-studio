import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/insole-studio/",
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"] },
});
