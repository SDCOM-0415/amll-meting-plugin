import { defineConfig, type Plugin } from "vite";
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const METADATA = `// @id amll-meting-plugin
// @version 1.0.3
// @icon https://meting.sdcom.top/favicon.ico
// @name:zh-CN Meting 音乐插件
// @name:en-US Meting Music Plugin
// @description:zh-CN 通过 Meting API 接入网易云/QQ音乐/酷狗/Bilibili 等多平台音乐
// @description:en-US Connect to NetEase/Tencent/Kugou/Bilibili music via Meting API
`;

function prependMetadataPlugin(): Plugin {
  return {
    name: "prepend-metadata",
    closeBundle() {
      const outFile = resolve(__dirname, "dist/amll-meting-plugin.js");
      const original = readFileSync(outFile, "utf-8");
      if (!original.startsWith("// @id")) {
        writeFileSync(outFile, METADATA + original, "utf-8");
      }
    },
  };
}

export default defineConfig({
  plugins: [prependMetadataPlugin()],
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["iife"],
      name: "AMLLMetingPlugin",
      fileName: () => "amll-meting-plugin.js",
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM"
        },
      },
    },
    minify: false,
    target: "es2020",
  },
});
