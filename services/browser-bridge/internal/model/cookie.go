package model

type PlaywrightCookie struct {
	Name     string  `json:"name"`
	Value    string  `json:"value"`
	Domain   string  `json:"domain"`
	Path     string  `json:"path"`
	Expires  float64 `json:"expires"`
	HTTPOnly bool    `json:"httpOnly"`
	Secure   bool    `json:"secure"`
	SameSite string  `json:"sameSite"`
}

type PlaywrightStorageState struct {
	Cookies []PlaywrightCookie       `json:"cookies"`
	Origins []map[string]interface{} `json:"origins"`
}
