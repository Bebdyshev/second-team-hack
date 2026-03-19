package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"second-team-hack/backend-go/internal/domain"
	"second-team-hack/backend-go/internal/web3"
)

type anchorReportRequest struct {
	Period      string `json:"period"`
	MetadataURI string `json:"metadata_uri"`
	ReportHash  string `json:"report_hash"`
}

type proveManagerActionRequest struct {
	HouseID    string `json:"house_id"`
	ActionType string `json:"action_type"`
	ActorID    string `json:"actor_id"`
	Payload    any    `json:"payload"`
}

func (server *Server) handleAnchorReport(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}
	if user.Role != domain.RoleManager {
		writeError(writer, http.StatusForbidden, "only manager can anchor report")
		return
	}

	houseID := request.PathValue("houseID")
	if !canAccessHouse(user, houseID) {
		writeError(writer, http.StatusForbidden, "forbidden for this house")
		return
	}

	var payload anchorReportRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid json payload")
		return
	}

	period := strings.TrimSpace(payload.Period)
	if period == "" {
		period = time.Now().Format("2006-01")
	}

	reportHash := strings.TrimSpace(payload.ReportHash)
	if reportHash == "" {
		house, hasHouse := server.store.GetHouseByID(houseID)
		if !hasHouse {
			writeError(writer, http.StatusNotFound, "house not found")
			return
		}
		apartments := server.store.GetApartmentsByHouseID(houseID)
		reportHash = hashAny(map[string]any{
			"house":      house,
			"period":     period,
			"apartments": apartments,
		})
	}

	if !strings.HasPrefix(reportHash, "0x") || len(reportHash) != 66 {
		writeError(writer, http.StatusBadRequest, "report_hash must be 32-byte hex string with 0x prefix")
		return
	}

	if existing, found := server.store.FindReportAnchor(houseID, period, reportHash); found {
		writeJSON(writer, http.StatusOK, existing)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	anchor := domain.ReportAnchor{
		ID:              fmt.Sprintf("anchor-%d", time.Now().UnixNano()),
		HouseID:         houseID,
		Period:          period,
		MetadataURI:     strings.TrimSpace(payload.MetadataURI),
		ReportHash:      reportHash,
		TriggeredBy:     user.ID,
		Status:          domain.TxStatusPending,
		ChainID:         server.chainID(),
		ContractAddress: server.contractAddress(),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	server.store.UpsertReportAnchor(anchor)

	txResult := web3.TxResult{Status: domain.TxStatusFailed, Error: "web3 client is not initialized"}
	var callErr error
	if server.web3 != nil {
		txResult, callErr = server.web3.AnchorReport(request.Context(), web3.ReportAnchorRequest{
			ReportHash:  reportHash,
			HouseID:     houseID,
			Period:      period,
			MetadataURI: strings.TrimSpace(payload.MetadataURI),
		})
	}

	anchor.TxHash = txResult.TxHash
	anchor.BlockNumber = txResult.BlockNumber
	anchor.ExplorerURL = txResult.ExplorerURL
	anchor.ErrorMessage = txResult.Error
	anchor.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if txResult.Status != "" {
		anchor.Status = txResult.Status
	}
	if callErr != nil {
		anchor.Status = domain.TxStatusFailed
		anchor.ErrorMessage = callErr.Error()
	}
	server.store.UpsertReportAnchor(anchor)

	log.Printf("request_id=%s house_id=%s action_type=anchor_report tx_hash=%s status=%s", requestID(request), houseID, anchor.TxHash, anchor.Status)
	writeJSON(writer, http.StatusOK, anchor)
}

func (server *Server) handleReportAnchors(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}

	houseID := request.PathValue("houseID")
	if !canAccessHouse(user, houseID) {
		writeError(writer, http.StatusForbidden, "forbidden for this house")
		return
	}

	writeJSON(writer, http.StatusOK, server.store.ListReportAnchors(houseID))
}

func (server *Server) handleProveManagerAction(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}
	if user.Role != domain.RoleManager {
		writeError(writer, http.StatusForbidden, "only manager can prove manager actions")
		return
	}

	var payload proveManagerActionRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid json payload")
		return
	}

	houseID := strings.TrimSpace(payload.HouseID)
	if houseID == "" {
		houseID = user.HouseID
	}
	if !canAccessHouse(user, houseID) {
		writeError(writer, http.StatusForbidden, "forbidden for this house")
		return
	}

	actionType := strings.TrimSpace(payload.ActionType)
	if actionType == "" {
		writeError(writer, http.StatusBadRequest, "action_type is required")
		return
	}

	actorID := strings.TrimSpace(payload.ActorID)
	if actorID == "" {
		actorID = user.ID
	}

	actionHash := hashAny(map[string]any{
		"house_id":    houseID,
		"action_type": actionType,
		"actor_id":    actorID,
		"payload":     payload.Payload,
	})

	if existing, found := server.store.FindManagerActionProof(houseID, actionHash); found {
		writeJSON(writer, http.StatusOK, existing)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	proof := domain.ManagerActionProof{
		ID:              fmt.Sprintf("action-proof-%d", time.Now().UnixNano()),
		HouseID:         houseID,
		ActionType:      actionType,
		ActorID:         actorID,
		ActionHash:      actionHash,
		TriggeredBy:     user.ID,
		Status:          domain.TxStatusPending,
		ChainID:         server.chainID(),
		ContractAddress: server.contractAddress(),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	server.store.UpsertManagerActionProof(proof)

	txResult := web3.TxResult{Status: domain.TxStatusFailed, Error: "web3 client is not initialized"}
	var callErr error
	if server.web3 != nil {
		txResult, callErr = server.web3.ProveManagerAction(request.Context(), web3.ManagerActionRequest{
			ActionHash: actionHash,
			HouseID:    houseID,
			ActionType: actionType,
			ActorID:    actorID,
		})
	}

	proof.TxHash = txResult.TxHash
	proof.BlockNumber = txResult.BlockNumber
	proof.ExplorerURL = txResult.ExplorerURL
	proof.ErrorMessage = txResult.Error
	proof.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if txResult.Status != "" {
		proof.Status = txResult.Status
	}
	if callErr != nil {
		proof.Status = domain.TxStatusFailed
		proof.ErrorMessage = callErr.Error()
	}
	server.store.UpsertManagerActionProof(proof)

	log.Printf("request_id=%s house_id=%s action_type=%s tx_hash=%s status=%s", requestID(request), houseID, actionType, proof.TxHash, proof.Status)
	writeJSON(writer, http.StatusOK, proof)
}

func (server *Server) handleManagerActionProofs(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}

	houseID := strings.TrimSpace(request.URL.Query().Get("house_id"))
	if houseID == "" {
		houseID = user.HouseID
	}
	if !canAccessHouse(user, houseID) {
		writeError(writer, http.StatusForbidden, "forbidden for this house")
		return
	}

	writeJSON(writer, http.StatusOK, server.store.ListManagerActionProofs(houseID))
}

func hashAny(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		sum := sha256.Sum256([]byte(fmt.Sprintf("%v", value)))
		return "0x" + hex.EncodeToString(sum[:])
	}

	sum := sha256.Sum256(raw)
	return "0x" + hex.EncodeToString(sum[:])
}

func requestID(request *http.Request) string {
	header := strings.TrimSpace(request.Header.Get("X-Request-ID"))
	if header != "" {
		return header
	}
	return fmt.Sprintf("req-%d", time.Now().UnixNano())
}

func (server *Server) chainID() int64 {
	if server.web3 == nil {
		return 0
	}
	return server.web3.ChainID()
}

func (server *Server) contractAddress() string {
	if server.web3 == nil {
		return ""
	}
	return server.web3.ContractAddress()
}
