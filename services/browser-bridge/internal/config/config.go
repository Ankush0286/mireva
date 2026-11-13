package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	Port       string
	BindAddr   string
	GinMode    string
	IsHeadless bool
	StorageDir string
	MediaDir   string
}

func Load() *Config {
	port := os.Getenv("BRIDGE_PORT")
	if port == "" {
		port = "8080"
	}

	ginMode := os.Getenv("GIN_MODE")
	if ginMode == "" {
		ginMode = "release"
	}

	host := os.Getenv("BRIDGE_HOST")
	if host == "" {
		host = "127.0.0.1"
	}

	isHeadless := os.Getenv("BRIDGE_HEADLESS") != "false"

	storageDir := resolveStorageDir()
	mediaDir := filepath.Join(storageDir, "media")

	return &Config{
		Port:       port,
		BindAddr:   host + ":" + port,
		GinMode:    ginMode,
		IsHeadless: isHeadless,
		StorageDir: storageDir,
		MediaDir:   mediaDir,
	}
}

func resolveStorageDir() string {
	candidates := []string{
		filepath.Join("backend", "storage"),
		filepath.Join("..", "backend", "storage"),
		filepath.Join("..", "..", "backend", "storage"),
		filepath.Join("..", "..", "..", "backend", "storage"),
	}

	for _, c := range candidates {
		abs, err := filepath.Abs(c)
		if err == nil {
			if fi, err := os.Stat(abs); err == nil && fi.IsDir() {
				return abs
			}
		}
	}

	abs, _ := filepath.Abs(filepath.Join("..", "..", "backend", "storage"))
	return abs
}
