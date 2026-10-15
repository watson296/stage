import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

// `--mode single` 로 빌드하면 자기완결형 HTML 파일 하나로 뽑습니다.
// 그 외에는 일반적인 dist/ 번들(로고는 별도 파일)을 만듭니다.
//  - 일반 빌드: assetsInlineLimit 0 → 로고를 base64로 인라인하지 않고 파일로 둔다.
//  - 단일 파일 빌드: 로고(약 80KB)만 인라인해 파일 하나로 완결시킨다.
// 브랜드 자산은 저장소 루트의 assets/brand/에 있어 패키지 바깥을 읽어야 하므로
// server.fs.allow로 상위 폴더를 열어 둡니다.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => ({
  base: "./",
  resolve: {
    alias: {
      "@stage-planner/shared": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  // Preact JSX를 esbuild로 변환합니다(별도 babel 프리셋 없이).
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  build: {
    target: "es2020",
    assetsInlineLimit: mode === "single" ? 262144 : 0,
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: mode === "single" ? [viteSingleFile()] : [],
}));
