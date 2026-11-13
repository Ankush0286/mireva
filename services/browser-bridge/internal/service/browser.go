package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"browser-bridge/internal/config"
	"browser-bridge/internal/model"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/input"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
	"github.com/gorilla/websocket"
)

type SafeWS struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func NewSafeWS(conn *websocket.Conn) *SafeWS {
	return &SafeWS{conn: conn}
}

func (s *SafeWS) SendJSON(msg model.ServerOutboundMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.WriteJSON(msg)
}

func GetPlatformURL(platform string) string {
	switch strings.ToLower(strings.TrimSpace(platform)) {
	case "twitter":
		return "https://x.com/home"
	case "facebook":
		return "https://www.facebook.com/"
	case "email":
		return "https://mail.google.com/"
	default:
		return "https://www.instagram.com/"
	}
}

type BrowserService struct {
	cfg *config.Config
}

func NewBrowserService(cfg *config.Config) *BrowserService {
	return &BrowserService{cfg: cfg}
}

func (s *BrowserService) RunSessionStream(ws *websocket.Conn, accountID, platform string) {
	sessionDir := filepath.Join(s.cfg.StorageDir, "browser_sessions", accountID)
	storageStatePath := filepath.Join(sessionDir, "storage_state.json")
	_ = os.MkdirAll(sessionDir, 0755)

	log.Printf("[Bridge] ▶ New Session Stream: account=%s platform=%s", accountID, platform)
	s.runStream(NewSafeWS(ws), sessionDir, storageStatePath, GetPlatformURL(platform), false)
}

func (s *BrowserService) RunRecordStream(ws *websocket.Conn, platform string) {
	sessionDir := filepath.Join(s.cfg.StorageDir, "browser_sessions", "recorder_"+platform)
	storageStatePath := filepath.Join(sessionDir, "storage_state.json")
	_ = os.MkdirAll(sessionDir, 0755)

	log.Printf("[Bridge] ▶ New Workflow Record Stream: platform=%s", platform)
	s.runStream(NewSafeWS(ws), sessionDir, storageStatePath, GetPlatformURL(platform), true)
}

func (s *BrowserService) runStream(ws *SafeWS, sessionDir, storageStatePath, targetURL string, isRecording bool) {
	CleanStaleProfileLocks(sessionDir)

	_ = ws.SendJSON(model.ServerOutboundMessage{
		Type:    "status",
		Message: "Mireva Go Bridge: Launching Chromium container...",
	})

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.UserDataDir(sessionDir),
		chromedp.Flag("headless", s.cfg.IsHeadless),
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("disable-infobars", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-setuid-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("no-default-browser-check", true),
		chromedp.Flag("no-first-run", true),
		chromedp.WindowSize(1280, 800),
		chromedp.UserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"),
	)

	log.Printf("[Bridge] Allocating Chromium process (headless=%v)...", s.cfg.IsHeadless)
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancelAlloc()

	taskCtx, cancelTask := chromedp.NewContext(allocCtx)
	defer cancelTask()

	var clickMu sync.Mutex
	var lastClickDesc string
	var lastClickTime float64
	var frameCount uint64

	_ = chromedp.Listen(taskCtx, func(ev any) {
		switch e := ev.(type) {
		case *page.EventScreencastFrame:
			encodedBase64 := base64.StdEncoding.EncodeToString(e.Data)

			_ = ws.SendJSON(model.ServerOutboundMessage{
				Type: "frame",
				Data: encodedBase64,
			})

			count := atomic.AddUint64(&frameCount, 1)
			if count == 1 {
				log.Printf("[Bridge] First frame captured and streamed to client (%d bytes)", len(e.Data))
			} else if count%100 == 0 {
				log.Printf("[Bridge] Streamed %d frames to client", count)
			}

			go func(sessionID int64) {
				_, _ = chromedp.Call(taskCtx, page.ScreencastFrameAck, page.ScreencastFrameAckParams{
					SessionID: sessionID,
				})
			}(e.SessionID)

		case *page.EventFrameNavigated:
			if e.Frame.ParentID == "" {
				log.Printf("[Bridge] Navigated: %s", e.Frame.URL)
				_ = ws.SendJSON(model.ServerOutboundMessage{
					Type: "navigated",
					URL:  e.Frame.URL,
				})
			}

		case *runtime.EventBindingCalled:
			if e.Name == "__gc_record_step" {
				var step map[string]interface{}
				if err := json.Unmarshal([]byte(e.Payload), &step); err != nil {
					log.Printf("[Bridge] Warning: invalid recorder payload: %v", err)
					return
				}

				stype, _ := step["type"].(string)
				desc, _ := step["description"].(string)
				ts, _ := step["timestamp"].(float64)
				nowSec := ts / 1000.0

				if stype == "click" {
					clickMu.Lock()
					duplicate := desc == lastClickDesc && (nowSec-lastClickTime) < 1.2
					if !duplicate {
						lastClickDesc = desc
						lastClickTime = nowSec
					}
					clickMu.Unlock()
					if duplicate {
						return
					}
				}

				log.Printf("[Bridge] 🟢 Step Captured: [%s] %s", stype, desc)
				_ = ws.SendJSON(model.ServerOutboundMessage{
					Type: "step",
					Step: step,
				})
			}
		}
	})

	if storageStatePath != "" {
		if err := LoadStorageStateJSON(taskCtx, storageStatePath); err == nil {
			log.Printf("[Bridge] Restored cookies from %s", storageStatePath)
		}
	}

	_, _ = chromedp.Call(taskCtx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width:             1280,
		Height:            800,
		DeviceScaleFactor: 1.0,
	})

	_, _ = chromedp.Call(taskCtx, page.AddScriptToEvaluateOnNewDocument, page.AddScriptToEvaluateOnNewDocumentParams{
		Source: StealthInitScript,
	})

	if isRecording {
		_, _ = chromedp.Call(taskCtx, runtime.Enable, cdp.Empty{})
		_, _ = chromedp.Call(taskCtx, runtime.AddBinding, runtime.AddBindingParams{
			Name: "__gc_record_step",
		})
		_, _ = chromedp.Call(taskCtx, page.AddScriptToEvaluateOnNewDocument, page.AddScriptToEvaluateOnNewDocumentParams{
			Source: RecorderInjectionJS,
		})
	}

	log.Printf("[Bridge] Navigating to %s...", targetURL)
	if err := chromedp.Do(taskCtx, chromedp.Navigate(targetURL)); err != nil {
		log.Printf("[Bridge] Navigation failed: %v", err)
		_ = ws.SendJSON(model.ServerOutboundMessage{
			Type:    "status",
			Message: fmt.Sprintf("Navigation error: %v", err),
		})
		return
	}

	quality := int64(75)
	_, err := chromedp.Call(taskCtx, page.StartScreencast, page.StartScreencastParams{
		Format:        page.StartScreencastFormatJpeg,
		Quality:       &quality,
		MaxWidth:      1280,
		MaxHeight:     800,
		EveryNthFrame: 1,
	})
	if err != nil {
		log.Printf("[Bridge] Failed to start screencast: %v", err)
		_ = ws.SendJSON(model.ServerOutboundMessage{
			Type:    "status",
			Message: fmt.Sprintf("Screencast error: %v", err),
		})
		return
	}

	log.Printf("[Bridge] Screencast active! Streaming to client.")
	_ = ws.SendJSON(model.ServerOutboundMessage{Type: "navigated", URL: targetURL})
	_ = ws.SendJSON(model.ServerOutboundMessage{Type: "status", Message: "Ready"})

	inputCtx, cancelInput := context.WithCancel(taskCtx)
	defer cancelInput()

	inputCh := make(chan model.ClientInboundMessage, 128)
	var inputWG sync.WaitGroup
	inputWG.Add(1)
	go func() {
		defer inputWG.Done()
		withInputTimeout := func(fn func(context.Context)) {
			cCtx, cancel := context.WithTimeout(inputCtx, 5*time.Second)
			defer cancel()
			fn(cCtx)
		}

		dispatchKey := func(k, code string, vk, mod int64, commands []string) {
			withInputTimeout(func(cCtx context.Context) {
				_, _ = chromedp.Call(cCtx, input.DispatchKeyEvent, input.DispatchKeyEventParams{
					Type:                  input.DispatchKeyEventTypeRawKeyDown,
					Key:                   k,
					Code:                  code,
					WindowsVirtualKeyCode: vk,
					NativeVirtualKeyCode:  vk,
					Modifiers:             mod,
					Commands:              commands,
				})
				_, _ = chromedp.Call(cCtx, input.DispatchKeyEvent, input.DispatchKeyEventParams{
					Type:                  input.DispatchKeyEventTypeKeyUp,
					Key:                   k,
					Code:                  code,
					WindowsVirtualKeyCode: vk,
					NativeVirtualKeyCode:  vk,
					Modifiers:             mod,
				})
			})
		}

		for inMsg := range inputCh {
			if inputCtx.Err() != nil {
				return
			}
			switch inMsg.Type {
			case "click":
				x, y := float64(inMsg.X), float64(inMsg.Y)
				withInputTimeout(func(cCtx context.Context) {
					_, _ = chromedp.Call(cCtx, input.DispatchMouseEvent, input.DispatchMouseEventParams{
						Type:       input.DispatchMouseEventTypeMousePressed,
						X:          x,
						Y:          y,
						Button:     input.MouseButtonLeft,
						ClickCount: 1,
					})
					time.Sleep(30 * time.Millisecond)
					_, _ = chromedp.Call(cCtx, input.DispatchMouseEvent, input.DispatchMouseEventParams{
						Type:       input.DispatchMouseEventTypeMouseReleased,
						X:          x,
						Y:          y,
						Button:     input.MouseButtonLeft,
						ClickCount: 1,
					})
				})

			case "type":
				withInputTimeout(func(cCtx context.Context) {
					_, _ = chromedp.Call(cCtx, input.InsertText, input.InsertTextParams{
						Text: inMsg.Text,
					})
				})

			case "key":
				key := inMsg.Key
				switch key {
				case "Enter":
					dispatchKey("Enter", "Enter", 13, 0, nil)
				case "Backspace":
					dispatchKey("Backspace", "Backspace", 8, 0, nil)
				case "Tab":
					dispatchKey("Tab", "Tab", 9, 0, nil)
				case "Escape":
					dispatchKey("Escape", "Escape", 27, 0, nil)
				case "Delete":
					dispatchKey("Delete", "Delete", 46, 0, nil)
				case "ArrowLeft":
					dispatchKey("ArrowLeft", "ArrowLeft", 37, 0, nil)
				case "ArrowUp":
					dispatchKey("ArrowUp", "ArrowUp", 38, 0, nil)
				case "ArrowRight":
					dispatchKey("ArrowRight", "ArrowRight", 39, 0, nil)
				case "ArrowDown":
					dispatchKey("ArrowDown", "ArrowDown", 40, 0, nil)
				case "ControlOrMeta+A":
					dispatchKey("a", "KeyA", 65, 2, []string{"selectAll"})
				default:
					if len([]rune(key)) == 1 {
						withInputTimeout(func(cCtx context.Context) {
							_, _ = chromedp.Call(cCtx, input.InsertText, input.InsertTextParams{
								Text: key,
							})
						})
					}
				}
			}
		}
	}()

	for {
		_, msgBytes, err := ws.conn.ReadMessage()
		if err != nil {
			log.Printf("[Bridge] Client closed connection.")
			break
		}

		var inMsg model.ClientInboundMessage
		if err := json.Unmarshal(msgBytes, &inMsg); err != nil {
			log.Printf("[Bridge] Warning: ignoring malformed client message: %v", err)
			continue
		}

		switch inMsg.Type {
		case "click", "type", "key":
			select {
			case inputCh <- inMsg:
			case <-inputCtx.Done():
			}

		case "navigate":
			navURL := strings.TrimSpace(inMsg.URL)
			if navURL != "" {
				if !strings.HasPrefix(navURL, "http://") && !strings.HasPrefix(navURL, "https://") {
					navURL = "https://" + navURL
				}
				go func(u string) {
					if err := chromedp.Do(taskCtx, chromedp.Navigate(u)); err != nil {
						log.Printf("[Bridge] Warning: client navigation to %s failed: %v", u, err)
						return
					}
					_ = ws.SendJSON(model.ServerOutboundMessage{Type: "navigated", URL: u})
				}(navURL)
			}

		case "upload_file":
			filename := inMsg.Filename
			if filename == "" {
				filename = "upload.png"
			}
			b64Data := inMsg.Data
			go func(fname, data string) {
				mediaDir := filepath.Join(s.cfg.MediaDir)
				if err := os.MkdirAll(mediaDir, 0755); err != nil {
					log.Printf("[Bridge] Warning: could not create media dir %s: %v", mediaDir, err)
					return
				}
				savePath := filepath.Join(mediaDir, "live_"+fname)

				fileBytes, err := base64.StdEncoding.DecodeString(data)
				if err != nil {
					log.Printf("[Bridge] Warning: upload has invalid base64: %v", err)
					return
				}
				if err := os.WriteFile(savePath, fileBytes, 0644); err != nil {
					log.Printf("[Bridge] Warning: could not write upload to %s: %v", savePath, err)
					return
				}
				if err := chromedp.Do(taskCtx, chromedp.SetUploadFiles("input[type='file']", []string{savePath})); err != nil {
					log.Printf("[Bridge] Warning: could not attach upload %s: %v", savePath, err)
				}
			}(filename, b64Data)
		}
	}

	cancelInput()
	close(inputCh)
	inputWG.Wait()

	if storageStatePath != "" {
		if err := SaveStorageStateJSON(taskCtx, storageStatePath); err != nil {
			log.Printf("[Bridge] Warning: could not save cookies to %s: %v", storageStatePath, err)
		} else {
			log.Printf("[Bridge] Saved session cookies to %s", storageStatePath)
		}
	}

	_, _ = chromedp.Call(taskCtx, page.StopScreencast, cdp.Empty{})
	log.Printf("[Bridge] Cleaned up session stream.")
}
