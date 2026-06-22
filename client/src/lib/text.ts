/** 글자 수가 max를 넘으면 말줄임표(…)로 축약 */
export function truncate(text: string, max = 10): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
