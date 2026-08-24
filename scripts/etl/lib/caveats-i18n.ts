/**
 * Per-source caveat translations — zh-Hans / fr / es / ja / ko (zh-Hant lives in provenance.ts
 * as caveats_zh and is merged into the same caveats_i18n map at build time). PRINCIPLE: caveats
 * are data-level academic text and are never tiered to English.
 */
import type { SourceId } from '../config.ts';

type Lang = 'zh-Hans' | 'fr' | 'es' | 'ja' | 'ko';

const UNHCR_SHARED: Record<Lang, string[]> = {
  'zh-Hans': [
    '数字汇总自各国政府与 UNHCR 行动的报告。国家有高报或低报的诱因——筹款诉求、主权主张、有争议的法律身份。缺失的数字不代表没有流离失所者。',
    '不含 UNRWA 登记的巴勒斯坦难民（约 600 万），UNRWA 另有独立统计。',
    '来源中的 "-" 表示未报告，存储为 null，与 0（确实为零）意义不同。',
    '除另有说明外，数字为年末（12 月 31 日）存量。',
  ],
  fr: [
    "Chiffres compilés à partir de ce que déclarent les gouvernements et les opérations du HCR. Les États ont des incitations à sur- ou sous-compter — appels de fonds, revendications de souveraineté, statuts juridiques contestés. Un chiffre manquant ne signifie pas l'absence de personnes déplacées.",
    "Exclut les réfugiés de Palestine enregistrés auprès de l'UNRWA (environ 6 millions), qui publie des statistiques distinctes.",
    'Dans la source, « - » signifie non déclaré ; stocké comme null, distinct de 0 (zéro déclaré).',
    "Sauf indication contraire, les chiffres sont des stocks de fin d'année (31 décembre).",
  ],
  es: [
    'Cifras compiladas a partir de lo que informan los gobiernos y las operaciones de ACNUR. Los Estados tienen incentivos para contar de más o de menos — llamamientos de financiación, reclamos de soberanía, estatutos jurídicos en disputa. Una cifra ausente no significa ausencia de personas desplazadas.',
    'Excluye a los refugiados de Palestina registrados en el OOPS/UNRWA (unos 6 millones), que publica estadísticas separadas.',
    'En la fuente, «-» significa no informado; se almacena como null, distinto de 0 (cero informado).',
    'Salvo indicación en contrario, las cifras son stocks a fin de año (31 de diciembre).',
  ],
  ja: [
    '各国政府とUNHCR事業の報告を集計した数値。国家には過大・過小報告の誘因がある（資金要請、主権主張、争いのある法的地位）。数値の欠落は避難民の不在を意味しない。',
    'UNRWA登録のパレスチナ難民（約600万人）は含まない。UNRWAが別途統計を公表している。',
    '出典の「-」は未報告を意味し、null として保存される。0（ゼロと報告）とは異なる。',
    '特記なき限り、数値は年末（12月31日）時点のストック。',
  ],
  ko: [
    '각국 정부와 UNHCR 사업의 보고를 집계한 수치. 국가에는 과대·과소 보고의 유인이 있다(모금 호소, 주권 주장, 다툼 있는 법적 지위). 수치의 누락이 실향민의 부재를 뜻하지 않는다.',
    'UNRWA에 등록된 팔레스타인 난민(약 600만 명)은 포함하지 않으며, UNRWA가 별도 통계를 발표한다.',
    "출처의 '-'는 미보고를 뜻하며 null로 저장된다. 0(0으로 보고됨)과는 다르다.",
    '별도 언급이 없으면 수치는 연말(12월 31일) 기준 스톡이다.',
  ],
};

export const CAVEATS_I18N: Record<SourceId, Record<Lang, string[]>> = {
  unhcr_countries: {
    'zh-Hans': [
      '国名沿用 UNHCR 用法。科索沃并入「Serbia and Kosovo: S/RES/1244 (1999)」。台湾未列入。',
    ],
    fr: [
      "Les noms de pays suivent l'usage du HCR. Le Kosovo est déclaré sous « Serbia and Kosovo: S/RES/1244 (1999) ». Taïwan n'est pas listée.",
    ],
    es: [
      'Los nombres de países siguen el uso de ACNUR. Kosovo se informa bajo «Serbia and Kosovo: S/RES/1244 (1999)». Taiwán no figura.',
    ],
    ja: [
      '国名はUNHCRの用法に従う。コソボは「Serbia and Kosovo: S/RES/1244 (1999)」として報告。台湾は掲載されていない。',
    ],
    ko: [
      "국명은 UNHCR 용법을 따른다. 코소보는 'Serbia and Kosovo: S/RES/1244 (1999)'로 보고된다. 대만은 목록에 없다.",
    ],
  },
  unhcr_population: {
    'zh-Hans': [
      ...UNHCR_SHARED['zh-Hans'],
      'IDP 数字由 UNHCR 转引自 IDMC。',
      '难民数含「类难民处境」人口。',
    ],
    fr: [
      ...UNHCR_SHARED.fr,
      "Les chiffres de PDI proviennent de l'IDMC via le HCR.",
      'Les réfugiés incluent les personnes en situation apparentée.',
    ],
    es: [
      ...UNHCR_SHARED.es,
      'Las cifras de desplazados internos proceden del IDMC vía ACNUR.',
      'Los refugiados incluyen a personas en situación similar.',
    ],
    ja: [
      ...UNHCR_SHARED.ja,
      'IDPの数値はIDMCからUNHCR経由で引用。',
      '難民には難民類似状況の人々を含む。',
    ],
    ko: [
      ...UNHCR_SHARED.ko,
      'IDP 수치는 IDMC에서 UNHCR 경유로 인용.',
      '난민에는 난민 유사 상황 인구가 포함된다.',
    ],
  },
  unhcr_demographics: {
    'zh-Hans': [
      '年龄/性别细分仅覆盖部分人口；细分皆为 0 但总数非 0 表示未报告人口结构。',
      '年龄组：0–4、5–11、12–17、18–59、60+、其他/未知。',
    ],
    fr: [
      "La ventilation âge/sexe couvre une partie de la population ; des lignes à ventilation nulle mais total non nul signifient qu'aucune donnée démographique n'a été déclarée.",
      "Groupes d'âge : 0–4, 5–11, 12–17, 18–59, 60+, autre/inconnu.",
    ],
    es: [
      'El desglose por edad/sexo cubre una parte de la población; filas con desglose cero pero total distinto de cero significan que no se informaron datos demográficos.',
      'Grupos de edad: 0–4, 5–11, 12–17, 18–59, 60+, otro/desconocido.',
    ],
    ja: [
      '年齢・性別の内訳は一部の人口のみ。内訳がすべて0で合計が非0の行は、人口構成が報告されなかったことを意味する。',
      '年齢区分：0–4、5–11、12–17、18–59、60+、その他/不明。',
    ],
    ko: [
      '연령/성별 세부 내역은 일부 인구만 포함. 내역이 모두 0이고 합계가 0이 아니면 인구 구성 미보고를 뜻한다.',
      '연령 구간: 0–4, 5–11, 12–17, 18–59, 60+, 기타/미상.',
    ],
  },
  unhcr_idmc: {
    'zh-Hans': ['IDMC 报告的冲突与暴力所致 IDP 存量；不含灾害流离失所。'],
    fr: [
      "Stocks de PDI liés aux conflits et violences tels que déclarés par l'IDMC ; les déplacements liés aux catastrophes ne sont pas inclus.",
    ],
    es: [
      'Stocks de desplazados internos por conflicto y violencia según informa el IDMC; no incluye el desplazamiento por desastres.',
    ],
    ja: ['IDMCが報告する紛争・暴力によるIDPストック。災害による避難は含まない。'],
    ko: ['IDMC가 보고하는 분쟁·폭력으로 인한 IDP 스톡. 재해 실향은 포함하지 않음.'],
  },
  unhcr_solutions: {
    'zh-Hans': ['年度流量（返回、重新安置、入籍），非存量。'],
    fr: [
      "Flux au cours de l'année (retours, départs en réinstallation, naturalisations), pas des stocks.",
    ],
    es: [
      'Flujos durante el año (retornos, salidas de reasentamiento, naturalizaciones), no stocks.',
    ],
    ja: ['年中のフロー（帰還、第三国定住の出発、帰化）。ストックではない。'],
    ko: ['연중 흐름(귀환, 재정착 출국, 귀화)이며 스톡이 아님.'],
  },
  unhcr_asylum_applications: {
    'zh-Hans': ['仅保留以人数计（app_pc = P）的行；以案件计（C）的行排除以避免重复计数。'],
    fr: [
      'Seules les lignes mesurées en personnes (app_pc = P) sont conservées ; les lignes par dossier (C) sont exclues pour éviter les doubles comptes.',
    ],
    es: [
      'Solo se conservan las filas medidas en personas (app_pc = P); las filas por caso (C) se excluyen para evitar el doble conteo.',
    ],
    ja: ['人数ベース（app_pc = P）の行のみを保持。件数ベース（C）の行は二重計上を避けるため除外。'],
    ko: ['인원 기준(app_pc = P) 행만 유지. 건수 기준(C) 행은 중복 집계 방지를 위해 제외.'],
  },
  unhcr_footnotes: { 'zh-Hans': [], fr: [], es: [], ja: [], ko: [] },
  unhcr_nowcasting: {
    'zh-Hans': [
      'UNHCR 以统计方法推估的当前数字，非正式报告值。仅含庇护国口径的难民与庇护申请者。',
      '未公布置信区间。',
    ],
    fr: [
      "Estimations statistiques produites par le HCR pour prédire les chiffres actuels ; pas des décomptes déclarés. Uniquement réfugiés et demandeurs d'asile par pays d'asile.",
      "Aucun intervalle de confiance n'est publié.",
    ],
    es: [
      'Estimaciones estadísticas de ACNUR para predecir las cifras actuales; no son recuentos informados. Solo refugiados y solicitantes de asilo por país de asilo.',
      'No se publican intervalos de confianza.',
    ],
    ja: [
      'UNHCRが現在値を予測するために作成した統計的推計であり、報告値ではない。庇護国別の難民・庇護希望者のみ。',
      '信頼区間は公表されていない。',
    ],
    ko: [
      'UNHCR가 현재 수치를 예측하기 위해 산출한 통계적 추정치로, 보고치가 아니다. 비호국 기준 난민·비호신청자만 포함.',
      '신뢰구간은 발표되지 않는다.',
    ],
  },
  wpp_population: {
    'zh-Hans': [
      '年中（7 月 1 日）人口；作为每千人比率的分母（分子为年末存量）。',
      '估计基准年之后的年份为中方案预测值。',
    ],
    fr: [
      "Population de mi-année (1er juillet) ; sert de dénominateur aux taux pour 1 000 face à des stocks de fin d'année.",
      "Les valeurs postérieures à l'année de base des estimations sont des projections (variante moyenne).",
    ],
    es: [
      'Población de mitad de año (1 de julio); se usa como denominador de las tasas por 1.000 frente a stocks de fin de año.',
      'Los valores posteriores al año base de las estimaciones son proyecciones de la variante media.',
    ],
    ja: [
      '年央（7月1日）人口。年末ストックに対する千人当たり率の分母として使用。',
      '推計基準年以降の値は中位推計の予測値。',
    ],
    ko: [
      '연앙(7월 1일) 인구. 연말 스톡에 대한 천 명당 비율의 분모로 사용.',
      '추계 기준연도 이후 값은 중위 추계 전망치.',
    ],
  },
  idmc_idu: {
    'zh-Hans': [
      '自媒体与伙伴报告汇总的初步事件级估计；修订版于 GIDD 发布。',
      '数字为流离失所事件（流量），同一人多次流离可能重复计算。',
    ],
    fr: [
      'Estimations préliminaires au niveau des événements, compilées à partir de médias et de rapports de partenaires ; les chiffres révisés paraissent dans la GIDD.',
      "Il s'agit d'événements de déplacement (flux) ; une même personne déplacée plusieurs fois peut être comptée plusieurs fois.",
    ],
    es: [
      'Estimaciones preliminares a nivel de evento, compiladas de medios e informes de socios; las cifras revisadas se publican en la GIDD.',
      'Son eventos de desplazamiento (flujos); la misma persona desplazada varias veces puede contarse más de una vez.',
    ],
    ja: [
      'メディアやパートナーの報告から集計した暫定的なイベント単位の推計。修正値はGIDDで公表。',
      '数値は避難イベント（フロー）であり、同一人物が複数回避難した場合は重複計上されうる。',
    ],
    ko: [
      '언론·파트너 보고를 집계한 잠정적 사건 단위 추정치. 수정치는 GIDD에 발표.',
      '수치는 실향 사건(플로우)으로, 같은 사람이 여러 번 실향하면 중복 집계될 수 있다.',
    ],
  },
  natural_earth: {
    'zh-Hans': ['边界经简化以利显示，不代表对任何领土法律地位的意见。'],
    fr: [
      "Frontières simplifiées pour l'affichage ; elles n'impliquent aucune opinion quant au statut juridique d'un territoire.",
    ],
    es: [
      'Fronteras simplificadas para la visualización; no implican opinión alguna sobre el estatuto jurídico de ningún territorio.',
    ],
    ja: [
      '境界は表示用に簡略化されており、いかなる領土の法的地位についての見解も示すものではない。',
    ],
    ko: [
      '경계는 표시 편의를 위해 단순화되었으며, 어떤 영토의 법적 지위에 대한 견해도 나타내지 않는다.',
    ],
  },
};
