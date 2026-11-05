package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var ErrAgentPersonalWorkspaceRevision = errors.New("personal workspace revision changed")

// AgentPersonalWorkspace is bound to one account, independently of Team membership.
type AgentPersonalWorkspace struct {
	OwnerUserID int64  `gorm:"primaryKey;autoIncrement:false" json:"-"`
	Name        string `gorm:"size:512;not null" json:"-"`
	Description string `gorm:"type:text;not null" json:"-"`
	Revision    int64  `gorm:"not null" json:"-"`
	UpdatedAt   int64  `gorm:"not null;autoUpdateTime:false" json:"-"`
}

func (AgentPersonalWorkspace) TableName() string { return "ag_personal_workspaces" }

// ReadAgentPersonalWorkspace checks the account, session and owner in one query.
// A valid session with no row is distinct from an invalid session.
func ReadAgentPersonalWorkspace(db *gorm.DB, identity AuthSessionIdentity) (*AgentPersonalWorkspace, error) {
	var workspace AgentPersonalWorkspace
	err := agentWorkspaceSessionQuery(db, identity).
		Where("users.role IN ?", []int{common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser}).
		Joins("LEFT JOIN ag_personal_workspaces ON ag_personal_workspaces.owner_user_id = users.id").
		Select("COALESCE(ag_personal_workspaces.owner_user_id, 0) AS owner_user_id, ag_personal_workspaces.name, ag_personal_workspaces.description, ag_personal_workspaces.revision, ag_personal_workspaces.updated_at").
		Take(&workspace).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserSessionInactive
	}
	if err != nil || workspace.OwnerUserID == 0 {
		return nil, err
	}
	return &workspace, nil
}

// SaveAgentPersonalWorkspace locks the current user and session before reading
// the owner's row. It serializes creation even when that row does not exist.
func SaveAgentPersonalWorkspace(db *gorm.DB, identity AuthSessionIdentity, name, description string, expectedRevision, maxRevision int64) (*AgentPersonalWorkspace, error) {
	var result AgentPersonalWorkspace
	err := withAgentWorkspaceWriteTransaction(db, identity, func(tx *gorm.DB) error {
		user, err := lockAgentWorkspaceWriteActor(tx, identity)
		if err != nil {
			return err
		}
		if user.Role < common.RoleCommonUser {
			return ErrUserSessionInactive
		}
		ownerID := int64(user.Id)
		var current AgentPersonalWorkspace
		err = lockForUpdate(tx).Where("owner_user_id = ?", ownerID).Take(&current).Error
		now := time.Now().UnixMilli()
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if expectedRevision != 0 {
				return ErrAgentPersonalWorkspaceRevision
			}
			result = AgentPersonalWorkspace{OwnerUserID: ownerID, Name: name, Description: description, Revision: 1, UpdatedAt: now}
			return tx.Create(&result).Error
		}
		if err != nil {
			return err
		}
		if current.Revision <= 0 || current.Revision != expectedRevision || current.Revision >= maxRevision {
			return ErrAgentPersonalWorkspaceRevision
		}
		result = AgentPersonalWorkspace{OwnerUserID: ownerID, Name: name, Description: description, Revision: current.Revision + 1, UpdatedAt: max(now, current.UpdatedAt)}
		update := tx.Model(&AgentPersonalWorkspace{}).Where("owner_user_id = ? AND revision = ?", ownerID, expectedRevision).
			Updates(map[string]any{"name": result.Name, "description": result.Description, "revision": result.Revision, "updated_at": result.UpdatedAt})
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected != 1 {
			return ErrAgentPersonalWorkspaceRevision
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}
