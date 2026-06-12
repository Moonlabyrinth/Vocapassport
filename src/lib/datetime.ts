// 날짜·시간 유틸 (로컬 시간 기준, 10분 단위 예약 지원)

/** 오늘 날짜 YYYY-MM-DD (로컬) */
export function todayStr(): string {
  return toDateStr(new Date());
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 로컬 날짜+시간 → ISO 문자열 */
export function localToISO(dateStr: string, hour: number, minute: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, hour, minute, 0, 0);
  return dt.toISOString();
}

/** ISO → "M월 D일 (요일) HH:MM" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd}) ${hh}:${mm}`;
}

/** ISO → "M/D HH:MM" 짧은 표기 */
export function formatShort(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/** 00:00 ~ 23:50, 10분 단위 시각 옵션 */
export function timeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 10) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      out.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
    }
  }
  return out;
}

/** 남은 시간 사람이 읽기 좋은 표기 */
export function relativeFromNow(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  let text: string;
  if (days >= 1) text = `${days}일 ${hours % 24}시간`;
  else if (hours >= 1) text = `${hours}시간 ${mins % 60}분`;
  else text = `${mins}분`;
  return diff >= 0 ? `${text} 후` : `${text} 전`;
}
