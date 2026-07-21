import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: process.env.PORT
    ? { port: Number(process.env.PORT), strictPort: true }
    : {},
  test: {
    environment: "jsdom",
  },
});
