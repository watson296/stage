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

- 무대 모양을 템플릿 7종에서 고르고, 꼭짓점을 끌어 고칩니다. 변 중점을 끌면
  곡선(원호)이 됩니다.
- 장비 15종(드럼킷, 앰프, 스피커, 믹서 등)과 직접 추가한 커스텀 장비를
  미터 격자에 맞춰 배치합니다. 크기와 회전은 손잡이나 숫자로 조절합니다.
- 구역을 그립니다. 라이저·단차는 높이를, 객석·FOH·출입구·대기실 동선은
  무대 밖 자리를 표시합니다.
- 스태프 메모를 붙이고 장비와 연결선으로 잇습니다.
- 공연장 정보와 편성을 넣으면 PA 기본 세팅을 조언합니다. 메인·서브·모니터 수,
  딜레이 스피커 지연, 예상 음압, 입력 채널 리스트 초안, 전원 점검을 근거 공식과
  함께 보여 주고, 결과를 도면에 배치 초안으로 넣습니다.
- 하루 순서(타임테이블)를 만들고 공연 중에 시작·종료를 기록합니다. 한 순서가
  밀리면 뒤 순서의 예상 시각을 다시 계산하고, 목록과 가로 타임라인으로 봅니다.
- 같은 와이파이의 기기들이 호스트에 붙어 같은 내용을 봅니다. 인터넷은 필요
  없습니다. 역할별 접속 코드로 들어가고, 권한은 호스트가 확인합니다.
- 앱을 열면 **FOH · 운영팀 · 대기실** 중 자리를 고릅니다. 자리에 따라 보이는
  화면이 다릅니다.
- 공연 중에는 대시보드로 순서를 시작·종료하고, 대기실에는 공지를, 운영팀에는
  지시(몇 번 마이크, 무대 세팅 등)를 보냅니다. 대기실 화면은 공지를 단색 배경에
  큰 글씨로 띄웁니다.
- 배치를 JSON으로 저장하고 다시 불러옵니다. PNG와 PDF로 내보냅니다.

## 개발

필요한 것: Node.js 18 이상.

```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버 실행
npm run build        # 배포용 빌드
npm run build:single # 단일 HTML 파일로 빌드
npm test             # 테스트 실행
npm run typecheck    # 타입 검사
npm run host         # 호스트 서버 (빌드 뒤에 실행합니다)
```

호스트를 띄우면 터미널에 접속 주소와 역할별 링크가 뜨고, 호스트 기기의 브라우저로
안내 페이지(`http://localhost:7321/host`)가 열립니다. 이 페이지에서 **QR을 찍거나
링크를 복사해** 다른 기기에 주면 자리 고르기와 코드 입력 없이 바로 들어옵니다.
안내 페이지는 **호스트 기기에서만** 열립니다.

`stage.local:7321` 이름으로도 접속할 수 있습니다(`--name`으로 바꿉니다). 다만 `.local`
이름을 못 여는 기기와 멀티캐스트를 막는 공유기가 있어서 **IP 주소를 늘 함께** 보여
줍니다. 이름이 안 되면 IP로 들어가면 됩니다.

| 옵션 | 뜻 |
|---|---|
| `--port 7321` | 포트 |
| `--file plan.json` | 공연 파일을 열고 끝낼 때 저장 |
| `--address 192.168.0.5` | 네트워크가 여럿일 때 쓸 주소 |
| `--name stage` | 이름 접속에 쓸 이름 (`stage.local`) |
| `--no-open` | 뜰 때 안내 페이지를 열지 않음 |
| `--allow-public` | 사설 IP 제한을 풂 (쓸 일이 거의 없습니다) |

호스트는 같은 네트워크(사설 IP)에서 오는 연결만 받습니다. **접속 코드와 링크는
터미널과 안내 페이지에만 보여 주고**, 저장 파일이나 내보내기에는 넣지 않습니다.

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
