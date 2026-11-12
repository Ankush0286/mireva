package handler

import (
	"log"

	"github.com/gin-gonic/gin"
)

func (h *Handler) SessionWebSocket(c *gin.Context) {
	rawWS, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer rawWS.Close()

	accountID := c.Param("account_id")
	if accountID == "" {
		accountID = c.DefaultQuery("account_id", "guest")
	}
	platform := c.DefaultQuery("platform", "instagram")

	h.browser.RunSessionStream(rawWS, accountID, platform)
}