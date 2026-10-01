# ow-tactics (가칭)

오버워치의 운영 판단(턴, 스킬 사용, 자리 선점)을 **상황 문제로 풀면서 배우는** 웹 학습 게임. 지금은 개발 중이다.

- 플레이: https://turtlegg430.github.io/ow-tactics/ (준비 중)
- 이름은 아직 정하지 않았다. `ow-tactics`는 가칭이다.

## 어떻게 배우나
1. 실제 경기 한 순간의 1인칭 화면을 본다.
2. 같은 순간을 비스듬히 내려다본 전술 보드에서 상황을 읽는다.
3. 판단을 하나 고른다.
4. 그 선택의 결말을 재생하고, 되감아서 다른 선택과 비교하고, 판단 뒤의 원리 해설을 본다.

## 폴더
| 폴더·파일 | 내용 |
|---|---|
| `docs/` | 기획 문서: 비전·로드맵, 역할·도구, 디자인 규칙, 문제 설계, 결정 로그, 용어 사전 |
| `reference/` | P1 시각 시안 (기준 시안 5차). 배포되지 않는다 |
| `src/` | 게임 코드 (Vite + TypeScript + React, 보드는 SVG) |
| `scripts/` | 개발용 스크립트. `import-scan.ts`는 워크숍 스캔 CSV를 지형 데이터로 바꾼다 (`npm run import-scan -- "<스캔 폴더>"`) |
| `tools/` | 게임 밖에서 쓰는 도구. `tools/workshop/`은 오버워치 워크숍 맵 스캐너 코드와 사용법 |
| `CLAUDE.md` | 이 저장소에서 일하는 Claude Code를 위한 안내 |

## 개발
Node.js(LTS)가 필요하다.

```
npm install      # 처음 한 번: 필요한 패키지 설치
npm run dev      # 로컬 미리보기 (개발 서버)
npm run build    # 배포용 빌드 (결과물은 dist/)
```

`main` 브랜치에 푸시하면 GitHub Actions가 빌드해서 GitHub Pages에 배포한다.

## 알림
팬이 만든 비공식 학습 도구이며 Blizzard Entertainment와 관련이 없다. Overwatch는 Blizzard Entertainment, Inc.의 상표다. 시안과 게임 화면의 그림은 대체 그림을 쓴다.

맵 검수에 StatBanana(https://statbanana.com/)의 오버헤드 지도를 참고했다.
