package model

type ClientInboundMessage struct {
	Type     string `json:"type"` // "click", "type", "key", "navigate", "upload_file"
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Text     string `json:"text"`
	Key      string `json:"key"`
	URL      string `json:"url"`
	Data     string `json:"data"`     // base64 file data
	Filename string `json:"filename"` // uploaded filename
}

type ServerOutboundMessage struct {
	Type    string      `json:"type"` // "frame", "status", "navigated", "step"
	Data    string      `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	URL     string      `json:"url,omitempty"`
	Step    interface{} `json:"step,omitempty"`
}
