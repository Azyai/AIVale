/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { SVGProps } from 'react'

import { cn } from '@/lib/utils'

export function IconFeishu({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      role='img'
      viewBox='0 0 24 24'
      xmlns='http://www.w3.org/2000/svg'
      width='20'
      height='20'
      className={cn('fill-current', className)}
      {...props}
    >
      <title>Feishu</title>
      <path
        clipRule='evenodd'
        d='M14.516 2.003c.563 0 .869.298 1.224.766a13.925 13.925 0 012.374 4.869c.014.05.022.116.027.195a9.97 9.97 0 01.703-.186c1.84-.396 3.61-.193 5.31.61a.04.04 0 01.019.047.04.04 0 01-.01.015 7.74 7.74 0 00-1.405 1.917c-.029.055-.543 1.081-1.544 3.079-.212.422-.474.855-.785 1.297a6.835 6.835 0 01-.61.921c-1.227 1.574-2.691 2.855-4.424 3.81A14.181 14.181 0 011.69 19.32c-.363-.202-.82-.453-1.141-.748-.315-.29-.367-.663-.366-1.12L.175 8.08c0-.104.005-.201.015-.291a.162.162 0 01.162-.142c.058.001.116.031.173.091 2.595 2.735 5.561 4.905 8.899 6.51.039.018.075.03.11.036a14.334 14.334 0 003.024-2.158.378.378 0 00.077-.096 58.172 58.172 0 00-.977-1.63 30.362 30.362 0 00-7.474-7.995c-.104-.078-.222-.2-.13-.324A.196.196 0 014.22 2c2.782.004 6.215.005 10.297.003z'
      />
    </svg>
  )
}
