package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// Team roles
const (
	TeamRoleOwner  = "owner"
	TeamRoleMember = "member"
)

// Team is a multi-tenant billing scope. Team tokens bill the team's shared
// resources (team subscription pool + team wallet) and never the personal
// wallet of the requesting member.
type Team struct {
	Id          int    `json:"id"`
	Name        string `json:"name" gorm:"type:varchar(128);not null"`
	OwnerUserId int    `json:"owner_user_id" gorm:"index;not null"`
	InviteCode  string `json:"invite_code" gorm:"type:varchar(64);uniqueIndex"`
	// Team wallet balance in quota units; may go negative under postpay debt,
	// mirroring the personal wallet semantics.
	Quota     int64 `json:"quota" gorm:"type:bigint;not null;default:0"`
	CreatedAt int64 `json:"created_at" gorm:"bigint"`
	UpdatedAt int64 `json:"updated_at" gorm:"bigint"`
}

func (t *Team) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	t.CreatedAt = now
	t.UpdatedAt = now
	return nil
}

func (t *Team) BeforeUpdate(tx *gorm.DB) error {
	t.UpdatedAt = common.GetTimestamp()
	return nil
}

// TeamMember links a user to a team. A user belongs to at most one team
// (unique index on user_id).
type TeamMember struct {
	Id       int    `json:"id"`
	TeamId   int    `json:"team_id" gorm:"index;not null"`
	UserId   int    `json:"user_id" gorm:"uniqueIndex;not null"`
	Role     string `json:"role" gorm:"type:varchar(16);default:'member'"`
	JoinedAt int64  `json:"joined_at" gorm:"bigint"`
}

func (m *TeamMember) BeforeCreate(tx *gorm.DB) error {
	if m.JoinedAt == 0 {
		m.JoinedAt = common.GetTimestamp()
	}
	return nil
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

func GetTeamById(id int) (*Team, error) {
	if id <= 0 {
		return nil, errors.New("invalid team id")
	}
	var team Team
	if err := DB.Where("id = ?", id).First(&team).Error; err != nil {
		return nil, err
	}
	return &team, nil
}

func GetTeamByInviteCode(code string) (*Team, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, errors.New("invite code is empty")
	}
	var team Team
	if err := DB.Where("invite_code = ?", code).First(&team).Error; err != nil {
		return nil, err
	}
	return &team, nil
}

// GetUserTeam returns the team the user belongs to plus their membership.
func GetUserTeam(userId int) (*Team, *TeamMember, error) {
	if userId <= 0 {
		return nil, nil, errors.New("invalid userId")
	}
	var member TeamMember
	if err := DB.Where("user_id = ?", userId).First(&member).Error; err != nil {
		return nil, nil, err
	}
	team, err := GetTeamById(member.TeamId)
	if err != nil {
		return nil, nil, err
	}
	return team, &member, nil
}

type TeamMemberInfo struct {
	TeamMember
	Username string `json:"username"`
	DisplayName string `json:"display_name"`
}

func GetTeamMembers(teamId int) ([]TeamMemberInfo, error) {
	if teamId <= 0 {
		return nil, errors.New("invalid team id")
	}
	var members []TeamMember
	if err := DB.Where("team_id = ?", teamId).Order("joined_at asc, id asc").Find(&members).Error; err != nil {
		return nil, err
	}
	result := make([]TeamMemberInfo, 0, len(members))
	for _, m := range members {
		info := TeamMemberInfo{TeamMember: m}
		var user User
		if err := DB.Select("username", "display_name").Where("id = ?", m.UserId).First(&user).Error; err == nil {
			info.Username = user.Username
			info.DisplayName = user.DisplayName
		}
		result = append(result, info)
	}
	return result, nil
}

// ---------------------------------------------------------------------------
// Team lifecycle
// ---------------------------------------------------------------------------

func generateTeamInviteCode() string {
	return fmt.Sprintf("TM%s%s", common.GetRandomString(4), common.GetRandomString(4))
}

// CreateTeamWithOwnerTx creates a team and adds the creator as owner member.
func CreateTeamWithOwnerTx(tx *gorm.DB, ownerUserId int, name string) (*Team, error) {
	if tx == nil {
		return nil, errors.New("tx is nil")
	}
	if ownerUserId <= 0 {
		return nil, errors.New("invalid ownerUserId")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = fmt.Sprintf("Team-%d", ownerUserId)
	}
	team := &Team{
		Name:        name,
		OwnerUserId: ownerUserId,
		InviteCode:  generateTeamInviteCode(),
	}
	if err := tx.Create(team).Error; err != nil {
		return nil, err
	}
	member := &TeamMember{
		TeamId:   team.Id,
		UserId:   ownerUserId,
		Role:     TeamRoleOwner,
		JoinedAt: common.GetTimestamp(),
	}
	if err := tx.Create(member).Error; err != nil {
		return nil, err
	}
	return team, nil
}

// ResolveTeamForSubscriptionTx returns the team a team-plan purchase binds
// to, creating one when the buyer owns no team. A buyer that is only a member
// of someone else's team cannot purchase (they should ask their owner).
func ResolveTeamForSubscriptionTx(tx *gorm.DB, userId int, defaultName string) (*Team, error) {
	var member TeamMember
	err := tx.Where("user_id = ?", userId).First(&member).Error
	if err == nil {
		var team Team
		if err := tx.Where("id = ?", member.TeamId).First(&team).Error; err != nil {
			return nil, err
		}
		if team.OwnerUserId != userId {
			return nil, errors.New("您已是其他团队的成员，请让团队所有者购买或先退出当前团队")
		}
		return &team, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	return CreateTeamWithOwnerTx(tx, userId, defaultName)
}

func UpdateTeamName(teamId int, ownerId int, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("团队名称不能为空")
	}
	if len(name) > 128 {
		return errors.New("团队名称过长")
	}
	result := DB.Model(&Team{}).
		Where("id = ? AND owner_user_id = ?", teamId, ownerId).
		Update("name", name)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("无权修改该团队")
	}
	return nil
}

func RegenerateTeamInviteCode(teamId int, ownerId int) (string, error) {
	code := generateTeamInviteCode()
	result := DB.Model(&Team{}).
		Where("id = ? AND owner_user_id = ?", teamId, ownerId).
		Update("invite_code", code)
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected != 1 {
		return "", errors.New("无权操作该团队")
	}
	return code, nil
}

// JoinTeamByInviteCode adds the user to the team referenced by the code.
// One team per user; owners cannot join another team without leaving first.
func JoinTeamByInviteCode(userId int, code string) (*Team, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	team, err := GetTeamByInviteCode(code)
	if err != nil {
		return nil, errors.New("邀请码无效")
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var existing TeamMember
		err := tx.Where("user_id = ?", userId).First(&existing).Error
		if err == nil {
			if existing.TeamId == team.Id {
				return errors.New("您已在该团队中")
			}
			return errors.New("您已加入其他团队，请先退出")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		member := &TeamMember{
			TeamId:   team.Id,
			UserId:   userId,
			Role:     TeamRoleMember,
			JoinedAt: common.GetTimestamp(),
		}
		return tx.Create(member).Error
	})
	if err != nil {
		return nil, err
	}
	return team, nil
}

// LeaveTeam removes the user's membership and disables their team tokens.
// Team owners cannot leave (transfer ownership or dissolve the team first).
func LeaveTeam(userId int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var member TeamMember
		if err := tx.Where("user_id = ?", userId).First(&member).Error; err != nil {
			return errors.New("您当前不在任何团队中")
		}
		if member.Role == TeamRoleOwner {
			return errors.New("团队所有者不能退出团队")
		}
		if err := tx.Where("id = ?", member.Id).Delete(&TeamMember{}).Error; err != nil {
			return err
		}
		return disableTeamTokensTx(tx, member.TeamId, userId)
	})
}

// RemoveTeamMember removes a member (owner only) and disables their team tokens.
func RemoveTeamMember(teamId int, ownerId int, memberUserId int) error {
	if memberUserId == ownerId {
		return errors.New("不能移除团队所有者")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var member TeamMember
		if err := tx.Where("team_id = ? AND user_id = ?", teamId, memberUserId).First(&member).Error; err != nil {
			return errors.New("该用户不在团队中")
		}
		var team Team
		if err := tx.Where("id = ? AND owner_user_id = ?", teamId, ownerId).First(&team).Error; err != nil {
			return errors.New("无权操作该团队")
		}
		if err := tx.Where("id = ?", member.Id).Delete(&TeamMember{}).Error; err != nil {
			return err
		}
		return disableTeamTokensTx(tx, teamId, memberUserId)
	})
}

// ---------------------------------------------------------------------------
// Team tokens
// ---------------------------------------------------------------------------

func disableTeamTokensTx(tx *gorm.DB, teamId int, userId int) error {
	if tx == nil || teamId <= 0 || userId <= 0 {
		return nil
	}
	return tx.Model(&Token{}).
		Where("team_id = ? AND user_id = ? AND status = ?", teamId, userId, common.TokenStatusEnabled).
		Update("status", common.TokenStatusDisabled).Error
}

// GetTeamTokens returns all tokens scoped to a team.
func GetTeamTokens(teamId int) ([]*Token, error) {
	if teamId <= 0 {
		return nil, errors.New("invalid team id")
	}
	var tokens []*Token
	err := DB.Where("team_id = ?", teamId).Order("id desc").Find(&tokens).Error
	return tokens, err
}

// CountTeamTokens returns the number of tokens scoped to a team.
func CountTeamTokens(teamId int) (int64, error) {
	if teamId <= 0 {
		return 0, errors.New("invalid team id")
	}
	var count int64
	err := DB.Model(&Token{}).Where("team_id = ?", teamId).Count(&count).Error
	return count, err
}

// ---------------------------------------------------------------------------
// Team wallet quota operations
// ---------------------------------------------------------------------------

// Mirrors personal wallet semantics: reserve is an atomic conditional
// deduction; decrease is unconditional (postpay debt may go negative).
// Team quota is DB-direct — teams are far fewer than users and do not need
// the Redis cache layer.

func GetTeamQuota(teamId int) (int64, error) {
	if teamId <= 0 {
		return 0, errors.New("invalid team id")
	}
	var quota int64
	err := DB.Model(&Team{}).Where("id = ?", teamId).Select("quota").Scan(&quota).Error
	return quota, err
}

func reserveTeamQuotaDB(teamId int, quota int64) (bool, error) {
	result := DB.Model(&Team{}).
		Where("id = ? AND quota >= ?", teamId, quota).
		Update("quota", gorm.Expr("quota - ?", quota))
	return result.RowsAffected == 1, result.Error
}

func TryReserveTeamQuota(teamId int, quota int64) (bool, error) {
	if quota < 0 {
		return false, errors.New("quota 不能为负数！")
	}
	if quota == 0 {
		return true, nil
	}
	return reserveTeamQuotaDB(teamId, quota)
}

func IncreaseTeamQuota(teamId int, quota int64) error {
	if quota == 0 {
		return nil
	}
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	return DB.Model(&Team{}).Where("id = ?", teamId).
		Update("quota", gorm.Expr("quota + ?", quota)).Error
}

// DecreaseTeamQuota deducts unconditionally; the balance may go negative
// (postpay debt), consistent with DecreaseUserQuota for personal wallets.
func DecreaseTeamQuota(teamId int, quota int) error {
	if quota == 0 {
		return nil
	}
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	return DB.Model(&Team{}).Where("id = ?", teamId).
		Update("quota", gorm.Expr("quota - ?", quota)).Error
}

func IncreaseTeamQuotaTx(tx *gorm.DB, teamId int, quota int64) error {
	if quota == 0 {
		return nil
	}
	return tx.Model(&Team{}).Where("id = ?", teamId).
		Update("quota", gorm.Expr("quota + ?", quota)).Error
}

// ---------------------------------------------------------------------------
// Team subscriptions
// ---------------------------------------------------------------------------

// GetActiveTeamSubscriptions returns active subscriptions bound to a team.
func GetActiveTeamSubscriptions(teamId int) ([]UserSubscription, error) {
	if teamId <= 0 {
		return nil, errors.New("invalid team id")
	}
	now := common.GetTimestamp()
	var subs []UserSubscription
	err := DB.Where("team_id = ? AND status = ? AND end_time > ?", teamId, "active", now).
		Order("end_time desc, id desc").
		Find(&subs).Error
	return subs, err
}

// HasActiveTeamSubscription reports whether the team has any active subscription.
func HasActiveTeamSubscription(teamId int) (bool, error) {
	if teamId <= 0 {
		return false, errors.New("invalid team id")
	}
	now := common.GetTimestamp()
	var count int64
	if err := DB.Model(&UserSubscription{}).
		Where("team_id = ? AND status = ? AND end_time > ?", teamId, "active", now).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// TeamActiveSubscriptionsAllowWalletOverflow reports whether team wallet may
// be used after the team subscription quota is exhausted. A single active
// team subscription that disallows overflow blocks the fallback.
func TeamActiveSubscriptionsAllowWalletOverflow(teamId int) (bool, error) {
	if teamId <= 0 {
		return false, errors.New("invalid team id")
	}
	now := common.GetTimestamp()
	var strictCount int64
	if err := DB.Model(&UserSubscription{}).
		Where("team_id = ? AND status = ? AND end_time > ? AND allow_wallet_overflow = ?",
			teamId, "active", now, false).
		Count(&strictCount).Error; err != nil {
		return false, err
	}
	return strictCount == 0, nil
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

type AdminTeamSummary struct {
	Team
	MemberCount        int64 `json:"member_count"`
	TokenCount         int64 `json:"token_count"`
	ActiveSubCount     int64 `json:"active_sub_count"`
}

func AdminListTeams(startIdx int, num int, keyword string) ([]AdminTeamSummary, error) {
	query := DB.Model(&Team{})
	keyword = strings.TrimSpace(keyword)
	if keyword != "" {
		escaped := strings.ReplaceAll(keyword, "!", "!!")
		escaped = strings.ReplaceAll(escaped, "_", "!_")
		escaped = strings.ReplaceAll(escaped, "%", "!%")
		query = query.Where("name LIKE ? OR invite_code LIKE ?", "%"+escaped+"%", "%"+escaped+"%")
	}
	var teams []Team
	if err := query.Order("id desc").Limit(num).Offset(startIdx).Find(&teams).Error; err != nil {
		return nil, err
	}
	result := make([]AdminTeamSummary, 0, len(teams))
	for _, team := range teams {
		summary := AdminTeamSummary{Team: team}
		DB.Model(&TeamMember{}).Where("team_id = ?", team.Id).Count(&summary.MemberCount)
		DB.Model(&Token{}).Where("team_id = ?", team.Id).Count(&summary.TokenCount)
		now := common.GetTimestamp()
		DB.Model(&UserSubscription{}).
			Where("team_id = ? AND status = ? AND end_time > ?", team.Id, "active", now).
			Count(&summary.ActiveSubCount)
		result = append(result, summary)
	}
	return result, nil
}
