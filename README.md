<p align="center">
  <br>
  <img src="assets/brand/saegyeol-logo-vertical.png" alt="새결 SAEGYEOL" width="320">
  <br><br>
</p>

# Stage Planner

밴드·공연 무대를 위에서 본 평면도로 구상하는 도구입니다. 장비를 끌어다
놓고, 스태프 포스트잇을 붙이고, 배치를 JSON이나 이미지로 내보냅니다.
태블릿과 터치 화면에서 쓰도록 만들고, 인터넷 없이도 동작합니다.

> Think Better Act Smarter

## 무엇을 하나요

- 무대 크기를 미터로 정하고, 격자에 맞춰 장비를 배치합니다.
- 장비 11종(드럼킷, 앰프, 스피커, 믹서 등)과 직접 추가한 커스텀 장비를 놓습니다.
- 스태프 포스트잇을 붙이고 장비와 연결선으로 잇습니다.
- 배치를 JSON으로 저장하고 다시 불러옵니다. PNG로 내보냅니다.

## 개발

필요한 것: Node.js 18 이상.

```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버 실행
npm run build        # 배포용 빌드
npm run build:single # 단일 HTML 파일로 빌드
npm test             # 테스트 실행
npm run typecheck    # 타입 검사
```

### 저장소 구조

```
packages/
├── app/      브라우저 앱 (Vite + Preact)
├── server/   호스트 서버 (5단계에서 구현)
└── shared/   데이터 스키마, 계산 함수, 메시지 타입
```

스택은 Vite + TypeScript + Preact이고 테스트는 vitest입니다. 좌표는 모두
미터 단위의 월드 좌표이며, 입력은 Pointer Events로 마우스·터치·펜을 함께
처리합니다.

자세한 명세는 [docs/SPEC.md](docs/SPEC.md), 앞으로의 계획은
[docs/ROADMAP.md](docs/ROADMAP.md)를 보세요.

## 라이선스

소스 코드는 [Apache License 2.0](LICENSE)입니다.

새결 로고와 "새결 / SAEGYEOL" 이름은 상표이며 코드 라이선스에 포함되지
않습니다. 포크할 때는 [`assets/brand/`](assets/brand/)의 로고를 본인 또는
본인 조직의 로고로 교체해야 합니다. 자세한 조건은 [NOTICE](NOTICE)를 보세요.

---

## English

**Stage Planner** is a touch-first, offline-capable tool for laying out band
and performance stages as a top-down plan. You place equipment on a metric grid,
pin staff notes, connect them to gear, and export the layout as JSON or PNG. The
source code is licensed under Apache-2.0; the Saegyeol logo and name are
trademarks and are **not** covered by that license — forks must replace the
brand assets in [`assets/brand/`](assets/brand/) with their own (see
[NOTICE](NOTICE)). Built and maintained by Team Saegyeol.
