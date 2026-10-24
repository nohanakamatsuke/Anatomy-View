export const LAYERS = {
  skeletal: {
    ja: "骨格系",
    en: "SKELETAL SYSTEM",
    description:
      "骨格はからだを支え、内臓を保護します。関節を介して筋肉の力を動きに変え、ミネラルの貯蔵や血球の産生にも関わります。",
  },
  muscular: {
    ja: "筋肉系",
    en: "MUSCULAR SYSTEM",
    description:
      "骨格筋は収縮して骨を動かし、姿勢の維持や熱の産生にも関わります。ここでは個々の筋やその構成部分の形状を探索できます。",
  },
  organs: {
    ja: "臓器",
    en: "INTERNAL ORGANS",
    description:
      "脳、心臓、呼吸器、消化器、泌尿器などの参照形状をまとめた表示です。各臓器は近接する構造と立体的な位置関係を持ちます。",
  },
  arterial: {
    ja: "動脈",
    en: "ARTERIES",
    description:
      "心臓から末梢や肺へ向かう血管の参照形状です。動脈の走行と臓器・骨格との位置関係を探索できます。",
  },
  venous: {
    ja: "静脈",
    en: "VEINS",
    description:
      "末梢や肺から心臓へ血液を戻す血管の参照形状です。表在・深部の血管網が含まれます。",
  },
  nervous: {
    ja: "神経・脊髄",
    en: "NERVOUS SYSTEM",
    description:
      "脊髄や末梢神経などの参照形状です。脳の形状は臓器レイヤーに含めています。",
  },
  sensory: {
    ja: "感覚器",
    en: "SENSORY ORGANS",
    description: "視覚・聴覚・平衡感覚などに関わる器官の参照形状です。",
  },
  connective: {
    ja: "結合組織",
    en: "CONNECTIVE TISSUE",
    description: "靭帯、軟骨など、構造を支持・連結する組織の参照形状です。",
  },
  reproductive: {
    ja: "生殖器",
    en: "REPRODUCTIVE SYSTEM",
    description: "成人男性の参照モデルに含まれる生殖器の形状です。",
  },
  integumentary: {
    ja: "体表",
    en: "BODY SURFACE",
    description:
      "からだの外形を示す参照形状です。他のレイヤーと重ねると、内部を見られるよう薄く表示します。",
  },
};
export const FEATURED = [
  {
    name: "skull",
    ja: "頭蓋骨",
    layer: "skeletal",
    description:
      "多数の骨から構成され、脳を保護し、顔面や感覚器の土台となります。下顎骨を除く多くの骨は縫合によって連結しています。",
  },
  {
    name: "vertebral column",
    ja: "脊柱",
    layer: "skeletal",
    description:
      "椎骨が連なってからだの軸をつくり、脊髄を保護します。頸椎・胸椎・腰椎・仙骨・尾骨に区分されます。",
  },
  {
    name: "rib cage",
    ja: "胸郭",
    layer: "skeletal",
    description:
      "肋骨・胸骨・胸椎で構成される胸部の骨格です。心臓や肺を保護し、呼吸に伴って動きます。",
  },
  {
    name: "pelvis",
    ja: "骨盤",
    layer: "skeletal",
    description:
      "体幹と下肢をつなぎ、体重を支える骨性の構造です。骨盤内の臓器を保護する役割もあります。",
  },
  {
    name: "left femur",
    ja: "左大腿骨",
    layer: "skeletal",
    description:
      "大腿の骨で、股関節と膝関節の間をつなぎます。体重を支え、歩行時の力を伝えます。",
  },
  {
    name: "right pectoralis major",
    ja: "右大胸筋",
    layer: "muscular",
    description:
      "前胸部にある大きな骨格筋です。上腕を内側に寄せる動きや内旋などに関わります。",
  },
  {
    name: "brain",
    ja: "脳",
    layer: "organs",
    description:
      "中枢神経系の主要な器官です。感覚の処理、運動、記憶、思考などに関わる領域が複雑に結びついています。",
  },
  {
    name: "heart",
    ja: "心臓",
    layer: "organs",
    description:
      "胸部にある筋性のポンプです。右心系は肺へ、左心系は全身へ血液を送り出します。",
  },
  {
    name: "stomach",
    ja: "胃",
    layer: "organs",
    description:
      "食道と十二指腸の間にある袋状の消化器です。食物を一時的に蓄え、胃液と混ぜながら消化を進めます。",
  },
  {
    name: "kidney",
    ja: "腎臓",
    layer: "organs",
    description:
      "血液をろ過して尿をつくり、体液量や電解質、酸塩基平衡の調節などに関わる左右一対の臓器です。",
  },
  {
    name: "left lung",
    ja: "左肺（気管支）",
    layer: "organs",
    description:
      "肺は酸素と二酸化炭素の交換を担います。この参照データでは、左肺内の気管支の形状を表示します。肺の外形や肺胞は含まれていません。",
  },
  {
    name: "right lung",
    ja: "右肺（気管支）",
    layer: "organs",
    description:
      "右肺は通常、上葉・中葉・下葉に分かれます。この参照データでは、右肺内の気管支を表示し、肺の外形や肺胞は含まれていません。",
  },
  {
    name: "liver",
    ja: "肝臓",
    layer: "organs",
    description:
      "主に右上腹部にある臓器です。栄養素の代謝、胆汁の産生、血漿タンパク質の合成などを担います。",
  },
  {
    name: "spinal cord",
    ja: "脊髄",
    layer: "nervous",
    description:
      "脊柱管内にある中枢神経系の一部です。脳と末梢の間の情報伝達や反射に関わります。",
  },
  {
    name: "aorta",
    ja: "大動脈",
    layer: "arterial",
    description:
      "左心室から出て全身へ血液を送る太い動脈です。上行大動脈、大動脈弓、下行大動脈などに区分されます。",
  },
  {
    name: "superior vena cava",
    ja: "上大静脈",
    layer: "venous",
    description:
      "主に上半身からの静脈血を集め、心臓の右心房へ戻す太い血管です。",
  },
];
const translations = {
  stomach: "胃",
  pancreas: "膵臓",
  esophagus: "食道",
  appendix: "虫垂",
  "ascending colon": "上行結腸",
  "descending colon": "下行結腸",
  "transverse colon": "横行結腸",
  rectum: "直腸",
  duodenum: "十二指腸",
  "urinary bladder": "膀胱",
  trachea: "気管",
  spleen: "脾臓",
  "left femur": "左大腿骨",
  "right femur": "右大腿骨",
  "left humerus": "左上腕骨",
  "right humerus": "右上腕骨",
  "left scapula": "左肩甲骨",
  "right scapula": "右肩甲骨",
  sternum: "胸骨",
  mandible: "下顎骨",
  "hyoid bone": "舌骨",
  "left kidney": "左腎臓",
  "right kidney": "右腎臓",
  "left patella": "左膝蓋骨",
  "right patella": "右膝蓋骨",
  "left clavicle": "左鎖骨",
  "right clavicle": "右鎖骨",
};
export function japanese(name) {
  return (
    FEATURED.find((f) => f.name === name.toLowerCase())?.ja ||
    translations[name.toLowerCase()] ||
    name
  );
}
export const escapeHTML = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function filterEntries(entries, query) {
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) =>
      (e.name + " " + japanese(e.name) + " " + e.id).toLowerCase().includes(q),
    )
    .slice(0, 35);
}
export function isTap(start, end) {
  return (
    !!start &&
    start.count === 1 &&
    !start.moved &&
    Math.hypot(start.x - end.x, start.y - end.y) < 8
  );
}
