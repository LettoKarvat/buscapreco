import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.faives.scannerprodutos",
  appName: "ScannerRedeCusto",
  webDir: "dist",
  bundledWebRuntime: false, // (mantém o padrão)
  server: {
    androidScheme: "http", // <-- ponto-chave
  },
};

export default config;
