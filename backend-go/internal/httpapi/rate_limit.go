package httpapi

import (
	"fmt"
	"time"
)

func (server *Server) allowProofWrite(userID string, endpoint string) bool {
	key := fmt.Sprintf("%s:%s", userID, endpoint)
	cutoff := time.Now().Add(-1 * time.Minute)

	server.proofRateMu.Lock()
	defer server.proofRateMu.Unlock()

	current := server.proofRateState[key]
	filtered := make([]time.Time, 0, len(current))
	for _, item := range current {
		if item.After(cutoff) {
			filtered = append(filtered, item)
		}
	}

	if len(filtered) >= 5 {
		server.proofRateState[key] = filtered
		return false
	}

	filtered = append(filtered, time.Now())
	server.proofRateState[key] = filtered
	return true
}
