// Original name pools (zh-TW renderings) by broad cultural region — game content, not data.
// Common personal names are facts; the selection and transliterations here are written for this project.
export type NameRegion = 'zh' | 'ja' | 'ko' | 'vi' | 'sea' | 'south' | 'mena' | 'africa' | 'latam' | 'west' | 'east' | 'central' | 'pacific';
interface Pool { family: string[]; M: string[]; F: string[]; order: 'family-first' | 'given-first'; sep: string }

export const POOLS: Record<NameRegion, Pool> = {
  zh: { order: 'family-first', sep: '', family: ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪', '曾', '周', '賴', '徐', '葉', '蘇', '莊', '呂', '江'],
    M: ['冠宇', '承恩', '家豪', '志明', '俊傑', '建宏', '宗翰', '柏翰', '彥廷', '子軒', '文彬', '國華', '振興', '明哲', '育誠', '信宏'],
    F: ['怡君', '雅婷', '淑芬', '佳穎', '詩涵', '宜蓁', '欣妤', '美玲', '雅雯', '靜怡', '品妍', '秀英', '筱涵', '心怡', '惠君', '思妤'] },
  ja: { order: 'family-first', sep: ' ', family: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡邊', '山本', '中村', '小林', '加藤', '吉田', '山田', '松本', '井上'],
    M: ['健太', '翔太', '大輔', '拓也', '直樹', '和也', '誠', '浩二', '悠斗', '蓮', '隆', '修'],
    F: ['陽子', '美咲', '由美', '彩', '恵子', '真由美', '葵', '結衣', '直子', '優子', '花子', '舞'] },
  ko: { order: 'family-first', sep: '', family: ['金', '李', '朴', '崔', '鄭', '姜', '趙', '尹', '張', '林', '韓', '吳'],
    M: ['民俊', '志勳', '成浩', '東賢', '俊昊', '在允', '泰民', '承佑', '炫宇', '英洙'],
    F: ['智英', '秀珍', '恩惠', '敏貞', '瑞妍', '多恩', '惠珍', '美淑', '允熙', '智媛'] },
  vi: { order: 'family-first', sep: '', family: ['阮', '陳', '黎', '范', '黃', '武', '潘', '鄧', '裴', '杜'],
    M: ['文安', '明俊', '德勝', '光輝', '春山', '國雄', '庭豐', '海龍'],
    F: ['氏蘭', '秋香', '玉梅', '清草', '芳蓮', '金鳳', '翠娥', '氏華'] },
  sea: { order: 'given-first', sep: '·', family: ['桑托斯', '蘇甘迪', '哈迪', '翁', '雷耶斯', '普拉塞', '加西亞', '拉赫曼', '溫', '塔農'],
    M: ['阿迪', '里茲基', '約瑟', '頌猜', '巴育', '馬可', '哈菲茲', '班', '吉多', '阿農'],
    F: ['普特麗', '西蒂', '瑪莉亞', '妮雅', '安琪', '蘇妮', '達薇', '萊拉', '帕麗', '美雅'] },
  south: { order: 'given-first', sep: '·', family: ['夏爾馬', '辛格', '汗', '帕特爾', '庫馬爾', '拉奧', '侯賽因', '古普塔', '查特吉', '阿里'],
    M: ['拉胡爾', '阿米爾', '維傑', '阿爾瓊', '伊姆蘭', '桑傑', '拉維', '卡比爾', '迪帕克', '法哈德'],
    F: ['普莉雅', '安嘉麗', '法蒂瑪', '蘇妮塔', '拉克希米', '阿伊莎', '迪雅', '米拉', '娜茲妮', '卡薇塔'] },
  mena: { order: 'given-first', sep: '·', family: ['哈桑', '阿卜杜拉', '易卜拉欣', '薩利赫', '優素福', '卡里姆', '納賽爾', '哈立德', '阿齊茲', '曼蘇爾'],
    M: ['艾哈邁德', '穆罕默德', '奧馬爾', '優素福', '哈立德', '薩米爾', '塔里克', '卡里姆', '阿里', '納比勒'],
    F: ['法蒂瑪', '萊拉', '阿伊莎', '瑪麗亞姆', '努爾', '薩拉', '哈娜', '雅絲敏', '扎伊娜', '露娜'] },
  africa: { order: 'given-first', sep: '·', family: ['奧凱羅', '曼德拉', '恩庫魯瑪', '迪亞洛', '姆貝基', '阿德耶米', '基貝特', '特拉奧雷', '班達', '奧卡福'],
    M: ['庫瓦梅', '基普', '奧盧', '阿馬杜', '塔本', '恩戈齊', '約瑟夫', '伊沙', '馬蘇', '丹尼爾'],
    F: ['阿瑪', '扎伊納布', '恩諾', '法圖瑪', '格蕾絲', '阿伊莎', '恩珠', '阿迪雅', '瑪麗', '伊芙'] },
  latam: { order: 'given-first', sep: '·', family: ['加西亞', '羅德里格斯', '馬丁內斯', '洛佩斯', '岡薩雷斯', '佩雷斯', '席爾瓦', '桑托斯', '費南德斯', '戈麥斯'],
    M: ['胡安', '卡洛斯', '路易斯', '荷西', '米格爾', '若昂', '迪亞哥', '安德烈斯', '佩德羅', '馬特奧'],
    F: ['瑪麗亞', '安娜', '露西亞', '卡蜜拉', '瓦倫蒂娜', '伊莎貝拉', '卡拉', '索菲亞', '茱莉亞', '加布列拉'] },
  west: { order: 'given-first', sep: '·', family: ['史密斯', '強森', '布朗', '穆勒', '馬丁', '羅西', '威爾森', '泰勒', '伯納德', '費雪', '施密特', '羅培茲'],
    M: ['約翰', '詹姆斯', '湯瑪斯', '路卡斯', '亞歷山大', '馬可', '大衛', '班傑明', '尼可拉斯', '保羅'],
    F: ['艾瑪', '蘇菲', '茱莉亞', '安娜', '夏綠蒂', '露西', '克萊兒', '瑪莉', '伊莉莎白', '蘿拉'] },
  east: { order: 'given-first', sep: '·', family: ['伊凡諾夫', '科瓦爾斯基', '諾瓦克', '霍瓦特', '波波夫', '彼得羅夫', '塞爾吉耶夫', '史瓦爾', '萊維', '茲林斯基'],
    M: ['伊凡', '德米特里', '安德烈', '彼得', '米哈伊爾', '托馬什', '亞歷克謝', '揚', '鮑里斯', '尼古拉'],
    F: ['安娜', '奧爾加', '娜塔莉亞', '瑪莎', '卡特琳娜', '伊蓮娜', '佐雅', '塔蒂亞娜', '伊娃', '瑪格達'] },
  central: { order: 'given-first', sep: '·', family: ['努爾蘭', '卡里莫夫', '巴托', '阿利耶夫', '拉希莫夫', '蘇爾坦', '巴特爾', '阿赫梅多夫'],
    M: ['努爾蘇丹', '巴特爾', '阿斯蘭', '鐵木爾', '達斯坦', '法爾哈德', '甘巴特', '魯斯蘭'],
    F: ['阿依古麗', '其其格', '迪娜拉', '古麗', '薩烏列', '娜爾吉莎', '烏蘭', '瑪迪娜'] },
  pacific: { order: 'given-first', sep: '·', family: ['陶法', '圖伊', '納瓦', '瓦卡', '莫阿納', '拉圖', '凱拉', '塔內'],
    M: ['約瑟', '塞米', '圖伊', '馬努', '卡伊', '塔內', '伊利', '薩蒙'],
    F: ['瑪莉', '莉瓦', '阿娜', '西娜', '洛薩', '梅蕾', '泰菈', '露瑪'] },
};

const SUB: Record<number, NameRegion> = { 906: 'zh', 910: 'africa', 911: 'africa', 913: 'africa', 914: 'africa', 912: 'mena', 922: 'mena', 915: 'latam', 916: 'latam', 931: 'latam',
  918: 'west', 924: 'west', 925: 'west', 926: 'west', 927: 'west', 923: 'east', 5500: 'central', 5501: 'south', 920: 'sea', 928: 'pacific', 954: 'pacific', 957: 'pacific' };
const ISO: Record<string, NameRegion> = { JPN: 'ja', KOR: 'ko', PRK: 'ko', VNM: 'vi', MNG: 'central', SGP: 'zh', IRN: 'mena', AFG: 'south', SDN: 'mena' };

export const regionOf = (iso: string, sub: number): NameRegion => ISO[iso] ?? SUB[sub] ?? 'west';

export interface PersonName { given: string; family: string; full: string }
export function makeName(region: NameRegion, sex: 'M' | 'F', u1: number, u2: number, family?: string): PersonName {
  const p = POOLS[region];
  const fam = family ?? p.family[Math.floor(u1 * p.family.length)]!;
  const g = p[sex][Math.floor(u2 * p[sex].length)]!;
  return { given: g, family: fam, full: p.order === 'family-first' ? fam + p.sep + g : g + p.sep + fam };
}
export const pickFamily = (region: NameRegion, u: number) => POOLS[region].family[Math.floor(u * POOLS[region].family.length)]!;
