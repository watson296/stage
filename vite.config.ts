import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// `--mode single` 로 빌드하면 자기완결형 HTML 파일 하나로 뽑습니다.
// 그 외에는 일반적인 dist/ 번들(로고는 별도 파일)을 만듭니다.
//  - 일반 빌드: assetsInlineLimit 0 → 로고를 base64로 인라인하지 않고 파일로 둔다.
//  - 단일 파일 빌드: 로고(약 80KB)만 인라인해 파일 하나로 완결시킨다. 과거의
//    9.5MB 같은 큰 인라인 자산은 아예 두지 않으므로 용량 문제는 없다.
export default defineConfig(({ mode }) => ({
  base: "./",
  build: {
    target: "es2020",
    assetsInlineLimit: mode === "single" ? 262144 : 0,
    rollupOptions: {},
  },
  plugins: mode === "single" ? [viteSingleFile()] : [],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
