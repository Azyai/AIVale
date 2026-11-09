package model

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"gorm.io/gorm"
)

// ReadAgentEditorModelNames returns only names assigned to the current user's
// server-authorized routing groups. Channel secrets and groups never leave
// this repository. Eligibility is a separate batched check for the page.
func ReadAgentEditorModelNames(tx *gorm.DB, facts *AgentWorkspaceWriteFacts, groups []string, query string, offset int64, limit int) ([]string, int64, error) {
	if !agentDraftWriteScopeValid(tx, facts) || offset < 0 || limit < 1 || limit > 100 {
		return nil, 0, ErrAgentDefinitionInvalid
	}
	items := make([]string, 0)
	if len(groups) == 0 {
		return items, 0, nil
	}
	name := agentWorkspaceExactColumn(tx, tx.Statement.Quote("abilities.model"))
	group := agentWorkspaceExactColumn(tx, tx.Statement.Quote("abilities.group"))
	visible := tx.Table("abilities").Select(name+" AS model").
		Joins("JOIN channels ON channels.id = abilities.channel_id").
		Where(group+" IN ?", groups).
		Group(name)
	if query != "" {
		switch tx.Dialector.Name() {
		case "sqlite":
			visible = visible.Where("instr(abilities.model, ?) > 0", query)
		case "postgres":
			visible = visible.Where("strpos(abilities.model, ?) > 0", query)
		case "mysql":
			visible = visible.Where("LOCATE(BINARY ?, BINARY abilities.model) > 0", query)
		default:
			return nil, 0, ErrAgentDefinitionInvalid
		}
	}
	// Stream only the scoped names so malformed catalog text is excluded from
	// both total and the page using the same Go Unicode rules on every engine.
	// Retain at most one page; no config or channel credential is selected.
	rows, err := visible.Order(name + " ASC").Rows()
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var total int64
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, 0, err
		}
		if value == "" || len(value) > 256 || !utf8.ValidString(value) || strings.TrimSpace(value) != value || strings.ContainsFunc(value, unicode.IsControl) {
			continue
		}
		if total >= agentDefinitionMaxInteger {
			return nil, 0, ErrAgentDefinitionInvalid
		}
		if total >= offset && len(items) < limit {
			items = append(items, value)
		}
		total++
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}
