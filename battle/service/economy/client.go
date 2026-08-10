package economy

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	baseURL = strings.TrimRight(baseURL, "/")
	if baseURL == "" {
		baseURL = "http://localhost:8000"
	}
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 2 * time.Second},
	}
}

func (c *Client) SpendTaunt(accessToken, tauntID string) error {
	payload, err := json.Marshal(map[string]string{"taunt_id": tauntID})
	if err != nil {
		return fmt.Errorf("encode taunt payment: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/economy/me/taunt", strings.NewReader(string(payload)))
	if err != nil {
		return fmt.Errorf("create taunt payment request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("account service unavailable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusConflict {
		return fmt.Errorf("not enough taunt charges")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("taunt payment rejected with status %d", resp.StatusCode)
	}
	return nil
}
