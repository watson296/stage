# 참고 자료

구현에 참고하는 옛 자료를 둡니다. **현재 코드와 맞지 않을 수 있습니다.**

## blocks.patch

지금은 삭제된 `template.html`(순수 HTML·Canvas 프로토타입)을 대상으로 만든 diff입니다.
**이 저장소에 그대로 적용할 수 없습니다.** 다음 두 가지를 참고하려고 남겨 둡니다.

- 장비 규격(`OT.variants`) — [SPEC 6.2](../SPEC.md)에 이미 옮겨 적었습니다.
- 장비를 위에서 본 모양을 그리는 `SHAPES` 함수 — 2단계에서 SVG 라이브러리를
  만들 때 출발점으로 씁니다.

그림 키(`draw`)는 `drums`, `amp`, `keys`, `mic`, `speaker`, `wedge`, `sub`,
`mixer`, `riser`, `cable`, `custom` 입니다.
