import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { render } from "preact";
import { App } from "./ui/App";

const root = document.getElementById("app");
if (root) render(<App />, root);

// 개발 빌드에서만 상태를 노출합니다. 브라우저 자동 검증이 이 창구로 상태를
// 읽고 월드 좌표를 화면 좌표로 바꿉니다. 배포 빌드에는 들어가지 않습니다.
if (import.meta.env.DEV) {
  void import("./state/appState").then((S) => {
    (window as unknown as Record<string, unknown>).__S = S;
  });
}
