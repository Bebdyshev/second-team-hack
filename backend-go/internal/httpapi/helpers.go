package httpapi

import (
	"encoding/json"
	"net/http"
)

type ErrorResponse struct {
	Detail string `json:"detail"`
}

func writeJSON(writer http.ResponseWriter, statusCode int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(statusCode)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer http.ResponseWriter, statusCode int, message string) {
	writeJSON(writer, statusCode, ErrorResponse{Detail: message})
}
