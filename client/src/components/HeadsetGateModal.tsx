import Modal from "@/components/Modal";

interface HeadsetGateModalProps {
  /** 확인 버튼 클릭 — 회의 시작/입장 진행 */
  onConfirm: () => void;
  /** 닫기(X·배경 클릭) — 입장하지 않고 취소 */
  onClose: () => void;
  /** 확인 버튼 라벨 — 시작/입장 맥락에 맞게 */
  confirmLabel?: string;
}

// 회의 입장 전 헤드셋 권장 안내.
// 보조(회의) 창은 별도 창으로 열려 #toast 가 가려지므로, 창을 열기 전
// 메인 창에서 모달로 안내한다. 확인 시 호출측이 입장을 진행한다.
export default function HeadsetGateModal({
  onConfirm,
  onClose,
  confirmLabel = "확인하고 시작",
}: HeadsetGateModalProps) {
  return (
    <Modal
      title="회의 입장 전 안내"
      onClose={onClose}
      actions={
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      }
    >
      <div className="headset-notice">
        <div className="headset-visual">
          <i className="ti ti-headphones" />
        </div>
        <div className="headset-title">헤드셋 사용을 권장드려요</div>
        <p className="headset-desc">
          스피커를 사용하면 상대방 목소리가 마이크로 되돌아가 발언 인식이
          부정확해질 수 있어요. 원활한 회의를 위해{" "}
          <strong>이어폰·헤드셋 착용</strong>을 권장합니다.
        </p>
      </div>
    </Modal>
  );
}
