const PREFIX = {
  SJ: "TE",
  TB: "TE",
  TH: "TE",
  LV: "LR",
  LIV: "LR",
  DU: "GV",
  RN: "CV",
  REN: "CV",
  UB: "BL",
  KD: "KI",
  KID: "KI",
};
const FOLD = {
  俠: "侠",
  澤: "沢",
  關: "関",
  关: "関",
  衝: "冲",
  谿: "渓",
  溪: "渓",
  氣: "気",
  會: "会",
  腸: "腸",
  陰: "陰",
  阳: "陽",
  沟: "溝",
  渊: "淵",
  窍: "竅",
  风: "風",
  脉: "脈",
  髎: "髎",
  腧: "兪",
  俞: "兪",
  兌: "兑",
};
export function normalizeCode(value) {
  const raw = value
    .normalize("NFKC")
    .toUpperCase()
    .trim()
    .replace(/[\s－−–-]/g, "");
  const match = /^([A-Z]{2,3})0*(\d+)$/.exec(raw);
  return match ? (PREFIX[match[1]] || match[1]) + Number(match[2]) : null;
}
export function foldText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[俠澤關关衝谿溪氣會阳沟渊窍风脉腧俞兌]/g, (c) => FOLD[c] || c)
    .replace(/\s/g, "");
}
export function findAcupoints(catalog, query, meridian = "all") {
  const candidates = catalog.points.filter(
      (p) => meridian === "all" || p.meridian === meridian,
    ),
    code = normalizeCode(query),
    needle = foldText(query);
  if (code) {
    const exact = catalog.points.find((p) => p.code === code);
    if (exact) return [exact];
  }
  if (!needle) return candidates;
  return catalog.points.filter((p) =>
    foldText([p.code, p.ja, p.reading, ...p.aliases].join(" ")).includes(
      needle,
    ),
  );
}
export function pointLabel(point) {
  return point.ja + " · " + point.code;
}
export const SIDE_NAMES = { left: "左", right: "右", midline: "中線" };
export function pointCameraDistance(point) {
  if (point.meridian === "GV" && point.number >= 15) return 0.55;
  if (point.instances[0]?.position[1] > 1.48) return 0.55;
  if (point.instances[0]?.position[1] < 0.16) return 0.5;
  return 0.7;
}
