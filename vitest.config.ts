import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html"],
      exclude: [
        "node_modules/**",
        "tests/**",
        ".next/**",
        "prisma/**",
        "scripts/**",
        "src/components/ui/**",
      ],
      thresholds: {
        // Backend services + lib — maintain high coverage
        "src/lib/services/**": {
          statements: 90,
          branches: 70,
          functions: 85,
        },
        "src/lib/*.ts": {
          statements: 80,
          branches: 70,
          functions: 70,
        },
        // API routes
        "src/app/api/**": {
          statements: 70,
          branches: 60,
          functions: 70,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
