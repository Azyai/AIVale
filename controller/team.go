package controller

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// ---- User APIs ----

type TeamSelfResponse struct {
	Team        *model.Team             `json:"team"`
	Role        string                  `json:"role"`
	Quota       int64                   `json:"quota"`
	InviteCode  string                  `json:"invite_code"` // owner only; empty for members
	Members     []model.TeamMemberInfo  `json:"members"`
	TokenCount  int64                   `json:"token_count"`
	Subscriptions []model.UserSubscription `json:"subscriptions"`
}

// GetTeamSelf returns the caller's team with members, wallet balance, and
// active team subscriptions. Owners additionally see the invite code.
func GetTeamSelf(c *gin.Context) {
	userId := c.GetInt("id")
	team, member, err := model.GetUserTeam(userId)
	if err != nil {
		common.ApiSuccess(c, nil)
		return
	}
	members, err := model.GetTeamMembers(team.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	tokenCount, err := model.CountTeamTokens(team.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	subs, err := model.GetActiveTeamSubscriptions(team.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	inviteCode := ""
	if member != nil && member.Role == model.TeamRoleOwner {
		inviteCode = team.InviteCode
	}
	common.ApiSuccess(c, &TeamSelfResponse{
		Team:          team,
		Role:          member.Role,
		Quota:         team.Quota,
		InviteCode:    inviteCode,
		Members:       members,
		TokenCount:    tokenCount,
		Subscriptions: subs,
	})
}

type UpdateTeamNameRequest struct {
	Name string `json:"name"`
}

func UpdateTeamName(c *gin.Context) {
	userId := c.GetInt("id")
	var req UpdateTeamNameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	team, _, err := model.GetUserTeam(userId)
	if err != nil {
		common.ApiErrorMsg(c, "您当前不在任何团队中")
		return
	}
	if err := model.UpdateTeamName(team.Id, userId, req.Name); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func RefreshTeamInviteCode(c *gin.Context) {
	userId := c.GetInt("id")
	team, _, err := model.GetUserTeam(userId)
	if err != nil {
		common.ApiErrorMsg(c, "您当前不在任何团队中")
		return
	}
	code, err := model.RegenerateTeamInviteCode(team.Id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"invite_code": code})
}

type JoinTeamRequest struct {
	InviteCode string `json:"invite_code"`
}

func JoinTeam(c *gin.Context) {
	userId := c.GetInt("id")
	var req JoinTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.InviteCode) == "" {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	team, err := model.JoinTeamByInviteCode(userId, strings.TrimSpace(req.InviteCode))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordLog(userId, model.LogTypeManage, "加入团队成功，团队: "+team.Name)
	common.ApiSuccess(c, gin.H{"team_id": team.Id, "team_name": team.Name})
}

func LeaveTeam(c *gin.Context) {
	userId := c.GetInt("id")
	if err := model.LeaveTeam(userId); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordLog(userId, model.LogTypeManage, "已退出团队")
	common.ApiSuccess(c, nil)
}

func RemoveTeamMember(c *gin.Context) {
	ownerId := c.GetInt("id")
	memberUserId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || memberUserId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	team, _, err := model.GetUserTeam(ownerId)
	if err != nil {
		common.ApiErrorMsg(c, "您当前不在任何团队中")
		return
	}
	if err := model.RemoveTeamMember(team.Id, ownerId, memberUserId); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordLog(memberUserId, model.LogTypeManage, "您已被移出团队 "+team.Name)
	common.ApiSuccess(c, nil)
}

// ---- Admin APIs ----

type AdminTeamListQuery struct {
	Page    int    `form:"page"`
	PageSize int   `form:"page_size"`
	Keyword string `form:"keyword"`
}

func AdminListTeams(c *gin.Context) {
	var query AdminTeamListQuery
	_ = c.ShouldBindQuery(&query)
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 100 {
		query.PageSize = 20
	}
	teams, err := model.AdminListTeams((query.Page-1)*query.PageSize, query.PageSize, query.Keyword)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, teams)
}

type AdminUpdateTeamQuotaRequest struct {
	// Delta in quota units (positive adds, negative deducts)
	Delta int64 `json:"delta"`
}

func AdminUpdateTeamQuota(c *gin.Context) {
	teamId, err := strconv.Atoi(c.Param("id"))
	if err != nil || teamId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	var req AdminUpdateTeamQuotaRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Delta == 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	team, err := model.GetTeamById(teamId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var updateErr error
	if req.Delta > 0 {
		updateErr = model.IncreaseTeamQuota(team.Id, req.Delta)
	} else {
		updateErr = model.DecreaseTeamQuota(team.Id, -int(req.Delta))
	}
	if updateErr != nil {
		common.ApiError(c, updateErr)
		return
	}
	newQuota, _ := model.GetTeamQuota(team.Id)
	model.RecordLog(team.OwnerUserId, model.LogTypeManage, "管理员调整了团队钱包额度")
	common.ApiSuccess(c, gin.H{"quota": newQuota})
}

func AdminGetTeamDetail(c *gin.Context) {
	teamId, err := strconv.Atoi(c.Param("id"))
	if err != nil || teamId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	team, err := model.GetTeamById(teamId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	members, err := model.GetTeamMembers(team.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	subs, err := model.GetActiveTeamSubscriptions(team.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	tokens, err := model.GetTeamTokens(team.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, t := range tokens {
		t.Clean()
	}
	common.ApiSuccess(c, gin.H{
		"team":          team,
		"members":       members,
		"subscriptions": subs,
		"tokens":        tokens,
	})
}
