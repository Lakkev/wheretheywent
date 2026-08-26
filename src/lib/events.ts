/**
 * Timeline event anchors — editorial constants, deliberately few and neutral.
 * RULES: one line each; numbers appear only when they are (a) this site's own computed records
 * or (b) uncontested historical record; no adjectives of blame; every event's "see →" lands on
 * a reproducible view. Translations live here (content, not UI chrome).
 */
import type { Locale } from '../i18n/ui';
import type { ViewId } from './types';

export interface TimelineEvent {
  year: number;
  /** country to select on "see →" */
  c?: string;
  /** view to switch to on "see →" */
  v?: ViewId;
  text: Partial<Record<Locale, string>> & { en: string };
}

export const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    year: 1956,
    c: 'HUN',
    v: 'origin',
    text: {
      en: 'Hungarian uprising — some 200,000 flee within months.',
      'zh-Hant': '匈牙利起義——數月內約 20 萬人出逃。',
      'zh-Hans': '匈牙利起义——数月内约 20 万人出逃。',
      fr: 'Insurrection hongroise — environ 200 000 personnes fuient en quelques mois.',
      es: 'Levantamiento húngaro: unas 200.000 personas huyen en meses.',
      ja: 'ハンガリー動乱 — 数か月で約20万人が国外へ。',
      ko: '헝가리 봉기 — 몇 달 새 약 20만 명이 탈출.',
    },
  },
  {
    year: 1964,
    c: 'HKG',
    v: 'asylum',
    text: {
      en: 'Hong Kong at 357 refugees per 1,000 residents — the all-time per-capita record in this dataset.',
      'zh-Hant': '香港每千名居民收容 357 名難民——本資料集史上人均最高紀錄。',
      'zh-Hans': '香港每千名居民收容 357 名难民——本数据集史上人均最高纪录。',
      fr: 'Hong Kong : 357 réfugiés pour 1 000 habitants — record par habitant de ce jeu de données.',
      es: 'Hong Kong: 357 refugiados por cada 1.000 habitantes — récord per cápita de este conjunto de datos.',
      ja: '香港、住民千人あたり難民357人 — 本データセット史上最高の人口比。',
      ko: '홍콩, 주민 천 명당 난민 357명 — 본 데이터셋 사상 최고 인구 대비 기록.',
    },
  },
  {
    year: 1971,
    c: 'IND',
    v: 'asylum',
    text: {
      en: 'Bangladesh Liberation War — millions cross into India.',
      'zh-Hant': '孟加拉獨立戰爭——數百萬人越境進入印度。',
      'zh-Hans': '孟加拉独立战争——数百万人越境进入印度。',
      fr: 'Guerre de libération du Bangladesh — des millions passent en Inde.',
      es: 'Guerra de Liberación de Bangladés: millones cruzan a la India.',
      ja: 'バングラデシュ独立戦争 — 数百万人がインドへ。',
      ko: '방글라데시 독립전쟁 — 수백만 명이 인도로 넘어감.',
    },
  },
  {
    year: 1979,
    c: 'AFG',
    v: 'origin',
    text: {
      en: 'Soviet invasion of Afghanistan — the start of 34 years as the world’s #1 origin.',
      'zh-Hant': '蘇聯入侵阿富汗——此後累計 34 年位居全球最大來源國。',
      'zh-Hans': '苏联入侵阿富汗——此后累计 34 年位居全球最大来源国。',
      fr: "Invasion soviétique de l'Afghanistan — début de 34 années au total comme première origine mondiale.",
      es: 'Invasión soviética de Afganistán: comienzo de 34 años acumulados como primer origen mundial.',
      ja: 'ソ連のアフガニスタン侵攻 — 以後、通算34年にわたり世界最大の出身国に。',
      ko: '소련의 아프가니스탄 침공 — 이후 통산 34년간 세계 최대 출신국.',
    },
  },
  {
    year: 1980,
    c: 'SOM',
    v: 'asylum',
    text: {
      en: 'After the Ogaden war, Somalia hosts 337 refugees per 1,000 residents.',
      'zh-Hant': '歐加登戰爭之後，索馬利亞每千名居民收容 337 名難民。',
      'zh-Hans': '欧加登战争之后，索马里每千名居民收容 337 名难民。',
      fr: "Après la guerre de l'Ogaden, la Somalie accueille 337 réfugiés pour 1 000 habitants.",
      es: 'Tras la guerra de Ogadén, Somalia acoge 337 refugiados por cada 1.000 habitantes.',
      ja: 'オガデン戦争後、ソマリアは住民千人あたり337人の難民を受け入れ。',
      ko: '오가덴 전쟁 이후 소말리아는 주민 천 명당 337명의 난민을 수용.',
    },
  },
  {
    year: 1990,
    c: 'IRN',
    v: 'asylum',
    text: {
      en: 'Iran’s hosting rises by 1.3 million in one year — the second-largest jump ever recorded.',
      'zh-Hant': '伊朗收容量一年增加 130 萬——史上第二大單年增幅。',
      'zh-Hans': '伊朗收容量一年增加 130 万——史上第二大单年增幅。',
      fr: "L'accueil en Iran augmente de 1,3 million en un an — deuxième plus forte hausse jamais enregistrée.",
      es: 'La acogida de Irán sube 1,3 millones en un año: el segundo mayor salto registrado.',
      ja: 'イランの受け入れが1年で130万人増 — 記録上2番目の増加。',
      ko: '이란의 수용 규모가 1년 새 130만 명 증가 — 기록상 두 번째 규모.',
    },
  },
  {
    year: 1992,
    c: 'BIH',
    v: 'origin',
    text: {
      en: 'War in Bosnia and Herzegovina — the largest displacement in Europe since 1945, until 2022.',
      'zh-Hant': '波士尼亞戰爭——2022 年之前歐洲自 1945 年以來最大規模的流離。',
      'zh-Hans': '波斯尼亚战争——2022 年之前欧洲自 1945 年以来最大规模的流离。',
      fr: 'Guerre de Bosnie-Herzégovine — le plus grand déplacement en Europe depuis 1945, jusqu’en 2022.',
      es: 'Guerra de Bosnia: el mayor desplazamiento en Europa desde 1945, hasta 2022.',
      ja: 'ボスニア戦争 — 2022年まで、1945年以降の欧州最大の避難。',
      ko: '보스니아 전쟁 — 2022년 이전까지 1945년 이후 유럽 최대의 실향.',
    },
  },
  {
    year: 1994,
    c: 'RWA',
    v: 'origin',
    text: {
      en: 'Genocide in Rwanda — over two million flee within weeks.',
      'zh-Hant': '盧安達大屠殺——數週內逾兩百萬人出逃。',
      'zh-Hans': '卢旺达大屠杀——数周内逾两百万人出逃。',
      fr: 'Génocide au Rwanda — plus de deux millions fuient en quelques semaines.',
      es: 'Genocidio en Ruanda: más de dos millones huyen en semanas.',
      ja: 'ルワンダの虐殺 — 数週間で200万人以上が国外へ。',
      ko: '르완다 제노사이드 — 몇 주 만에 200만 명 이상이 탈출.',
    },
  },
  {
    year: 2011,
    c: 'SYR',
    v: 'origin',
    text: {
      en: 'War begins in Syria — within four years, the world’s largest origin of refugees.',
      'zh-Hant': '敘利亞戰爭爆發——四年內成為全球最大難民來源國。',
      'zh-Hans': '叙利亚战争爆发——四年内成为全球最大难民来源国。',
      fr: 'La guerre éclate en Syrie — en quatre ans, première origine mondiale de réfugiés.',
      es: 'Estalla la guerra en Siria: en cuatro años, primer origen mundial de refugiados.',
      ja: 'シリアで戦争が始まる — 4年で世界最大の難民出身国に。',
      ko: '시리아 전쟁 발발 — 4년 만에 세계 최대 난민 출신국으로.',
    },
  },
  {
    year: 2013,
    c: 'SSD',
    v: 'origin',
    text: {
      en: 'Civil war in South Sudan, the world’s newest state.',
      'zh-Hant': '世界最年輕的國家南蘇丹爆發內戰。',
      'zh-Hans': '世界最年轻的国家南苏丹爆发内战。',
      fr: 'Guerre civile au Soudan du Sud, le plus jeune État du monde.',
      es: 'Guerra civil en Sudán del Sur, el Estado más joven del mundo.',
      ja: '世界で最も新しい国、南スーダンで内戦。',
      ko: '세계에서 가장 젊은 나라 남수단에서 내전 발발.',
    },
  },
  {
    year: 2017,
    c: 'BGD',
    v: 'asylum',
    text: {
      en: 'Rohingya flee Myanmar — Bangladesh’s hosting jumps within a single year.',
      'zh-Hant': '羅興亞人逃離緬甸——孟加拉的收容量一年之間跳升。',
      'zh-Hans': '罗兴亚人逃离缅甸——孟加拉的收容量一年之间跳升。',
      fr: 'Les Rohingyas fuient le Myanmar — l’accueil au Bangladesh bondit en un an.',
      es: 'Los rohinyás huyen de Myanmar: la acogida de Bangladés salta en un solo año.',
      ja: 'ロヒンギャがミャンマーから避難 — バングラデシュの受け入れが1年で急増。',
      ko: '로힝야족이 미얀마를 탈출 — 방글라데시의 수용 규모가 1년 새 급증.',
    },
  },
  {
    year: 2018,
    c: 'VEN',
    v: 'origin',
    text: {
      en: 'The Venezuelan exodus — so large it required a new statistical category (OIP).',
      'zh-Hant': '委內瑞拉大出走——規模之大，催生了新的統計類別（OIP）。',
      'zh-Hans': '委内瑞拉大出走——规模之大，催生了新的统计类别（OIP）。',
      fr: "L'exode vénézuélien — si massif qu'il a exigé une nouvelle catégorie statistique (OIP).",
      es: 'El éxodo venezolano: tan grande que exigió una nueva categoría estadística (OIP).',
      ja: 'ベネズエラの大流出 — 新たな統計区分（OIP）を生むほどの規模。',
      ko: '베네수엘라 대탈출 — 새 통계 범주(OIP)를 만들 만큼의 규모.',
    },
  },
  {
    year: 2022,
    c: 'UKR',
    v: 'origin',
    text: {
      en: 'Full-scale invasion of Ukraine — Europe’s fastest displacement since the Second World War.',
      'zh-Hant': '烏克蘭遭全面入侵——二戰以來歐洲最快速的流離。',
      'zh-Hans': '乌克兰遭全面入侵——二战以来欧洲最快速的流离。',
      fr: "Invasion à grande échelle de l'Ukraine — le déplacement le plus rapide en Europe depuis 1945.",
      es: 'Invasión a gran escala de Ucrania: el desplazamiento más rápido en Europa desde 1945.',
      ja: 'ウクライナへの全面侵攻 — 第二次大戦以降、欧州で最も急速な避難。',
      ko: '우크라이나 전면 침공 — 2차 대전 이후 유럽에서 가장 빠른 실향.',
    },
  },
  {
    year: 2025,
    c: 'IRN',
    v: 'asylum',
    text: {
      en: 'The largest one-year decline on record: Iran, −2.7 million (returns to Afghanistan — and deportations).',
      'zh-Hant': '史上最大單年下降：伊朗 −270 萬（返回阿富汗——也包括遣返）。',
      'zh-Hans': '史上最大单年下降：伊朗 −270 万（返回阿富汗——也包括遣返）。',
      fr: 'La plus forte baisse annuelle jamais enregistrée : Iran, −2,7 millions (retours en Afghanistan — et expulsions).',
      es: 'El mayor descenso anual registrado: Irán, −2,7 millones (retornos a Afganistán — y deportaciones).',
      ja: '記録上最大の年間減少：イラン −270万（アフガニスタンへの帰還 — 強制送還も含む）。',
      ko: '기록상 최대의 연간 감소: 이란 −270만 (아프가니스탄 귀환 — 강제 추방 포함).',
    },
  },
];

export function eventForYear(year: number): TimelineEvent | null {
  return TIMELINE_EVENTS.find((e) => e.year === year) ?? null;
}
export function eventText(e: TimelineEvent, locale: Locale): string {
  return e.text[locale] ?? e.text.en;
}
