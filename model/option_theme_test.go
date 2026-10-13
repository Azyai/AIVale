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
package model

import "testing"

func TestValidateThemeDefaults(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "seed default", value: DefaultThemeDefaultsJSON, wantErr: false},
		{name: "full valid object", value: `{"mode":"dark","preset":"aurora-violet","font":"serif","radius":"lg","scale":"sm","contentLayout":"centered"}`, wantErr: false},
		{name: "partial object falls back per axis", value: `{"preset":"rose-garden"}`, wantErr: false},
		{name: "empty object", value: `{}`, wantErr: false},
		{name: "not json", value: "dark", wantErr: true},
		{name: "json array", value: `["dark"]`, wantErr: true},
		{name: "unknown mode", value: `{"mode":"auto"}`, wantErr: true},
		{name: "unknown preset", value: `{"preset":"neon-dream"}`, wantErr: true},
		{name: "unknown font", value: `{"font":"mono"}`, wantErr: true},
		{name: "unknown radius", value: `{"radius":"2xl"}`, wantErr: true},
		{name: "unknown scale", value: `{"scale":"xs"}`, wantErr: true},
		{name: "unknown content layout", value: `{"contentLayout":"wide"}`, wantErr: true},
		{name: "unknown field", value: `{"mode":"dark","easterEgg":true}`, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateThemeDefaults(tt.value)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateThemeDefaults(%q) error = %v, wantErr %v",
					tt.value, err, tt.wantErr)
			}
		})
	}
}
