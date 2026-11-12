package service

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	"browser-bridge/internal/model"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
)

func LoadStorageStateJSON(ctx context.Context, statePath string) error {
	data, err := os.ReadFile(statePath)
	if err != nil {
		return err
	}

	var state model.PlaywrightStorageState
	if err := json.Unmarshal(data, &state); err != nil {
		return err
	}

	for _, ck := range state.Cookies {
		sec := ck.Secure
		httpOnly := ck.HTTPOnly

		params := network.SetCookieParams{
			Name:     ck.Name,
			Value:    ck.Value,
			Domain:   ck.Domain,
			Path:     ck.Path,
			Secure:   &sec,
			HTTPOnly: &httpOnly,
		}

		if ck.SameSite != "" {
			params.SameSite = network.CookieSameSite(ck.SameSite)
		}
		if ck.Expires > 0 {
			params.Expires = cdp.TimeSinceEpoch(ck.Expires)
		}

		_, _ = chromedp.Call(ctx, network.SetCookie, params)
	}

	return nil
}

func SaveStorageStateJSON(ctx context.Context, targetPath string) error {
	res, err := chromedp.Call(ctx, network.GetCookies, network.GetCookiesParams{})
	if err != nil {
		return err
	}

	pwCookies := make([]model.PlaywrightCookie, 0, len(res.Cookies))
	for _, c := range res.Cookies {
		sameSite := "Lax"
		if c.SameSite != "" {
			sameSite = string(c.SameSite)
		}

		pwCookies = append(pwCookies, model.PlaywrightCookie{
			Name:     c.Name,
			Value:    c.Value,
			Domain:   c.Domain,
			Path:     c.Path,
			Expires:  float64(c.Expires),
			HTTPOnly: c.HTTPOnly,
			Secure:   c.Secure,
			SameSite: sameSite,
		})
	}

	state := model.PlaywrightStorageState{
		Cookies: pwCookies,
		Origins: make([]map[string]interface{}, 0),
	}

	bytes, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	_ = os.MkdirAll(filepath.Dir(targetPath), 0755)
	return os.WriteFile(targetPath, bytes, 0644)
}