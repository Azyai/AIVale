package model

import (
	"crypto/sha256"
	"crypto/subtle"
	"net"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// AgentModelTokenIdentity is produced only from a successful model TokenAuth.
// It retains a digest of the parsed credential, never the usable Key.
type AgentModelTokenIdentity struct {
	tokenID, userID, teamID int64
	keyDigest               [sha256.Size]byte
	clientIP                string
}

func NewAgentModelTokenIdentity(token *Token, presentedKey, clientIP string) AgentModelTokenIdentity {
	if token == nil || token.Id <= 0 || token.UserId <= 0 || token.TeamId < 0 || presentedKey == "" {
		return AgentModelTokenIdentity{}
	}
	return AgentModelTokenIdentity{tokenID: int64(token.Id), userID: int64(token.UserId), teamID: int64(token.TeamId), keyDigest: sha256.Sum256([]byte(presentedKey)), clientIP: clientIP}
}

func (identity AgentModelTokenIdentity) Valid() bool {
	return identity.tokenID > 0 && identity.userID > 0
}

// AgentRunTokenFacts contains the current credential, ownership and grant
// decision inputs from one main database statement; no Key or IP is returned.
type AgentRunTokenFacts struct {
	TokenID         int64  `json:"-"`
	UserID          int64  `json:"-"`
	TeamID          int64  `json:"-"`
	TeamOwnerUserID *int64 `json:"-"`
	TeamMemberRole  string `json:"-"`
	WorkspaceID     *int64 `json:"-"`
	WorkspaceStatus string `json:"-"`
	ArchivedAt      *int64 `json:"-"`
	MemberRole      string `json:"-"`
	MemberStatus    string `json:"-"`
	GrantID         *int64 `json:"-"`
	GrantScope      string `json:"-"`
	GrantStatus     string `json:"-"`
	GrantRevision   int64  `json:"-"`
	GrantCreatedAt  int64  `json:"-"`
	GrantUpdatedAt  int64  `json:"-"`
	GrantExpiresAt  *int64 `json:"-"`
	GrantRevokedAt  *int64 `json:"-"`
}

func LoadAgentRunTokenFacts(db *gorm.DB, identity AgentModelTokenIdentity, workspaceID int64, scope string) (*AgentRunTokenFacts, error) {
	if db == nil || !identity.Valid() || workspaceID <= 0 || !ValidAgentTokenGrantScope(scope) {
		return nil, ErrAgentWorkspaceInvalid
	}
	var row struct {
		AgentRunTokenFacts
		TokenKey       string
		TokenStatus    int
		TokenExpiresAt int64
		UnlimitedQuota bool
		RemainQuota    int
		AllowIps       *string
	}
	// Key material is selected only by trusted numeric identity and immediately
	// compared locally. No raw credential is interpolated into SQL or returned.
	err := db.Table("tokens").
		Select("tokens.id AS token_id, tokens.user_id, tokens.team_id, tokens."+commonKeyCol+" AS token_key, tokens.status AS token_status, tokens.expired_time AS token_expires_at, tokens.unlimited_quota, tokens.remain_quota, tokens.allow_ips, "+
			"teams.owner_user_id AS team_owner_user_id, team_members.role AS team_member_role, ag_workspaces.id AS workspace_id, ag_workspaces.status AS workspace_status, ag_workspaces.archived_at, "+
			"ag_workspace_members.role AS member_role, ag_workspace_members.status AS member_status, g.id AS grant_id, g.scope AS grant_scope, g.status AS grant_status, g.revision AS grant_revision, "+
			"g.created_at AS grant_created_at, g.updated_at AS grant_updated_at, g.expires_at AS grant_expires_at, g.revoked_at AS grant_revoked_at").
		Joins("JOIN users ON users.id = tokens.user_id AND users.deleted_at IS NULL AND users.status = ? AND users.auth_version > 0 AND users.role IN ?",
			common.UserStatusEnabled, []int{common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser}).
		Joins("LEFT JOIN teams ON teams.id = tokens.team_id AND tokens.team_id > 0").
		Joins("LEFT JOIN team_members ON team_members.team_id = teams.id AND team_members.user_id = tokens.user_id").
		Joins("LEFT JOIN ag_workspaces ON ag_workspaces.team_id = teams.id AND ag_workspaces.id = ?", workspaceID).
		Joins("LEFT JOIN ag_workspace_members ON ag_workspace_members.team_id = teams.id AND ag_workspace_members.workspace_id = ag_workspaces.id AND ag_workspace_members.user_id = tokens.user_id").
		Joins("LEFT JOIN ag_token_grants AS g ON g.team_id = teams.id AND g.workspace_id = ag_workspaces.id AND g.token_id = tokens.id AND g.resource_id = ag_workspaces.id AND "+
			agentWorkspaceExactColumn(db, "g.resource_type")+" = ? AND "+agentWorkspaceExactColumn(db, "g.scope")+" = ?", AgentTokenGrantResourceWorkspace, scope).
		Where("tokens.id = ? AND tokens.user_id = ? AND tokens.deleted_at IS NULL", identity.tokenID, identity.userID).Take(&row).Error
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256([]byte(row.TokenKey))
	if row.TokenKey == "" || subtle.ConstantTimeCompare(digest[:], identity.keyDigest[:]) != 1 || row.TeamID != identity.teamID ||
		row.TokenStatus != common.TokenStatusEnabled || (row.TokenExpiresAt != -1 && row.TokenExpiresAt <= common.GetTimestamp()) ||
		(!row.UnlimitedQuota && row.RemainQuota <= 0) {
		return nil, ErrTokenInvalid
	}
	if ips := (&Token{AllowIps: row.AllowIps}).GetIpLimits(); len(ips) > 0 {
		ip := net.ParseIP(identity.clientIP)
		if ip == nil || !common.IsIpInCIDRList(ip, ips) {
			return nil, ErrTokenInvalid
		}
	}
	return &row.AgentRunTokenFacts, nil
}
