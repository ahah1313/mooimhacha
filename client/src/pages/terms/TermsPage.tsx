import { Link } from "react-router-dom";
import "@/styles/live.css";

// 약관·개인정보 처리방침 (운영 P0). 음성 원본 미저장·텍스트만 처리 원칙 명시.
export default function TermsPage() {
  return (
    <div className="live">
      <h1>이용약관 · 개인정보 처리방침</h1>
      <p className="live-sub">무임하차 — 팀플 협업 보조 서비스</p>

      <div className="live-card">
        <h2>1. 수집하는 정보</h2>
        <ul>
          <li>카카오 로그인 계정 정보(닉네임·이메일·프로필 이미지)</li>
          <li>대학교·학과(선택, 통계 목적)</li>
          <li>회의 중 발화의 <strong>텍스트</strong>와 메타데이터</li>
        </ul>
      </div>

      <div className="live-card">
        <h2>2. 음성 데이터 처리 원칙</h2>
        <ul>
          <li>
            <strong>무임하차 서버는 음성 원본을 저장하지 않습니다.</strong> 우리
            서버에는 변환된 텍스트만 전송·저장돼요.
          </li>
          <li>
            다만 MVP는 브라우저 내장 Web Speech API를 사용하므로, 음성 인식
            과정에서 음성이 브라우저 외부(Google) 서버로 전송됩니다. 이 부분은
            브라우저 기능이라 무임하차가 제어할 수 없어요. (데이터 주권 한계 —
            추후 로컬 추론으로 전환 예정)
          </li>
        </ul>
      </div>

      <div className="live-card">
        <h2>3. 보유·이용 기간</h2>
        <ul>
          <li>
            개인정보(카카오 계정 정보·프로필)는 회원 탈퇴 시{" "}
            <strong>즉시 익명화</strong>됩니다. 별도 보관 기간 없이 바로
            처리돼요.
          </li>
          <li>
            팀 활동 데이터(회의록·태스크·기여도 기록)는 팀 운영을 위해
            보관합니다. 팀을 삭제해도 화면 접근만 차단되며, 회의록·기여도
            기록은 보존됩니다.
          </li>
        </ul>
      </div>

      <div className="live-card">
        <h2>4. 파기 절차와 방법</h2>
        <ul>
          <li>
            회원 탈퇴 즉시 데이터베이스에서 이름·이메일·프로필 등 개인 식별
            정보를 익명 값으로 대체합니다. 복구할 수 없어요.
          </li>
          <li>
            팀 삭제 시 팀 화면 접근이 차단되며, 회의록·기여도 기록은 삭제되지
            않고 보존됩니다. 본인 발언 텍스트는 종료된 회의의 회의록에서 직접
            수정·삭제할 수 있어요.
          </li>
        </ul>
      </div>

      <div className="live-card">
        <h2>5. 정보주체의 권리와 행사 방법</h2>
        <ul>
          <li>
            <strong>회원 탈퇴</strong>: 설정 &gt; 회원 탈퇴에서 직접 할 수
            있어요. 탈퇴 즉시 개인정보가 익명화됩니다. (팀장은 팀장 위임 후
            탈퇴할 수 있어요)
          </li>
          <li>
            <strong>발언 기록 수정·삭제</strong>: 종료된 회의의 회의록에서 본인
            발화를 직접 수정하거나 삭제할 수 있어요.
          </li>
          <li>
            그 밖의 열람·정정·삭제 요청은 아래 보호책임자 이메일로 보내주시면
            처리해요.
          </li>
        </ul>
      </div>

      <div className="live-card">
        <h2>6. 개인정보 보호책임자</h2>
        <p className="live-sub" style={{ margin: 0 }}>
          이메일:{" "}
          <a href="mailto:sw011124@gmail.com">sw011124@gmail.com</a> —
          개인정보 관련 문의와 권리 행사 요청을 접수합니다.
        </p>
      </div>

      <Link to="/" className="live-btn live-btn--ghost">
        ← 처음으로
      </Link>
    </div>
  );
}
