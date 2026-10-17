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
import { useEffect, useState } from 'react'

import type { SignatureEntry } from './signatures'

/* Province landmarks as line-art glyphs assembled from plain SVG primitives
 * (strokes + circles), one per province-level region. Keys must match the
 * GeoJSON / catalog labels. Names are proper nouns, so they are not run
 * through i18n. */
type Glyph = { d: string; circles?: [number, number, number][] }

const GLYPHS: Record<string, Glyph> = {
  // 天坛 triple-eave circular roof
  北京市: {
    d: 'M4 21h16 M6 21v-3h12v3 M5 18q7-4 14 0 M7 15q5-3 10 0 M9 12q3-2 6 0 M12 12V9',
  },
  // 天津之眼 ferris wheel on an A-frame
  天津市: {
    d: 'M6 21h12 M8 21l4-7 4 7 M12 4v12 M6 10h12 M7.8 5.8l8.4 8.4 M16.2 5.8l-8.4 8.4',
    circles: [[12, 10, 6]],
  },
  // 赵州桥 open-spandrel arch
  河北省: { d: 'M3 19h18 M4 19q8-11 16 0 M9 19q3-4 6 0 M3 15.5h18' },
  // 应县木塔 stacked eaves
  山西省: {
    d: 'M6 21h12 M7 21v-3h10v3 M5 18h14 M8 18v-3h8v3 M6 15h12 M9 15v-3h6v3 M7 12h10 M10 12V9h4v3 M12 9V6',
  },
  // 蒙古包 yurt dome
  内蒙古自治区: {
    d: 'M4 21h16 M5 21v-6h14v6 M5 15q7-7 14 0 M10 21v-4h4v4 M12 8.5V7',
  },
  // 沈阳故宫 upturned-eave palace
  辽宁省: {
    d: 'M4 21h16 M6 21v-6h12v6 M3.5 15q8.5-6 17 0 M9 15v-4h6v4 M8 11q4-3 8 0 M12 11V8',
  },
  // 长白山 crater lake peaks
  吉林省: { d: 'M3 20h18 M5 20l5-9 3 5 2-3 4 7 M8.5 14.5h3' },
  // 圣索菲亚教堂 onion dome
  黑龙江省: {
    d: 'M5 21h14 M6 21v-8h12v8 M12 4q4 3.5 3 6.5H9Q8 7.5 12 4 M12 4V2 M10 21v-4h4v4 M8.5 13v-2 M15.5 13v-2',
  },
  // 东方明珠 spheres on splayed legs
  上海市: {
    d: 'M6 21h12 M8.5 21l2.5-5 M15.5 21l-2.5-5 M12 10.5v2.5 M12 5.5V2',
    circles: [
      [12, 8, 2.4],
      [12, 16, 3.2],
    ],
  },
  // 苏州园林 pavilion
  江苏省: {
    d: 'M4 21h16 M6.5 21v-7 M17.5 21v-7 M4.5 14q7.5-6 15 0 M4.5 14q-1-.4-1.6-1.4 M19.5 14q1-.4 1.6-1.4 M12 14V8',
  },
  // 雷峰塔 pagoda
  浙江省: {
    d: 'M6 21h12 M7 21v-3h10v3 M6 18h12 M8 18v-3h8v3 M7 15h10 M9 15v-3h6v3 M8 12h8 M12 12V9 M10.5 9h3',
  },
  // 徽派马头墙 stepped gable
  安徽省: {
    d: 'M3 21h18 M4.5 21V10h3v3h3v3h3v-3h3v-3h3v11 M4.5 10l1.5-1.5 M19.5 10l-1.5-1.5',
  },
  // 客家土楼 round earthen building
  福建省: {
    d: 'M5 13q7-6 14 0 M10.5 20v-4h3v4 M8 16.5h1.5 M14.5 16.5H16 M12 10.5V9',
    circles: [[12, 14, 7]],
  },
  // 滕王阁 tiered river tower
  江西省: {
    d: 'M5 21h14 M6 21v-4h12v4 M4 17q8-4 16 0 M7 17v-3h10v3 M5 14q7-4 14 0 M9 14v-3h6v3 M7 11q5-3 10 0 M12 11V8',
  },
  // 曲阜牌坊 paifang gate
  山东省: {
    d: 'M4 21h16 M6 21V8 M18 21V8 M4 8h16 M4 8q2-2.5 4-2.5 M20 8q-2-2.5-4-2.5 M6 11.5h12 M9 8V5h6v3',
  },
  // 嵩岳寺塔 dense-eave pagoda
  河南省: {
    d: 'M7 21h10 M8 21v-2h8v2 M7 19h10 M8 19v-2h8v2 M7 17h10 M8 17v-2h8v2 M7 15h10 M9 15v-2h6v2 M8 13h8 M10 13v-2h4v2 M9 11h6 M12 11V8',
  },
  // 黄鹤楼 crane tower
  湖北省: {
    d: 'M5 21h14 M6 21v-4h12v4 M4 17q8-4 16 0 M4 17q-1 0-1.6-1 M20 17q1 0 1.6-1 M8 17v-3h8v3 M6 14q6-4 12 0 M10 14v-3h4v3 M8 11q4-3 8 0 M12 11V8',
  },
  // 岳阳楼 helmet-roof tower
  湖南省: {
    d: 'M5 21h14 M6 21v-5h12v5 M5 16q7-6 14 0 M5 16q-1 0-1.6-1 M19 16q1 0 1.6-1 M9 16v-3h6v3 M12 10V7',
  },
  // 广州塔 waisted lattice tower
  广东省: {
    d: 'M6 21h12 M8 21c3-5 3-9 1.5-14 M16 21c-3-5-3-9-1.5-14 M9.5 8h5 M9 12h6 M8.5 16h7 M12 7V3',
  },
  // 桂林日月双塔
  广西壮族自治区: {
    d: 'M4 21h16 M6 21v-8h4v8 M5 13h6 M8 13V9 M6.5 9h3 M14 21V11h4v10 M13 11h6 M16 11V6 M14.5 6h3',
  },
  // 海口钟楼 clock tower
  海南省: {
    d: 'M6 21h12 M7 21V8h10v13 M7 8q5-4 10 0 M12 4V2 M12 11v2.5l1.8 1',
    circles: [[12, 13.5, 2.2]],
  },
  // 解放碑 monument
  重庆市: { d: 'M8 21h8 M9 21V6h6v15 M9 10h6 M10 6V4h4v2 M12 4V2' },
  // 安顺廊桥 covered bridge
  四川省: {
    d: 'M3 19h18 M5 19v-5h14v5 M4 14q8-5 16 0 M8 19q4-4 8 0 M8 14v-2.5h8V14',
  },
  // 甲秀楼 pavilion on an arch
  贵州省: {
    d: 'M3 20h18 M6 20q6-6 12 0 M8 14h8v-3H8z M7 11q5-4 10 0 M12 11V8 M9 20v-2.5 M15 20v-2.5',
  },
  // 崇圣寺三塔
  云南省: {
    d: 'M4 21h16 M6 21v-9h3v9 M5 12h5 M7.5 12V8 M6 8h3 M15 21v-9h3v9 M14 12h5 M16.5 12V8 M15 8h3 M10.5 21v-6h3v6 M10 15h5 M12 15V11',
  },
  // 布达拉宫 hill fortress
  西藏自治区: {
    d: 'M4 21h16 M5 21v-6h14v6 M7 15V9h10v6 M9 9V6h6v3 M6 18h12 M10 12h4 M12 6V4',
  },
  // 大雁塔 square pagoda
  陕西省: {
    d: 'M7 21h10 M8 21v-4h8v4 M7 17h10 M8.5 17v-3h7v3 M8 14h8 M9.5 14v-3h5v3 M9 11h6 M10.5 11V8h3v3 M12 8V5',
  },
  // 嘉峪关 fort gate
  甘肃省: {
    d: 'M3 21h18 M4 21v-6h16v6 M9 15V9h6v6 M8 9q4-3 8 0 M11 21v-4h2v4 M12 6V4',
  },
  // 塔尔寺 monastery roof
  青海省: {
    d: 'M4 21h16 M6 21v-6h12v6 M5 15q7-4 14 0 M9 15v-4h6v4 M8 11q4-3 8 0 M12 11V8',
  },
  // 西夏王陵 mound
  宁夏回族自治区: {
    d: 'M4 21h16 M6 21q1-9 6-9t6 9 M10 21v-5h4v5 M12 12V10',
  },
  // 国际大巴扎 crescent dome
  新疆维吾尔自治区: {
    d: 'M5 21h14 M6 21v-7h12v7 M6 14q6-7 12 0 M10 21v-3.5q2-2 4 0V21 M12 7V5',
    circles: [[12, 4, 1]],
  },
  // 台北101 segmented tower
  台湾省: {
    d: 'M8 21h8 M9 21V5h6v16 M9 9h6 M9 13h6 M9 17h6 M8 5h8 M12 5V2 M8 9l1.2-4 M16 9l-1.2-4',
  },
  // 中银大厦 angular prism
  香港特别行政区: { d: 'M7 21V6l5 4V3l5 5v13 M7 21h10 M7 13l5 4 5-4' },
  // 大三巴牌坊 facade
  澳门特别行政区: {
    d: 'M6 21h12 M7 21V6h10v15 M7 10h10 M7 14h10 M9 21v-4h2v4 M13 21v-4h2v4 M9 6V4h6v2 M12 4V2 M10 10v4 M14 10v4',
  },
}

// Generic pavilion for regions without a dedicated glyph.
const FALLBACK: Glyph = {
  d: 'M4 21h16 M6.5 21v-7 M17.5 21v-7 M4.5 14q7.5-6 15 0 M12 14V8',
}

export function LandmarkGlyph(props: { name: string; className?: string }) {
  const glyph = GLYPHS[props.name] ?? FALLBACK
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      className={props.className}
    >
      <path d={glyph.d} />
      {glyph.circles?.map(([cx, cy, r]) => (
        <circle key={`${cx}:${cy}:${r}`} cx={cx} cy={cy} r={r} />
      ))}
    </svg>
  )
}

/**
 * Dynamic-island capsule floating over the map. Collapsed it is a slim hint
 * pill; once the map is zoomed far enough that place names are readable (or a
 * province has been opened up), it expands and cycles the signature landmark
 * and dish of the regions in view — the reveal is driven by the map's own zoom,
 * so the island only talks about places you can actually see.
 */
export function LandmarkIsland(props: {
  entries: SignatureEntry[]
  expanded: boolean
  hint: string
}) {
  const [index, setIndex] = useState(0)
  const count = props.entries.length

  useEffect(() => {
    if (count < 2 || !props.expanded) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count)
    }, 4200)
    return () => window.clearInterval(id)
  }, [count, props.expanded])

  const current = count > 0 ? props.entries[index % count] : undefined

  return (
    <div
      className='bsc-island'
      data-expanded={props.expanded ? 'true' : 'false'}
      title={
        current
          ? `${current.name} · ${current.landmark} · ${current.food}`
          : props.hint
      }
    >
      <span className='bsc-island-glyph'>
        {current ? <LandmarkGlyph name={current.glyph} /> : null}
      </span>
      <span className='bsc-island-collapsed'>{props.hint}</span>
      {current ? (
        // Keyed so each new region replays the slide-in, the way an island
        // morphs rather than swaps its content.
        <span key={current.name} className='bsc-island-expanded'>
          <b className='bsc-island-name'>{current.name}</b>
          <span className='bsc-island-tags'>
            <span className='bsc-island-tag'>{current.landmark}</span>
            <span className='bsc-island-tag'>{current.food}</span>
          </span>
        </span>
      ) : null}
    </div>
  )
}
