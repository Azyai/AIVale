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
 * Curated signature per region, keyed by the exact GeoJSON name. Every
 * prefecture-level and county-level unit the bundled maps can draw has an
 * entry, so hovering anywhere says something about *that* place rather than
 * falling back to its province.
 *
 * `landmark` is the "特色" slot and is drawn first: a scenic spot, a historic
 * building, or an intangible-heritage craft where the place is better known for
 * one than for a sight. `food` follows. At least one of the two is always set;
 * the island renders whichever are present.
 *
 * Province-level entries double as the fallback for any name missing here.
 * Proper nouns, therefore not translated — same rule as the glyphs.
 */
type Signature = { landmark?: string; food?: string }

const SIGNATURES: Record<string, Signature> = {
  // ── Province level ────────────────────────────────────────────────────────
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

  // ── 北京 · 16 区 ──────────────────────────────────────────────────────────
  东城区: { landmark: '故宫太和殿', food: '豆汁焦圈' },
  西城区: { landmark: '北海白塔', food: '护国寺小吃' },
  朝阳区: { landmark: '国家体育场鸟巢' },
  丰台区: { landmark: '卢沟桥' },
  石景山区: { landmark: '首钢园' },
  海淀区: { landmark: '颐和园佛香阁' },
  门头沟区: { landmark: '潭柘寺' },
  房山区: { landmark: '周口店遗址' },
  通州区: { landmark: '燃灯塔' },
  顺义区: { landmark: '焦庄户地道战遗址' },
  昌平区: { landmark: '明十三陵' },
  大兴区: { landmark: '南海子麋鹿苑' },
  怀柔区: { landmark: '慕田峪长城' },
  平谷区: { landmark: '金海湖' },
  密云区: { landmark: '司马台长城' },
  延庆区: { landmark: '八达岭长城' },

  // ── 天津 · 16 区 ──────────────────────────────────────────────────────────
  和平区: { landmark: '五大道', food: '天津茶汤' },
  河东区: { landmark: '天妃宫遗址' },
  河西区: { landmark: '天津博物馆' },
  南开区: { landmark: '古文化街', food: '泥人张彩塑' },
  河北区: { landmark: '意式风情区' },
  红桥区: { landmark: '平津战役纪念馆' },
  东丽区: { landmark: '东丽湖' },
  西青区: { landmark: '石家大院', food: '杨柳青年画' },
  津南区: { landmark: '小站练兵园', food: '小站稻' },
  北辰区: { landmark: '北运河郊野公园' },
  武清区: { landmark: '大黄堡湿地' },
  宝坻区: { landmark: '潮白河国家湿地公园' },
  滨海新区: { landmark: '国家海洋博物馆' },
  宁河区: { landmark: '七里海湿地' },
  静海区: { landmark: '团泊湖', food: '独流老醋' },
  蓟州区: { landmark: '独乐寺' },

  // ── 河北 · 11 ─────────────────────────────────────────────────────────────
  石家庄市: { landmark: '正定隆兴寺', food: '缸炉烧饼' },
  唐山市: { landmark: '南湖', food: '棋子烧饼' },
  秦皇岛市: { landmark: '山海关老龙头' },
  邯郸市: { landmark: '广府古城' },
  邢台市: { landmark: '崆山白云洞' },
  保定市: { landmark: '直隶总督署', food: '驴肉火烧' },
  张家口市: { landmark: '大境门', food: '蔚县剪纸' },
  承德市: { landmark: '避暑山庄', food: '承德羊汤' },
  沧州市: { landmark: '沧州铁狮子', food: '吴桥杂技' },
  廊坊市: { landmark: '天下第一城' },
  衡水市: { landmark: '衡水湖', food: '冀派内画' },

  // ── 山西 · 11 ─────────────────────────────────────────────────────────────
  太原市: { landmark: '晋祠', food: '清和元头脑' },
  大同市: { landmark: '云冈石窟', food: '大同羊杂' },
  阳泉市: { landmark: '娘子关' },
  长治市: { landmark: '太行山大峡谷', food: '上党梆子' },
  晋城市: { landmark: '皇城相府' },
  朔州市: { landmark: '应县木塔' },
  晋中市: { landmark: '平遥古城', food: '平遥牛肉' },
  运城市: { landmark: '鹳雀楼', food: '运城盐池' },
  忻州市: { landmark: '五台山' },
  临汾市: { landmark: '壶口瀑布', food: '牛肉丸子面' },
  吕梁市: { landmark: '碛口古镇', food: '杏花村汾酒' },

  // ── 内蒙古 · 12 ───────────────────────────────────────────────────────────
  呼和浩特市: { landmark: '大召寺', food: '烧麦' },
  包头市: { landmark: '五当召' },
  乌海市: { landmark: '桌子山岩画' },
  赤峰市: { landmark: '阿斯哈图石林', food: '赤峰对夹' },
  通辽市: { landmark: '大青沟' },
  鄂尔多斯市: { landmark: '成吉思汗陵', food: '鄂尔多斯婚礼' },
  呼伦贝尔市: { landmark: '呼伦湖', food: '手把肉' },
  巴彦淖尔市: { landmark: '乌梁素海' },
  乌兰察布市: { landmark: '辉腾锡勒草原' },
  兴安盟: { landmark: '阿尔山天池' },
  锡林郭勒盟: { landmark: '元上都遗址' },
  阿拉善盟: { landmark: '额济纳胡杨林' },

  // ── 辽宁 · 14 ─────────────────────────────────────────────────────────────
  沈阳市: { landmark: '沈阳故宫', food: '沈阳鸡架' },
  大连市: { landmark: '星海广场', food: '大连海鲜' },
  鞍山市: { landmark: '千山', food: '岫岩玉雕' },
  抚顺市: { landmark: '赫图阿拉城', food: '煤精雕刻' },
  本溪市: { landmark: '本溪水洞' },
  丹东市: { landmark: '鸭绿江断桥', food: '黄蚬子' },
  锦州市: { landmark: '笔架山', food: '锦州烧烤' },
  营口市: { landmark: '望儿山' },
  阜新市: { landmark: '阜新玛瑙雕' },
  辽阳市: { landmark: '辽阳白塔' },
  盘锦市: { landmark: '红海滩', food: '盘锦河蟹' },
  铁岭市: { landmark: '铁岭二人转' },
  朝阳市: { landmark: '牛河梁遗址' },
  葫芦岛市: { landmark: '兴城古城' },

  // ── 吉林 · 9 ──────────────────────────────────────────────────────────────
  长春市: { landmark: '伪满皇宫', food: '锅包肉' },
  吉林市: { landmark: '吉林雾凇', food: '白肉血肠' },
  四平市: { landmark: '叶赫那拉古城' },
  辽源市: { landmark: '东辽河源头' },
  通化市: { landmark: '好太王碑', food: '通化山葡萄酒' },
  白山市: { landmark: '长白山西坡', food: '抚松人参' },
  松原市: { landmark: '查干湖冬捕', food: '查干湖胖头鱼' },
  白城市: { landmark: '向海湿地' },
  延边朝鲜族自治州: { landmark: '防川一眼望三国', food: '延边冷面' },

  // ── 黑龙江 · 13 ───────────────────────────────────────────────────────────
  哈尔滨市: { landmark: '冰雪大世界', food: '哈尔滨红肠' },
  齐齐哈尔市: { landmark: '扎龙自然保护区', food: '齐齐哈尔烤肉' },
  鸡西市: { landmark: '兴凯湖' },
  鹤岗市: { landmark: '名山岛' },
  双鸭山市: { landmark: '雁窝岛' },
  大庆市: { landmark: '铁人王进喜纪念馆' },
  伊春市: { landmark: '汤旺河石林' },
  佳木斯市: { landmark: '华夏东极', food: '赫哲鱼皮画' },
  七台河市: { landmark: '桃山湖' },
  牡丹江市: { landmark: '镜泊湖', food: '雪乡' },
  黑河市: { landmark: '五大连池' },
  绥化市: { landmark: '海伦剪纸' },
  大兴安岭地区: { landmark: '北极村' },

  // ── 上海 · 16 区 ──────────────────────────────────────────────────────────
  黄浦区: { landmark: '外滩万国建筑群', food: '城隍庙五香豆' },
  徐汇区: { landmark: '徐家汇天主教堂' },
  长宁区: { landmark: '中山公园' },
  静安区: { landmark: '静安寺', food: '王家沙蟹粉小笼' },
  普陀区: { landmark: '真如寺' },
  虹口区: { landmark: '鲁迅公园' },
  杨浦区: { landmark: '杨浦滨江工业遗存' },
  闵行区: { landmark: '七宝老街', food: '七宝方糕' },
  宝山区: { landmark: '吴淞炮台湾湿地' },
  嘉定区: { landmark: '古猗园', food: '南翔小笼' },
  浦东新区: { landmark: '东方明珠' },
  金山区: { landmark: '枫泾古镇', food: '金山农民画' },
  松江区: { landmark: '广富林遗址' },
  青浦区: { landmark: '朱家角古镇' },
  奉贤区: { landmark: '碧海金沙' },
  崇明区: { landmark: '东滩鸟类保护区', food: '崇明糕' },

  // ── 江苏 · 13 ─────────────────────────────────────────────────────────────
  南京市: { landmark: '夫子庙', food: '盐水鸭' },
  无锡市: { landmark: '鼋头渚', food: '无锡酱排骨' },
  徐州市: { landmark: '汉兵马俑', food: '把子肉' },
  常州市: { landmark: '天宁宝塔', food: '常州大麻糕' },
  苏州市: { landmark: '拙政园', food: '松鼠鳜鱼' },
  南通市: { landmark: '濠河', food: '南通蓝印花布' },
  连云港市: { landmark: '花果山', food: '东海水晶' },
  淮安市: { landmark: '河下古镇', food: '淮扬菜' },
  盐城市: { landmark: '大丰麋鹿保护区' },
  扬州市: { landmark: '瘦西湖', food: '扬州早茶' },
  镇江市: { landmark: '金山寺', food: '镇江香醋' },
  泰州市: { landmark: '梅兰芳纪念馆', food: '泰州早茶' },
  宿迁市: { landmark: '项王故里', food: '洋河大曲' },

  // ── 浙江 · 11 ─────────────────────────────────────────────────────────────
  杭州市: { landmark: '西湖雷峰塔', food: '东坡肉' },
  宁波市: { landmark: '天一阁', food: '宁波汤圆' },
  温州市: { landmark: '江心屿双塔', food: '温州鱼丸' },
  嘉兴市: { landmark: '乌镇', food: '嘉兴粽子' },
  湖州市: { landmark: '南浔古镇', food: '湖州千张包' },
  绍兴市: { landmark: '鲁迅故里', food: '绍兴黄酒' },
  金华市: { landmark: '双龙洞', food: '金华火腿' },
  衢州市: { landmark: '江郎山', food: '衢州兔头' },
  舟山市: { landmark: '普陀山', food: '舟山带鱼' },
  台州市: { landmark: '国清寺', food: '仙居杨梅' },
  丽水市: { landmark: '缙云仙都', food: '缙云烧饼' },

  // ── 安徽 · 16 ─────────────────────────────────────────────────────────────
  合肥市: { landmark: '包公园', food: '三河米饺' },
  芜湖市: { landmark: '鸠兹古镇', food: '虾籽面' },
  蚌埠市: { landmark: '双墩遗址', food: '烧饼夹里脊' },
  淮南市: { landmark: '八公山', food: '淮南牛肉汤' },
  马鞍山市: { landmark: '采石矶', food: '当涂大肉面' },
  淮北市: { landmark: '相山公园', food: '濉溪口子窖' },
  铜陵市: { landmark: '天井湖', food: '铜陵白姜' },
  安庆市: { landmark: '振风塔', food: '山粉圆子烧肉' },
  黄山市: { landmark: '黄山迎客松', food: '徽州臭鳜鱼' },
  滁州市: { landmark: '醉翁亭', food: '琅琊酥糖' },
  阜阳市: { landmark: '颍上八里河', food: '太和板面' },
  宿州市: { landmark: '皇藏峪', food: '砀山酥梨' },
  六安市: { landmark: '天堂寨', food: '六安瓜片' },
  亳州市: { landmark: '花戏楼', food: '亳州牛肉馍' },
  池州市: { landmark: '九华山', food: '九华素饼' },
  宣城市: { landmark: '宣纸文化园', food: '绩溪一品锅' },

  // ── 福建 · 9 ──────────────────────────────────────────────────────────────
  福州市: { landmark: '三坊七巷', food: '佛跳墙' },
  厦门市: { landmark: '鼓浪屿', food: '沙茶面' },
  莆田市: { landmark: '湄洲妈祖庙', food: '莆田卤面' },
  三明市: { landmark: '泰宁大金湖', food: '沙县小吃' },
  泉州市: { landmark: '开元寺', food: '面线糊' },
  漳州市: { landmark: '南靖土楼', food: '漳州卤面' },
  南平市: { landmark: '武夷山', food: '大红袍' },
  龙岩市: { landmark: '永定土楼', food: '长汀河田鸡' },
  宁德市: { landmark: '白水洋', food: '福鼎白茶' },

  // ── 江西 · 11 ─────────────────────────────────────────────────────────────
  南昌市: { landmark: '滕王阁', food: '瓦罐汤' },
  景德镇市: { landmark: '御窑厂遗址', food: '景德镇冷粉' },
  萍乡市: { landmark: '武功山', food: '莲花血鸭' },
  九江市: { landmark: '庐山', food: '鄱阳湖银鱼' },
  新余市: { landmark: '仙女湖', food: '分宜夏布' },
  鹰潭市: { landmark: '龙虎山天师府', food: '上清豆腐' },
  赣州市: { landmark: '客家围屋', food: '赣南脐橙' },
  吉安市: { landmark: '井冈山', food: '泰和乌鸡' },
  宜春市: { landmark: '明月山', food: '宜春扎粉' },
  抚州市: { landmark: '大觉山', food: '南丰蜜桔' },
  上饶市: { landmark: '三清山', food: '铅山烫粉' },

  // ── 山东 · 16 ─────────────────────────────────────────────────────────────
  济南市: { landmark: '趵突泉', food: '把子肉' },
  青岛市: { landmark: '八大关', food: '青岛原浆啤酒' },
  淄博市: { landmark: '周村古商城', food: '淄博烧烤' },
  枣庄市: { landmark: '台儿庄古城', food: '枣庄辣子鸡' },
  东营市: { landmark: '黄河入海口湿地' },
  烟台市: { landmark: '蓬莱阁', food: '烟台苹果' },
  潍坊市: { landmark: '杨家埠木版年画', food: '朝天锅' },
  济宁市: { landmark: '曲阜三孔', food: '孔府菜' },
  泰安市: { landmark: '泰山', food: '泰安煎饼' },
  威海市: { landmark: '刘公岛', food: '威海鲅鱼水饺' },
  日照市: { landmark: '万平口', food: '日照绿茶' },
  临沂市: { landmark: '蒙山', food: '沂蒙煎饼' },
  德州市: { landmark: '苏禄王墓', food: '德州扒鸡' },
  聊城市: { landmark: '光岳楼', food: '东阿阿胶' },
  滨州市: { landmark: '魏氏庄园', food: '沾化冬枣' },
  菏泽市: { landmark: '曹州牡丹园', food: '单县羊肉汤' },

  // ── 河南 · 18 ─────────────────────────────────────────────────────────────
  郑州市: { landmark: '二七纪念塔', food: '郑州烩面' },
  开封市: { landmark: '清明上河园', food: '开封灌汤包' },
  洛阳市: { landmark: '龙门石窟', food: '洛阳水席' },
  平顶山市: { landmark: '尧山', food: '郏县饸饹面' },
  安阳市: { landmark: '殷墟', food: '扁粉菜' },
  鹤壁市: { landmark: '云梦山', food: '淇河缠丝鸭蛋' },
  新乡市: { landmark: '八里沟', food: '新乡红焖羊肉' },
  焦作市: { landmark: '云台山', food: '温县铁棍山药' },
  濮阳市: { landmark: '西水坡蚌塑龙', food: '濮阳壮馍' },
  许昌市: { landmark: '神垕古镇', food: '禹州焖子' },
  漯河市: { landmark: '贾湖遗址', food: '北舞渡胡辣汤' },
  三门峡市: { landmark: '仰韶村遗址', food: '灵宝苹果' },
  南阳市: { landmark: '南阳武侯祠', food: '新野板面' },
  商丘市: { landmark: '商丘古城', food: '民权葡萄酒' },
  信阳市: { landmark: '鸡公山', food: '信阳毛尖' },
  周口市: { landmark: '太昊陵', food: '逍遥镇胡辣汤' },
  驻马店市: { landmark: '嵖岈山', food: '泌阳花菇' },
  济源市: { landmark: '王屋山', food: '冬凌草茶' },

  // ── 湖北 · 17 ─────────────────────────────────────────────────────────────
  武汉市: { landmark: '黄鹤楼', food: '热干面' },
  黄石市: { landmark: '铜绿山古铜矿遗址', food: '黄石港饼' },
  十堰市: { landmark: '武当山', food: '郧阳三合汤' },
  宜昌市: { landmark: '三峡大坝', food: '凉虾' },
  襄阳市: { landmark: '襄阳古城墙', food: '襄阳牛肉面' },
  鄂州市: { landmark: '鄂州观音阁', food: '梁子湖大闸蟹' },
  荆门市: { landmark: '明显陵', food: '钟祥蟠龙菜' },
  孝感市: { landmark: '双峰山', food: '孝感麻糖' },
  荆州市: { landmark: '荆州古城墙', food: '荆州鱼糕' },
  黄冈市: { landmark: '东坡赤壁', food: '罗田板栗' },
  咸宁市: { landmark: '九宫山', food: '咸宁桂花糕' },
  随州市: { landmark: '炎帝神农故里', food: '三里岗香菇' },
  恩施土家族苗族自治州: { landmark: '恩施大峡谷', food: '土家油茶汤' },
  仙桃市: { landmark: '沔阳小镇', food: '沔阳三蒸' },
  潜江市: { landmark: '曹禺纪念馆', food: '潜江油焖大虾' },
  天门市: { landmark: '陆羽故园', food: '天门蒸菜' },
  神农架林区: { landmark: '神农顶' },

  // ── 湖南 · 14 ─────────────────────────────────────────────────────────────
  长沙市: { landmark: '岳麓山', food: '长沙臭豆腐' },
  株洲市: { landmark: '炎帝陵', food: '攸县香干' },
  湘潭市: { landmark: '韶山毛泽东故居', food: '毛氏红烧肉' },
  衡阳市: { landmark: '南岳衡山', food: '衡阳鱼粉' },
  邵阳市: { landmark: '崀山', food: '武冈卤菜' },
  岳阳市: { landmark: '岳阳楼', food: '君山银针' },
  常德市: { landmark: '桃花源', food: '常德米粉' },
  张家界市: { landmark: '天门山', food: '三下锅' },
  益阳市: { landmark: '桃花江竹海', food: '安化黑茶' },
  郴州市: { landmark: '东江湖', food: '临武鸭' },
  永州市: { landmark: '江永女书园', food: '东安鸡' },
  怀化市: { landmark: '洪江古商城', food: '芷江鸭' },
  娄底市: { landmark: '紫鹊界梯田', food: '永丰辣酱' },
  湘西土家族苗族自治州: { landmark: '凤凰古城', food: '湘西血粑鸭' },

  // ── 广东 · 21 ─────────────────────────────────────────────────────────────
  广州市: { landmark: '广州塔', food: '广式早茶' },
  韶关市: { landmark: '丹霞山', food: '南雄板鸭' },
  深圳市: { landmark: '大鹏所城', food: '沙井蚝' },
  珠海市: { landmark: '渔女像', food: '万山海鲜' },
  汕头市: { landmark: '小公园开埠区', food: '手打牛肉丸' },
  佛山市: { landmark: '祖庙', food: '顺德双皮奶' },
  江门市: { landmark: '开平碉楼', food: '新会陈皮' },
  湛江市: { landmark: '观海长廊', food: '炭烧生蚝' },
  茂名市: { landmark: '冼太庙', food: '高州荔枝' },
  肇庆市: { landmark: '七星岩', food: '裹蒸粽' },
  惠州市: { landmark: '惠州西湖', food: '东江盐焗鸡' },
  梅州市: { landmark: '客家围龙屋', food: '梅州腌面' },
  汕尾市: { landmark: '凤山祖庙', food: '海丰小米' },
  河源市: { landmark: '万绿湖', food: '河源米粉' },
  阳江市: { landmark: '海陵岛', food: '阳江豆豉' },
  清远市: { landmark: '连州地下河', food: '清远鸡' },
  东莞市: { landmark: '可园', food: '烧鹅濑粉' },
  中山市: { landmark: '孙中山故居', food: '石岐乳鸽' },
  潮州市: { landmark: '广济桥', food: '潮州工夫茶' },
  揭阳市: { landmark: '揭阳学宫', food: '普宁豆干' },
  云浮市: { landmark: '六祖惠能故里', food: '罗定皱纱鱼腐' },

  // ── 广西 · 14 ─────────────────────────────────────────────────────────────
  南宁市: { landmark: '青秀山', food: '老友粉' },
  柳州市: { landmark: '程阳风雨桥', food: '柳州螺蛳粉' },
  桂林市: { landmark: '象鼻山', food: '桂林米粉' },
  梧州市: { landmark: '骑楼城', food: '梧州龟苓膏' },
  北海市: { landmark: '北海银滩', food: '合浦大月饼' },
  防城港市: { landmark: '万尾金滩', food: '京族风吹饼' },
  钦州市: { landmark: '三娘湾', food: '钦州大蚝' },
  贵港市: { landmark: '桂平西山', food: '桂平西山茶' },
  玉林市: { landmark: '云天文化城', food: '玉林牛巴' },
  百色市: { landmark: '大石围天坑', food: '百色芒果' },
  贺州市: { landmark: '黄姚古镇', food: '昭平茶' },
  河池市: { landmark: '巴马长寿岛', food: '环江香猪' },
  来宾市: { landmark: '忻城莫土司衙署' },
  崇左市: { landmark: '德天跨国瀑布', food: '天等指天椒' },

  // ── 海南 · 19 ─────────────────────────────────────────────────────────────
  海口市: { landmark: '骑楼老街', food: '海南粉' },
  三亚市: { landmark: '天涯海角', food: '三亚海鲜' },
  三沙市: { landmark: '永兴岛' },
  儋州市: { landmark: '东坡书院', food: '儋州米烂' },
  五指山市: { landmark: '五指山热带雨林', food: '黎家竹筒饭' },
  琼海市: { landmark: '博鳌亚洲论坛会址', food: '嘉积鸭' },
  文昌市: { landmark: '文昌航天发射场', food: '文昌鸡' },
  万宁市: { landmark: '日月湾', food: '东山羊' },
  东方市: { landmark: '俄贤岭', food: '四更烤猪' },
  定安县: { landmark: '文笔峰', food: '定安粽子' },
  屯昌县: { landmark: '木色湖', food: '屯昌黑猪' },
  澄迈县: { landmark: '福山咖啡风情镇', food: '桥头地瓜' },
  临高县: { landmark: '临高角', food: '临高乳猪' },
  白沙黎族自治县: { landmark: '白沙陨石坑', food: '白沙绿茶' },
  昌江黎族自治县: { landmark: '棋子湾' },
  乐东黎族自治县: { landmark: '尖峰岭' },
  陵水黎族自治县: { landmark: '分界洲岛', food: '陵水酸粉' },
  保亭黎族苗族自治县: { landmark: '七仙岭温泉', food: '黎家山兰酒' },
  琼中黎族苗族自治县: { landmark: '黎母山', food: '琼中绿橙' },

  // ── 重庆 · 38 区县 ────────────────────────────────────────────────────────
  万州区: { landmark: '万州大瀑布', food: '万州烤鱼' },
  涪陵区: { landmark: '白鹤梁水下博物馆', food: '涪陵榨菜' },
  渝中区: { landmark: '洪崖洞', food: '重庆火锅' },
  大渡口区: { landmark: '重庆工业文化博览园' },
  江北区: { landmark: '重庆大剧院' },
  沙坪坝区: { landmark: '磁器口古镇', food: '歌乐山辣子鸡' },
  九龙坡区: { landmark: '华岩寺' },
  南岸区: { landmark: '南山一棵树观景台', food: '南山泉水鸡' },
  北碚区: { landmark: '缙云山', food: '兼善面' },
  綦江区: { landmark: '綦江农民版画', food: '北渡鱼' },
  大足区: { landmark: '大足石刻', food: '邮亭鲫鱼' },
  渝北区: { landmark: '统景温泉' },
  巴南区: { landmark: '丰盛古镇' },
  黔江区: { landmark: '小南海地震遗址', food: '黔江鸡杂' },
  长寿区: { landmark: '长寿湖' },
  江津区: { landmark: '四面山', food: '江津米花糖' },
  合川区: { landmark: '钓鱼城', food: '合川桃片' },
  永川区: { landmark: '茶山竹海', food: '永川豆豉' },
  南川区: { landmark: '金佛山', food: '方竹笋' },
  璧山区: { landmark: '秀湖公园', food: '璧山兔' },
  铜梁区: { landmark: '铜梁龙舞' },
  潼南区: { landmark: '潼南大佛', food: '潼南柠檬' },
  荣昌区: { landmark: '荣昌陶', food: '荣昌卤鹅' },
  开州区: { landmark: '刘伯承元帅故居', food: '开州冰薄月饼' },
  梁平区: { landmark: '双桂堂', food: '梁平柚' },
  武隆区: { landmark: '天生三桥', food: '羊角豆干' },
  城口县: { landmark: '大巴山', food: '城口老腊肉' },
  丰都县: { landmark: '丰都鬼城', food: '丰都麻辣鸡' },
  垫江县: { landmark: '垫江牡丹花海' },
  忠县: { landmark: '石宝寨', food: '忠州豆腐乳' },
  云阳县: { landmark: '云阳龙缸', food: '云阳面' },
  奉节县: { landmark: '白帝城', food: '奉节脐橙' },
  巫山县: { landmark: '巫山小三峡', food: '巫山脆李' },
  巫溪县: { landmark: '红池坝' },
  石柱土家族自治县: { landmark: '黄水国家森林公园' },
  秀山土家族苗族自治县: { landmark: '洪安边城' },
  酉阳土家族苗族自治县: { landmark: '酉阳桃花源' },
  彭水苗族土家族自治县: { landmark: '阿依河', food: '彭水苕粉' },

  // ── 四川 · 21 ─────────────────────────────────────────────────────────────
  成都市: { landmark: '武侯祠', food: '成都火锅' },
  自贡市: { landmark: '自贡恐龙博物馆', food: '冷吃兔' },
  攀枝花市: { landmark: '三线建设博物馆', food: '攀枝花芒果' },
  泸州市: { landmark: '泸州老窖国宝窖池', food: '泸州黄粑' },
  德阳市: { landmark: '三星堆博物馆', food: '中江挂面' },
  绵阳市: { landmark: '越王楼', food: '绵阳米粉' },
  广元市: { landmark: '剑门关', food: '剑门豆腐' },
  遂宁市: { landmark: '遂宁中国死海' },
  内江市: { landmark: '张大千纪念馆', food: '内江牛肉面' },
  乐山市: { landmark: '乐山大佛', food: '钵钵鸡' },
  南充市: { landmark: '阆中古城', food: '川北凉粉' },
  眉山市: { landmark: '三苏祠', food: '东坡肘子' },
  宜宾市: { landmark: '蜀南竹海', food: '宜宾燃面' },
  广安市: { landmark: '邓小平故里' },
  达州市: { landmark: '巴山大峡谷', food: '东柳醪糟' },
  雅安市: { landmark: '碧峰峡', food: '雅鱼' },
  巴中市: { landmark: '光雾山', food: '通江银耳' },
  资阳市: { landmark: '安岳石刻' },
  阿坝藏族羌族自治州: { landmark: '九寨沟' },
  甘孜藏族自治州: { landmark: '稻城亚丁' },
  凉山彝族自治州: { landmark: '西昌邛海', food: '西昌火盆烧烤' },

  // ── 贵州 · 9 ──────────────────────────────────────────────────────────────
  贵阳市: { landmark: '甲秀楼', food: '丝娃娃' },
  六盘水市: { landmark: '妥乐古银杏村', food: '水城烙锅' },
  遵义市: { landmark: '遵义会议会址', food: '豆花面' },
  安顺市: { landmark: '黄果树瀑布', food: '安顺裹卷' },
  毕节市: { landmark: '织金洞', food: '威宁火腿' },
  铜仁市: { landmark: '梵净山', food: '铜仁社饭' },
  黔西南布依族苗族自治州: { landmark: '万峰林', food: '兴义羊肉粉' },
  黔东南苗族侗族自治州: { landmark: '西江千户苗寨', food: '凯里酸汤鱼' },
  黔南布依族苗族自治州: { landmark: '荔波小七孔', food: '都匀毛尖' },

  // ── 云南 · 16 ─────────────────────────────────────────────────────────────
  昆明市: { landmark: '石林', food: '过桥米线' },
  曲靖市: { landmark: '罗平油菜花海', food: '宣威火腿' },
  玉溪市: { landmark: '抚仙湖' },
  保山市: { landmark: '和顺古镇', food: '保山小粒咖啡' },
  昭通市: { landmark: '大山包黑颈鹤保护区', food: '昭通苹果' },
  丽江市: { landmark: '丽江古城', food: '腊排骨' },
  普洱市: { landmark: '景迈山古茶林', food: '普洱茶' },
  临沧市: { landmark: '翁丁佤寨', food: '滇红工夫茶' },
  楚雄彝族自治州: { landmark: '禄丰世界恐龙谷', food: '牟定腐乳' },
  红河哈尼族彝族自治州: { landmark: '元阳哈尼梯田', food: '蒙自过桥米线' },
  文山壮族苗族自治州: { landmark: '普者黑', food: '文山三七' },
  西双版纳傣族自治州: { landmark: '中科院热带植物园', food: '傣味手抓饭' },
  大理白族自治州: { landmark: '崇圣寺三塔', food: '白族三道茶' },
  德宏傣族景颇族自治州: { landmark: '一寨两国', food: '遮放贡米' },
  怒江傈僳族自治州: { landmark: '丙中洛' },
  迪庆藏族自治州: { landmark: '噶丹松赞林寺', food: '酥油茶' },

  // ── 西藏 · 7 ──────────────────────────────────────────────────────────────
  拉萨市: { landmark: '布达拉宫', food: '酥油茶' },
  日喀则市: { landmark: '扎什伦布寺' },
  昌都市: { landmark: '强巴林寺' },
  林芝市: { landmark: '南迦巴瓦峰', food: '林芝松茸' },
  山南市: { landmark: '雍布拉康' },
  那曲市: { landmark: '羌塘草原', food: '那曲冬虫夏草' },
  阿里地区: { landmark: '冈仁波齐' },

  // ── 陕西 · 10 ─────────────────────────────────────────────────────────────
  西安市: { landmark: '秦始皇兵马俑', food: '肉夹馍' },
  铜川市: { landmark: '药王山' },
  宝鸡市: { landmark: '法门寺', food: '岐山臊子面' },
  咸阳市: { landmark: '乾陵', food: 'biangbiang面' },
  渭南市: { landmark: '华山', food: '潼关肉夹馍' },
  延安市: { landmark: '宝塔山', food: '洋芋擦擦' },
  汉中市: { landmark: '石门栈道', food: '汉中热面皮' },
  榆林市: { landmark: '镇北台', food: '榆林拼三鲜' },
  安康市: { landmark: '瀛湖', food: '紫阳富硒茶' },
  商洛市: { landmark: '金丝峡', food: '商芝肉' },

  // ── 甘肃 · 14 ─────────────────────────────────────────────────────────────
  兰州市: { landmark: '中山桥', food: '兰州牛肉面' },
  嘉峪关市: { landmark: '嘉峪关关城' },
  金昌市: { landmark: '骊靬古城' },
  白银市: { landmark: '景泰黄河石林', food: '靖远羊羔肉' },
  天水市: { landmark: '麦积山石窟', food: '天水呱呱' },
  武威市: { landmark: '雷台汉墓', food: '武威三套车' },
  张掖市: { landmark: '七彩丹霞', food: '张掖搓鱼子' },
  平凉市: { landmark: '崆峒山', food: '静宁烧鸡' },
  酒泉市: { landmark: '莫高窟', food: '敦煌驴肉黄面' },
  庆阳市: { landmark: '周祖陵', food: '环县羊羔肉' },
  定西市: { landmark: '渭河源', food: '陇西腊肉' },
  陇南市: { landmark: '官鹅沟' },
  临夏回族自治州: { landmark: '炳灵寺石窟', food: '东乡手抓羊肉' },
  甘南藏族自治州: { landmark: '拉卜楞寺', food: '藏式糌粑' },

  // ── 青海 · 8 ──────────────────────────────────────────────────────────────
  西宁市: { landmark: '塔尔寺', food: '手抓羊肉' },
  海东市: { landmark: '互助土族故土园', food: '化隆拉面' },
  海北藏族自治州: { landmark: '祁连卓尔山' },
  黄南藏族自治州: { landmark: '热贡唐卡' },
  海南藏族自治州: { landmark: '青海湖二郎剑' },
  果洛藏族自治州: { landmark: '年保玉则' },
  玉树藏族自治州: { landmark: '嘉那玛尼石经城' },
  海西蒙古族藏族自治州: { landmark: '茶卡盐湖', food: '格尔木枸杞' },

  // ── 宁夏 · 5 ──────────────────────────────────────────────────────────────
  银川市: { landmark: '西夏陵', food: '银川烩羊杂' },
  石嘴山市: { landmark: '沙湖' },
  吴忠市: { landmark: '青铜峡一百零八塔', food: '吴忠早茶' },
  固原市: { landmark: '须弥山石窟' },
  中卫市: { landmark: '沙坡头', food: '中宁枸杞' },

  // ── 新疆 · 24（含兵团城市）────────────────────────────────────────────────
  乌鲁木齐市: { landmark: '国际大巴扎', food: '烤包子' },
  克拉玛依市: { landmark: '乌尔禾魔鬼城' },
  吐鲁番市: { landmark: '交河故城', food: '吐鲁番葡萄' },
  哈密市: { landmark: '哈密回王府', food: '哈密瓜' },
  昌吉回族自治州: { landmark: '天山天池' },
  博尔塔拉蒙古自治州: { landmark: '赛里木湖' },
  巴音郭楞蒙古自治州: { landmark: '巴音布鲁克九曲十八弯', food: '库尔勒香梨' },
  阿克苏地区: { landmark: '天山神秘大峡谷', food: '冰糖心苹果' },
  克孜勒苏柯尔克孜自治州: { landmark: '慕士塔格峰', food: '阿图什无花果' },
  喀什地区: { landmark: '喀什古城', food: '喀什烤包子' },
  和田地区: { landmark: '玉龙喀什河', food: '和田大枣' },
  伊犁哈萨克自治州: { landmark: '那拉提草原', food: '伊犁马肠子' },
  塔城地区: { landmark: '塔城红楼', food: '沙湾大盘鸡' },
  阿勒泰地区: { landmark: '喀纳斯湖', food: '布尔津烤鱼' },
  石河子市: { landmark: '军垦博物馆' },
  阿拉尔市: { landmark: '三五九旅屯垦纪念馆' },
  五家渠市: { landmark: '青格达湖' },
  北屯市: { landmark: '额尔齐斯河' },
  铁门关市: { landmark: '铁门关古道' },
  可克达拉市: { landmark: '草原之夜故乡' },
  // The four newest 兵团 cities have no established attraction yet, so each is
  // keyed to the geography its name comes from rather than something invented.
  图木舒克市: { landmark: '小海子水库' },
  双河市: { landmark: '博尔塔拉河' },
  昆玉市: { landmark: '昆仑山' },
  胡杨河市: { landmark: '胡杨林' },

  // ── 香港 · 18 区 ──────────────────────────────────────────────────────────
  中西区: { landmark: '太平山顶' },
  湾仔区: { landmark: '金紫荆广场' },
  东区: { landmark: '香港海防博物馆' },
  南区: { landmark: '浅水湾' },
  油尖旺区: { landmark: '尖沙咀钟楼' },
  深水埗区: { landmark: '李郑屋汉墓博物馆' },
  九龙城区: { landmark: '九龙寨城公园' },
  黄大仙区: { landmark: '黄大仙祠' },
  观塘区: { landmark: '观塘海滨花园' },
  荃湾区: { landmark: '三栋屋博物馆' },
  屯门区: { landmark: '青山禅院' },
  元朗区: { landmark: '屏山文物径' },
  北区: { landmark: '沙头角中英街' },
  大埔区: { landmark: '香港铁路博物馆' },
  西贡区: { landmark: '万宜水库', food: '西贡海鲜' },
  沙田区: { landmark: '沙田车公庙', food: '沙田乳鸽' },
  葵青区: { landmark: '葵青货柜码头' },
  离岛区: { landmark: '昂坪天坛大佛', food: '长洲平安包' },

  // ── 澳门 · 8 堂区 ─────────────────────────────────────────────────────────
  花地玛堂区: { landmark: '关闸牌坊' },
  花王堂区: { landmark: '大三巴牌坊' },
  望德堂区: { landmark: '望德圣母堂' },
  大堂区: { landmark: '澳门旅游塔' },
  风顺堂区: { landmark: '妈阁庙' },
  嘉模堂区: { landmark: '龙环葡韵' },
  路凼填海区: { landmark: '澳门威尼斯人' },
  圣方济各堂区: { landmark: '圣方济各堂', food: '路环安德鲁蛋挞' },
}

export type SignatureEntry = {
  name: string
  /** Region whose glyph draws this entry (a city borrows its province's). */
  glyph: string
  /** Scenic spot, historic building or heritage craft — drawn first. */
  landmark?: string
  food?: string
}

/**
 * Signature of the region the pointer is over. `province` is the drilled-down
 * province, or null at the national level: it supplies the glyph, since cities
 * borrow their province's, and the fallback for the few names not covered here,
 * so pointing at one of those still says something true about the area instead
 * of collapsing the island mid-gesture. Null when nothing is known at all.
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
