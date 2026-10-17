import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "d3b0ff95493c448c5f94b9be4da14469",
  worker: defineWorker({
    name: "azalas-sport-full",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-06",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      AZALAS_IMAGES: bindings.r2({ name: "azalas-images" }),

      // Supabase
      // Các giá trị thật KHÔNG được ghi trực tiếp vào file này.
      // Khi deploy, Cloudflare sẽ nhận chúng từ secrets.
      NEXT_PUBLIC_SUPABASE_URL: bindings.secret(),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: bindings.secret(),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
    },
  }),
});