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

func TestValidatePricingFeaturedModels(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "empty array", value: "[]", wantErr: false},
		{name: "valid list", value: `["gpt-4o","claude-sonnet-4"]`, wantErr: false},
		{name: "max allowed", value: `["a","b","c","d"]`, wantErr: false},
		{name: "one too many", value: `["a","b","c","d","e"]`, wantErr: true},
		{name: "not json", value: "gpt-4o", wantErr: true},
		{name: "json object", value: `{"model":"gpt-4o"}`, wantErr: true},
		{name: "non-string entries", value: `[1,2]`, wantErr: true},
		{name: "empty model name", value: `["gpt-4o",""]`, wantErr: true},
		{name: "duplicate model", value: `["gpt-4o","gpt-4o"]`, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePricingFeaturedModels(tt.value)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validatePricingFeaturedModels(%q) error = %v, wantErr %v",
					tt.value, err, tt.wantErr)
			}
		})
	}
}
