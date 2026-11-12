package test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"browser-bridge/internal/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPlaywrightStorageStateSerialization(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	targetPath := filepath.Join(tmpDir, "test_storage_state.json")

	sampleState := model.PlaywrightStorageState{
		Cookies: []model.PlaywrightCookie{
			{
				Name:     "sessionid",
				Value:    "secret_session_token_xyz",
				Domain:   ".instagram.com",
				Path:     "/",
				Expires:  1790000000,
				HTTPOnly: true,
				Secure:   true,
				SameSite: "Lax",
			},
		},
		Origins: make([]map[string]interface{}, 0),
	}

	bytes, err := json.MarshalIndent(sampleState, "", "  ")
	require.NoError(t, err)
	err = os.WriteFile(targetPath, bytes, 0644)
	require.NoError(t, err)

	readData, err := os.ReadFile(targetPath)
	require.NoError(t, err)

	var loadedState model.PlaywrightStorageState
	err = json.Unmarshal(readData, &loadedState)
	require.NoError(t, err)

	assert.Len(t, loadedState.Cookies, 1)
	assert.Equal(t, "sessionid", loadedState.Cookies[0].Name)
	assert.Equal(t, "secret_session_token_xyz", loadedState.Cookies[0].Value)
	assert.True(t, loadedState.Cookies[0].HTTPOnly)
}