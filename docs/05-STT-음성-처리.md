# 05. STT 음성 처리 (RealtimeSTT 로컬 추론)

## 채택 결정

**[RealtimeSTT](https://github.com/KoljaB/RealtimeSTT)(Python, faster-whisper 기반)를 사용자 기기 로컬 사이드카 프로세스로 구동.**

선정 이유:
- 운영 비용 0원 — 오픈소스, 외부 API 호출 없음
- 음성이 기기 밖으로 나가지 않음 — 로컬 추론, 프라이버시 우위
- VAD·발화 분할·스트리밍 추론이 라이브러리에 내장 → 통합 부담이 작다
- faster-whisper 백엔드로 모델 크기(tiny/base/small …) 선택 폭이 넓다 → 디바이스 편차 대응 가능

> **모델 크기는 미확정.** 1주차 PoC에서 tiny / base / small을 비교 후 결정.

### 통합 방식 — Electron 사이드카 (옵션 2)

- Python(RealtimeSTT) 측은 **PyInstaller로 단일 실행파일로 번들** — 사용자에게 Python 사전 설치를 요구하지 않는다.
- Electron 메인 프로세스가 이 실행파일을 **`child_process`로 spawn**, **stdin/stdout NDJSON**으로 통신한다.
- 로컬 포트를 열지 않으므로 포트 충돌·외부 노출이 없다.
- Python 프로세스가 종료되면 Electron이 재spawn (지수 백오프).

### 검토 후 탈락한 대안

| 대안 | 탈락 이유 |
| --- | --- |
| Web Speech API | 음성이 Google 서버로 전송됨(프라이버시), 약 60초 강제 종료로 끊김 방어 복잡 |
| Moonshine `moonshine-tiny-ko` (ONNX) | 한국어 단일언어 경량 모델로 후보였으나, VAD·스트리밍·끊김 방어를 자체 구현해야 함. RealtimeSTT가 동일 영역을 라이브러리로 제공해 통합 비용에서 밀림 |
| WhisperX, Naver Clova, Deepgram | 비용 |
| Whisper.js 로컬 (브라우저) | transformers.js 추론이 저사양 기기에서 지연이 커 공정성 우려 |
| Soniox, AssemblyAI | 한국어 미지원 또는 비용 |

> 디바이스 편차는 RealtimeSTT에도 존재하나, faster-whisper의 모델 크기 선택과 GPU/CPU 자동 폴백으로 폭을 좁힐 수 있다. 저사양 기기 실시간 성능은 PoC 검증 항목으로 둔다.

## 처리 파이프라인

```
Electron 렌더러
  getUserMedia 오디오 캡처 → 메인 프로세스로 전달

Electron 메인 프로세스
  ↕ stdio (NDJSON)
RealtimeSTT 사이드카 (PyInstaller 번들)
  내부: VAD 발화 구간 검출 → faster-whisper 추론 → 텍스트

Electron 메인 프로세스
  → 발화 단위 텍스트를 서버에 WebSocket 전송 (utterance:new)
```

- VAD·발화 단위 분할·스트리밍 추론은 RealtimeSTT 내부에서 수행.
- 추론은 발화 종료 시점에 해당 구간만 대상 → 디바운스 불필요.
- 화면 미리보기(interim)가 필요하면 RealtimeSTT의 partial transcript 콜백을 활용.

## 발화 메타데이터

각 utterance에 다음을 부여해 서버로 전송:
- `utterance_id`, `text`, `char_count`
- `started_at_offset_ms`, `ended_at_offset_ms` (서버 T0 기준 상대 시각)
- `confidence` — faster-whisper 세그먼트 평균 logprob 등으로 도출 (산출식 PoC에서 확정, [09](09-미결정-사항.md))

## 마이크 공유 호환성

각자 본인 마이크로 본인 발화만 캡처하므로 다른 회의 도구와 마이크를 동시에 사용해야 함:
- **macOS**: 항상 공유 모드 — 문제 없음
- **Windows**: 기본 공유 모드, "독점 제어 허용" 옵션 존재 → 독점 모드 시 사용자 안내로 처리
- **Discord/Zoom/Teams**: 모두 공유 모드 — 본 앱과 마이크 동시 사용 가능

## 노이즈·에코 대응

각자 본인 마이크로 본인 발화만 캡처하므로, 스피커로 출력된 **타인의 음성이 본인 마이크에 유입되면 글자수가 왜곡**되어 기여도 공정성을 해친다.

- **헤드폰·이어폰 사용 권장** — 스피커 출력이 마이크로 되돌아오는 것을 원천 차단. 회의 시작 전 안내.
- **에코 캔슬링·노이즈 억제** — `getUserMedia` 제약에 `echoCancellation`, `noiseSuppression`을 기본 활성화.
- 헤드폰 미사용·고소음 환경은 캡처 품질 저하로 이어지므로 인식 신뢰도 라벨([06](06-기여도-산정.md))에 반영될 수 있다.

## 끊김 다층 방어

로컬 추론 방식이므로 외부 STT 세션 종료(예: Web Speech API 60초 끊김)는 없다. 끊김의 원인은 **오디오 캡처 중단**, **사이드카 프로세스 다운**, **추론 지연·실패**로 나뉜다.

### 캡처 측 방어 (오디오 입력)

| 레이어 | 메커니즘 |
| --- | --- |
| 1 | `MediaStreamTrack`의 `ended`/`mute` 이벤트 감지 → `getUserMedia` 재획득 |
| 2 | `navigator.mediaDevices.ondevicechange` 감지 → 마이크 분리·전환 시 스트림 재연결 |
| 3 | 마이크 권한 회수·앱 절전/백그라운드 전환 시 캡처 상태 추적, 복귀 시 자동 재개 |

### 사이드카·추론 측 방어 (RealtimeSTT)

| 레이어 | 메커니즘 |
| --- | --- |
| 4 | 사이드카 프로세스 종료 감지 시 Electron이 자동 재spawn (지수 백오프, 최대 재시도 횟수 한도) |
| 5 | 발화 구간을 추론 큐에 적재 — 저사양 기기에서 추론이 밀려도 발화를 잃지 않음 |
| 6 | 큐 적체 모니터링 → 일정 길이 초과 시 사용자에게 "처리 지연" 경고 |
| 7 | 추론 예외 시 해당 구간 재시도, 최종 실패 시 손실 구간으로 분류 |
| 8 | VAD 안전장치 — 최대 발화 길이 상한 도달 시 강제 분할(무한 누적 방지), 과분할 병합 |

### 손실 처리

- 캡처·추론 실패로 누락된 구간은 `AnomalyEvent`로 기록한다.
- 누락 비율은 [06. 기여도 산정](06-기여도-산정.md)의 신뢰도 라벨(오디오 캡처 손실 5% 미만 = High 조건)에 반영된다.
- 모델 로딩은 사이드카 시작 시 1회 수행하므로 회의 중 추론은 로딩 지연 영향을 받지 않는다.

## 1주차 PoC 검증 항목

| 항목 | 검증 내용 |
| --- | --- |
| faster-whisper 모델 크기 선정 | tiny vs base vs small 한국어 정확도·지연 비교 → 최종 채택 1종 결정 |
| 실시간 추론 성능 | 저사양 노트북에서 발화-텍스트 지연·누락 (공정성 직결) |
| VAD 분할 정확도 | RealtimeSTT 내장 VAD의 시작·종료 판정, 과분할/누락 빈도 |
| 사이드카 통신 안정성 | `child_process` stdio NDJSON, 대용량 출력 backpressure, 비정상 종료 시 재spawn |
| PyInstaller 번들 | Windows / macOS 양쪽에서 단일 실행파일 빌드·구동 검증, 코드 서명 영향 |
| Electron + Discord | Windows / macOS 양쪽 마이크 동시 사용 |
| Electron + Zoom | Windows / macOS 양쪽 |
| 시각 동기화 | T0 broadcast 100ms 이내 정확도 |
| Windows 독점 모드 | 발생 시나리오·대응 안내 확인 |
| 마이크 환경 | USB / 내장 / Bluetooth 헤드셋 |
