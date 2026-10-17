/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * Curated signature pair (a landmark and a dish) per region, keyed by the exact
 * GeoJSON name. Province-level entries double as the fallback for their cities,
 * so a city without its own entry still shows something true about the area.
 * Proper nouns, therefore not translated — same rule as the glyphs.
 */
type Signature = { landmark: string; food: string }

const SIGNATURES: Record<string, Signature> = {
  // ── Province level ──
  北京市: { landmark: '天坛祈年殿', food: '北京烤鸭' },
  天津市: { landmark: '天津之眼', food: '煎饼果子' },
  河北省: { landmark: '赵州桥', food: '驴肉火烧' },
  山西省: { landmark: '应县木塔', food: '刀削面' },
  内蒙古自治区: { landmark: '蒙古包', food: '手扒肉' },
  辽宁省: { landmark: '沈阳故宫', food: '沈阳鸡架' },
  吉林省: { landmark: '长白山天池', food: '锅包肉' },
  黑龙江省: { landmark: '圣索菲亚教堂', food: '铁锅炖' },
  上海市: { landmark: '东方明珠', food: '生煎馒头' },
  江苏省: { landmark: '苏州园林', food: '松鼠鳜鱼' },
  浙江省: { landmark: '雷峰塔', food: '西湖醋鱼' },
  安徽省: { landmark: '宏村马头墙', food: '臭鳜鱼' },
  福建省: { landmark: '客家土楼', food: '佛跳墙' },
  江西省: { landmark: '滕王阁', food: '瓦罐汤' },
  山东省: { landmark: '曲阜牌坊', food: '煎饼卷大葱' },
  河南省: { landmark: '嵩岳寺塔', food: '郑州烩面' },
  湖北省: { landmark: '黄鹤楼', food: '热干面' },
  湖南省: { landmark: '岳阳楼', food: '长沙臭豆腐' },
  广东省: { landmark: '广州塔', food: '广式早茶' },
  广西壮族自治区: { landmark: '桂林日月双塔', food: '柳州螺蛳粉' },
  海南省: { landmark: '海口钟楼', food: '文昌鸡' },
  重庆市: { landmark: '解放碑', food: '重庆火锅' },
  四川省: { landmark: '都江堰', food: '四川火锅' },
  贵州省: { landmark: '甲秀楼', food: '丝娃娃' },
  云南省: { landmark: '崇圣寺三塔', food: '过桥米线' },
  西藏自治区: { landmark: '布达拉宫', food: '酥油茶' },
  陕西省: { landmark: '大雁塔', food: '肉夹馍' },
  甘肃省: { landmark: '嘉峪关', food: '兰州牛肉面' },
  青海省: { landmark: '塔尔寺', food: '手抓羊肉' },
  宁夏回族自治区: { landmark: '西夏王陵', food: '烩羊杂' },
  新疆维吾尔自治区: { landmark: '国际大巴扎', food: '烤包子' },
  台湾省: { landmark: '台北101', food: '牛肉面' },
  香港特别行政区: { landmark: '中银大厦', food: '茶餐厅' },
  澳门特别行政区: { landmark: '大三巴牌坊', food: '葡式蛋挞' },
  // ── Cities ──
  广州市: { landmark: '广州塔', food: '广式早茶' },
  深圳市: { landmark: '平安金融中心', food: '潮汕牛肉火锅' },
  珠海市: { landmark: '渔女像', food: '万山海鲜' },
  佛山市: { landmark: '祖庙', food: '双皮奶' },
  东莞市: { landmark: '可园', food: '烧鹅濑粉' },
  中山市: { landmark: '孙中山故居', food: '石岐乳鸽' },
  汕头市: { landmark: '小公园开埠区', food: '手打牛肉丸' },
  江门市: { landmark: '开平碉楼', food: '新会陈皮' },
  湛江市: { landmark: '观海长廊', food: '炭烧生蚝' },
  肇庆市: { landmark: '七星岩', food: '裹蒸粽' },
  惠州市: { landmark: '惠州西湖', food: '东江盐焗鸡' },
  杭州市: { landmark: '西湖雷峰塔', food: '东坡肉' },
  宁波市: { landmark: '天一阁', food: '宁波汤圆' },
  温州市: { landmark: '江心屿双塔', food: '温州鱼丸' },
  绍兴市: { landmark: '兰亭', food: '绍兴黄酒' },
  嘉兴市: { landmark: '南湖红船', food: '嘉兴粽子' },
  金华市: { landmark: '双龙洞', food: '金华火腿' },
  南京市: { landmark: '夫子庙', food: '盐水鸭' },
  苏州市: { landmark: '拙政园', food: '松鼠鳜鱼' },
  无锡市: { landmark: '鼋头渚', food: '无锡酱排骨' },
  常州市: { landmark: '天宁宝塔', food: '大麻糕' },
  南通市: { landmark: '濠河', food: '文蛤' },
  徐州市: { landmark: '云龙山', food: '把子肉' },
  扬州市: { landmark: '瘦西湖', food: '扬州炒饭' },
  镇江市: { landmark: '金山寺', food: '肴肉' },
  连云港市: { landmark: '花果山', food: '海鲜' },
  成都市: { landmark: '武侯祠', food: '成都火锅' },
  绵阳市: { landmark: '越王楼', food: '绵阳米粉' },
  宜宾市: { landmark: '大观楼', food: '宜宾燃面' },
  乐山市: { landmark: '乐山大佛', food: '钵钵鸡' },
  武汉市: { landmark: '黄鹤楼', food: '热干面' },
  宜昌市: { landmark: '三峡大坝', food: '凉虾' },
  襄阳市: { landmark: '襄阳古城墙', food: '牛肉面' },
  长沙市: { landmark: '岳麓山', food: '长沙臭豆腐' },
  张家界市: { landmark: '天门山', food: '三下锅' },
  西安市: { landmark: '大雁塔', food: '肉夹馍' },
  咸阳市: { landmark: '乾陵', food: '羊肉泡馍' },
  郑州市: { landmark: '二七纪念塔', food: '郑州烩面' },
  洛阳市: { landmark: '龙门石窟', food: '洛阳水席' },
  开封市: { landmark: '铁塔', food: '灌汤包' },
  安阳市: { landmark: '殷墟', food: '扁粉菜' },
  济南市: { landmark: '趵突泉', food: '把子肉' },
  青岛市: { landmark: '栈桥', food: '青岛海鲜' },
  烟台市: { landmark: '蓬莱阁', food: '烟台焖子' },
  潍坊市: { landmark: '风筝博物馆', food: '朝天锅' },
  泰安市: { landmark: '泰山', food: '泰安煎饼' },
  济宁市: { landmark: '曲阜三孔', food: '孔府菜' },
  威海市: { landmark: '刘公岛', food: '威海海鲜' },
  沈阳市: { landmark: '沈阳故宫', food: '沈阳鸡架' },
  大连市: { landmark: '星海广场', food: '大连海鲜' },
  丹东市: { landmark: '鸭绿江断桥', food: '黄蚬子' },
  锦州市: { landmark: '笔架山', food: '锦州烧烤' },
  长春市: { landmark: '伪满皇宫', food: '锅包肉' },
  吉林市: { landmark: '松花湖', food: '白肉血肠' },
  哈尔滨市: { landmark: '圣索菲亚教堂', food: '哈尔滨红肠' },
  齐齐哈尔市: { landmark: '扎龙保护区', food: '齐齐哈尔烤肉' },
  牡丹江市: { landmark: '镜泊湖', food: '朝鲜族冷面' },
  福州市: { landmark: '三坊七巷', food: '佛跳墙' },
  厦门市: { landmark: '鼓浪屿', food: '沙茶面' },
  泉州市: { landmark: '开元寺', food: '面线糊' },
  合肥市: { landmark: '李鸿章故居', food: '三河米饺' },
  芜湖市: { landmark: '鸠兹古镇', food: '虾籽面' },
  黄山市: { landmark: '黄山', food: '臭鳜鱼' },
  南昌市: { landmark: '滕王阁', food: '瓦罐汤' },
  赣州市: { landmark: '郁孤台', food: '赣州拌粉' },
  昆明市: { landmark: '滇池', food: '过桥米线' },
  丽江市: { landmark: '丽江古城', food: '腊排骨' },
  贵阳市: { landmark: '甲秀楼', food: '丝娃娃' },
  遵义市: { landmark: '遵义会议会址', food: '豆花面' },
  兰州市: { landmark: '中山桥', food: '兰州牛肉面' },
  西宁市: { landmark: '塔尔寺', food: '手抓羊肉' },
  银川市: { landmark: '西夏王陵', food: '烩羊杂' },
  乌鲁木齐市: { landmark: '国际大巴扎', food: '烤包子' },
  呼和浩特市: { landmark: '大召寺', food: '烧麦' },
  石家庄市: { landmark: '赵州桥', food: '驴肉火烧' },
  唐山市: { landmark: '南湖', food: '棋子烧饼' },
  保定市: { landmark: '直隶总督署', food: '驴肉火烧' },
  承德市: { landmark: '避暑山庄', food: '承德羊汤' },
  太原市: { landmark: '双塔寺', food: '刀削面' },
  大同市: { landmark: '云冈石窟', food: '大同羊杂' },
  临汾市: { landmark: '壶口瀑布', food: '牛肉丸子面' },
  海口市: { landmark: '海口钟楼', food: '文昌鸡' },
  三亚市: { landmark: '天涯海角', food: '三亚海鲜' },
  南宁市: { landmark: '会展中心', food: '老友粉' },
  桂林市: { landmark: '日月双塔', food: '桂林米粉' },
  柳州市: { landmark: '风雨桥', food: '柳州螺蛳粉' },
  拉萨市: { landmark: '布达拉宫', food: '酥油茶' },
}

export type SignatureEntry = {
  name: string
  /** Region whose glyph draws this entry (a city borrows its province's). */
  glyph: string
  landmark: string
  food: string
}

/**
 * Signature of the region the pointer is over. `province` is the drilled-down
 * province, or null at the national level: it supplies the glyph (cities borrow
 * their province's) and the fallback pair, so pointing at a city we have no
 * entry for still says something true about the area instead of collapsing the
 * island mid-gesture. Null when nothing at all is known about the region.
 */
export function signatureFor(
  name: string | null,
  province: string | null
): SignatureEntry | null {
  if (!name) return null
  const own = SIGNATURES[name]
  if (own) return { name, glyph: province ?? name, ...own }
  const inherited = province ? SIGNATURES[province] : undefined
  return inherited && province
    ? { name: province, glyph: province, ...inherited }
    : null
}
