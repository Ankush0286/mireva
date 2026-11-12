package handler

import (
	"net/http"

	"browser-bridge/internal/config"
	"browser-bridge/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Handler struct {
	cfg     *config.Config
	browser *service.BrowserService
}

func New(cfg *config.Config, browser *service.BrowserService) *Handler {
	return &Handler{
		cfg:     cfg,
		browser: browser,
	}
}

func (h *Handler) RegisterRoutes(r *gin.Engine) {
	// Health endpoint
	r.GET("/health", h.Health)

	// Direct WebSocket endpoints
	r.GET("/ws/session", h.SessionWebSocket)
	r.GET("/ws/record", h.RecordWebSocket)

	// Drop-in compatible endpoints matching FastAPI router URLs
	r.GET("/api/v1/accounts/:account_id/session/ws", h.SessionWebSocket)
	r.GET("/api/v1/recipes/record/ws", h.RecordWebSocket)
}