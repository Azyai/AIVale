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
import { api } from '@/lib/api'

import type {
  ApiResponse,
  TeamMemberInfo,
  TeamSelfData,
  TeamSubscriptionInfo,
  JoinTeamRequest,
  UpdateTeamNameRequest,
} from './types'

// ============================================================================
// Team APIs (user)
// ============================================================================

export async function getTeamSelf(): Promise<ApiResponse<TeamSelfData | null>> {
  const res = await api.get('/api/team/self')
  return res.data
}

export async function updateTeamName(
  data: UpdateTeamNameRequest
): Promise<ApiResponse> {
  const res = await api.put('/api/team/self/name', data)
  return res.data
}

export async function refreshTeamInviteCode(): Promise<
  ApiResponse<{ invite_code: string }>
> {
  const res = await api.post('/api/team/self/invite/refresh')
  return res.data
}

export async function leaveTeam(): Promise<ApiResponse> {
  const res = await api.post('/api/team/self/leave')
  return res.data
}

export async function removeTeamMember(
  userId: number
): Promise<ApiResponse> {
  const res = await api.delete(`/api/team/self/members/${userId}`)
  return res.data
}

export async function joinTeam(
  data: JoinTeamRequest
): Promise<ApiResponse<{ team_id: number; team_name: string }>> {
  const res = await api.post('/api/team/join', data)
  return res.data
}

// ============================================================================
// Team APIs (admin)
// ============================================================================

export async function adminListTeams(params?: {
  page?: number
  page_size?: number
  keyword?: string
}): Promise<ApiResponse<AdminTeamSummary[]>> {
  const res = await api.get('/api/team/admin/teams', { params })
  return res.data
}

export async function adminUpdateTeamQuota(
  teamId: number,
  delta: number
): Promise<ApiResponse<{ quota: number }>> {
  const res = await api.put(`/api/team/admin/teams/${teamId}/quota`, {
    delta,
  })
  return res.data
}

export async function adminGetTeamDetail(
  teamId: number
): Promise<ApiResponse<AdminTeamDetail>> {
  const res = await api.get(`/api/team/admin/teams/${teamId}`)
  return res.data
}

export interface AdminTeamSummary {
  id: number
  name: string
  owner_user_id: number
  invite_code: string
  quota: number
  created_at: number
  member_count: number
  token_count: number
  active_sub_count: number
}

export interface AdminTeamDetail {
  team: AdminTeamSummary & { OwnerUserId: number }
  members: TeamMemberInfo[]
  subscriptions: TeamSubscriptionInfo[]
  tokens: { id: number; name: string; user_id: number; status: number }[]
}

// Re-exported types used by admin views
export type { TeamMemberInfo, TeamSubscriptionInfo }
