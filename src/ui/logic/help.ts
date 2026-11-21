// Item 3 (v0.16.0): help resources shown with the sensitive-content notice and on the death record.
// Only government-run or government-listed lines, each with its source URL, checked 2026-11-21.
// Countries without a verifiable official national line are not listed (the page then points to local emergency services).
import type { Lang } from '../i18n.ts';

export interface Help { country: 'TWN' | 'USA' | 'JPN' | 'KOR' | 'VNM'; tel: string; url: string; checked: string; name: Record<Lang, string>; note: Record<Lang, string> }
const CHECKED = '2026-11-21';
const TW_LIST = 'https://dep.mohw.gov.tw/domhaoh/cp-327-8715-107.html';
export const HELP: Help[] = [
  { country: 'TWN', tel: '1925', url: 'https://dep.mohw.gov.tw/domhaoh/fp-4906-54077-107.html', checked: CHECKED,
    name: { 'zh-TW': '安心專線（衛生福利部）', en: 'Taiwan MOHW Peace-of-Mind Line', ja: '台湾・安心専線（衛生福利部）', ko: '대만 안심전화(위생복리부)', vi: 'Đường dây An Tâm Đài Loan (Bộ Y tế và Phúc lợi)' },
    note: { 'zh-TW': '24 小時免付費', en: '24 hours, free', ja: '24時間・無料', ko: '24시간 무료', vi: '24 giờ, miễn phí' } },
  { country: 'TWN', tel: '1995', url: TW_LIST, checked: CHECKED,
    name: { 'zh-TW': '生命線', en: 'Taiwan Lifeline', ja: '台湾・生命線', ko: '대만 생명의 전화', vi: 'Đường dây Sự sống Đài Loan' },
    note: { 'zh-TW': '衛福部列名的全國專線', en: 'national line listed by MOHW', ja: '衛生福利部が掲載する全国窓口', ko: '위생복리부 안내 전국 상담전화', vi: 'đường dây toàn quốc do Bộ Y tế liệt kê' } },
  { country: 'TWN', tel: '1980', url: TW_LIST, checked: CHECKED,
    name: { 'zh-TW': '張老師', en: 'Teacher Chang counselling line', ja: '台湾・張老師相談', ko: '대만 장선생 상담전화', vi: 'Đường dây tư vấn Thầy Trương' },
    note: { 'zh-TW': '衛福部列名的全國專線', en: 'national line listed by MOHW', ja: '衛生福利部が掲載する全国窓口', ko: '위생복리부 안내 전국 상담전화', vi: 'đường dây toàn quốc do Bộ Y tế liệt kê' } },
  { country: 'USA', tel: '988', url: 'https://988lifeline.org/', checked: CHECKED,
    name: { 'zh-TW': '美國 988 自殺與危機生命線', en: '988 Suicide & Crisis Lifeline', ja: '米国 988 自殺・危機ライフライン', ko: '미국 988 자살·위기 라이프라인', vi: 'Đường dây 988 (Hoa Kỳ)' },
    note: { 'zh-TW': '可撥打或傳簡訊，24 小時、免費', en: 'call or text, 24/7, free', ja: '電話・SMS、24時間・無料', ko: '전화·문자, 24시간 무료', vi: 'gọi hoặc nhắn tin, 24/7, miễn phí' } },
  { country: 'JPN', tel: '0570-064-556', url: 'https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel/', checked: CHECKED,
    name: { 'zh-TW': '日本 心理健康諮詢統一專線（厚生勞動省）', en: 'Japan mental health consultation line (MHLW)', ja: 'こころの健康相談統一ダイヤル（厚生労働省）', ko: '일본 마음건강상담 통일다이얼(후생노동성)', vi: 'Đường dây tư vấn sức khỏe tâm thần Nhật Bản (MHLW)' },
    note: { 'zh-TW': '需付通話費；服務時間依都道府縣而異', en: 'call charges apply; hours vary by prefecture', ja: '通話料がかかります。受付時間は都道府県により異なります', ko: '통화료 발생, 운영 시간은 지역마다 다름', vi: 'có tính cước; giờ phục vụ tùy tỉnh' } },
  { country: 'KOR', tel: '109', url: 'https://www.129.go.kr/109/index.do', checked: CHECKED,
    name: { 'zh-TW': '韓國 自殺預防諮詢專線（保健福祉部）', en: 'Korea suicide prevention line (MOHW)', ja: '韓国 自殺予防相談電話（保健福祉部）', ko: '자살예방상담전화(보건복지부)', vi: 'Đường dây phòng chống tự tử Hàn Quốc' },
    note: { 'zh-TW': '24 小時', en: '24 hours', ja: '24時間', ko: '24시간', vi: '24 giờ' } },
  { country: 'VNM', tel: '111', url: 'https://tongdai111.vn/', checked: CHECKED,
    name: { 'zh-TW': '越南 國家兒童保護專線', en: 'Vietnam national child protection line', ja: 'ベトナム 国家子ども保護ダイヤル', ko: '베트남 국가 아동보호 전화', vi: 'Tổng đài quốc gia bảo vệ trẻ em' },
    note: { 'zh-TW': '24 小時免費，含心理諮詢', en: '24/7, free, includes counselling', ja: '24時間・無料、心理相談あり', ko: '24시간 무료, 심리상담 포함', vi: '24/7, miễn phí, có tư vấn tâm lý' } },
];
const HOME: Record<Lang, Help['country']> = { 'zh-TW': 'TWN', en: 'USA', ja: 'JPN', ko: 'KOR', vi: 'VNM' };
/** the UI language's country first, then the rest in listed order */
export function helpOrder(l: Lang): Help[] {
  const c = HOME[l];
  return [...HELP.filter((h) => h.country === c), ...HELP.filter((h) => h.country !== c)];
}
