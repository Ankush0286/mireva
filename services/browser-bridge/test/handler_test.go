package test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"browser-bridge/internal/config"
	"browser-bridge/internal/handler"
	"browser-bridge/internal/model"
	"browser-bridge/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHealthCheck(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	r := gin.New()

	cfg := config.Load()
	bService := service.NewBrowserService(cfg)
	h := handler.New(cfg, bService)
	h.RegisterRoutes(r)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var res map[string]string
	err := json.Unmarshal(w.Body.Bytes(), &res)
	require.NoError(t, err)
	assert.Equal(t, "ok", res["status"])
	assert.Equal(t, "mireva-browser-bridge", res["service"])
}

func TestGetPlatformURL(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "https://x.com/home", service.GetPlatformURL("twitter"))
	assert.Equal(t, "https://www.facebook.com/", service.GetPlatformURL("facebook"))
	assert.Equal(t, "https://www.instagram.com/", service.GetPlatformURL("instagram"))
	assert.Equal(t, "https://www.instagram.com/", service.GetPlatformURL("unknown"))
}

func TestMessageSerialization(t *testing.T) {
	t.Parallel()

	rawJSON := `{"type":"click","x":640,"y":400,"text":"hello","key":"Enter","url":"https://x.com"}`
	var inMsg model.ClientInboundMessage
	err := json.Unmarshal([]byte(rawJSON), &inMsg)
	require.NoError(t, err)
	assert.Equal(t, "click", inMsg.Type)
	assert.Equal(t, 640, inMsg.X)
}