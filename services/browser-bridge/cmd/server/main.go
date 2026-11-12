package main

import (
	"fmt"
	"log"

	"browser-bridge/internal/config"
	"browser-bridge/internal/handler"
	"browser-bridge/internal/service"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	if cfg.GinMode == "debug" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Logger())   // Attach structured logger
	router.Use(gin.Recovery()) // Panic recovery
	_ = router.SetTrustedProxies(nil)

	// Dependency Injection
	browserService := service.NewBrowserService(cfg)
	h := handler.New(cfg, browserService)
	h.RegisterRoutes(router)

	fmt.Printf("Mireva High-Speed Go Browser Bridge listening on http://%s\n", cfg.BindAddr)
	fmt.Println("   • /ws/session -> Account Authentication Studio")
	fmt.Println("   • /ws/record  -> Custom Workflow Recorder")

	log.Fatal(router.Run(cfg.BindAddr))
}