package handler

import (
	"log"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RecordWebSocket(c *gin.Context) {
	rawWS, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer rawWS.Close()

	platform := c.DefaultQuery("platform", "instagram")

	h.browser.RunRecordStream(rawWS, platform)
}