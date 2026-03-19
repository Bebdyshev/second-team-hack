package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"second-team-hack/backend-go/internal/auth"
	"second-team-hack/backend-go/internal/domain"
	"second-team-hack/backend-go/internal/store"
)

func TestHashAnyIsDeterministic(t *testing.T) {
	value := map[string]any{
		"house_id": "house-1",
		"period":   "2026-03",
	}

	first := hashAny(value)
	second := hashAny(value)

	if first != second {
		t.Fatalf("expected deterministic hash, got %s and %s", first, second)
	}
	if len(first) != 66 {
		t.Fatalf("expected 32-byte hex hash with 0x prefix, got %s", first)
	}
}

func TestAnchorReportIsIdempotent(t *testing.T) {
	server, managerToken := setupProofTestServer(t)

	requestBody := map[string]any{
		"period":      "2026-03",
		"metadata_uri": "report://house-1/2026-03",
		"report_hash": "0x1111111111111111111111111111111111111111111111111111111111111111",
	}

	first := anchorRequest(t, server, managerToken, requestBody)
	second := anchorRequest(t, server, managerToken, requestBody)

	if first.ID != second.ID {
		t.Fatalf("expected idempotent anchor id, got %s and %s", first.ID, second.ID)
	}
}

func TestResidentCannotAnchorReport(t *testing.T) {
	server, _, residentToken := setupProofTestServerWithResident(t)

	body := map[string]any{
		"period":      "2026-03",
		"report_hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}
	raw, _ := json.Marshal(body)

	request := httptest.NewRequest(http.MethodPost, "/houses/house-1/reports/anchor", bytes.NewReader(raw))
	request.Header.Set("Authorization", "Bearer "+residentToken)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", response.Code)
	}
}

func setupProofTestServer(t *testing.T) (*Server, string) {
	t.Helper()

	dataStore := store.New()
	tokenService := auth.NewTokenService("test-secret")
	server := NewServer(dataStore, tokenService, nil)

	token, err := tokenService.CreateAccessToken("user-manager-1")
	if err != nil {
		t.Fatalf("create manager token failed: %v", err)
	}
	return server, token
}

func setupProofTestServerWithResident(t *testing.T) (*Server, string, string) {
	t.Helper()

	dataStore := store.New()
	tokenService := auth.NewTokenService("test-secret")
	server := NewServer(dataStore, tokenService, nil)

	managerToken, err := tokenService.CreateAccessToken("user-manager-1")
	if err != nil {
		t.Fatalf("create manager token failed: %v", err)
	}
	residentToken, err := tokenService.CreateAccessToken("user-resident-1")
	if err != nil {
		t.Fatalf("create resident token failed: %v", err)
	}
	return server, managerToken, residentToken
}

func anchorRequest(t *testing.T, server *Server, token string, body map[string]any) domain.ReportAnchor {
	t.Helper()

	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request failed: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/houses/house-1/reports/anchor", bytes.NewReader(raw))
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}

	var payload domain.ReportAnchor
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	return payload
}
