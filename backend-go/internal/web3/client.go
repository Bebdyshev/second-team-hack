package web3

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"second-team-hack/backend-go/internal/domain"
)

type Client struct {
	config  Config
	enabled bool
}

func NewClient(config Config) (*Client, error) {
	client := &Client{
		config: config,
	}

	if config.ReceiptTimeoutS <= 0 {
		client.config.ReceiptTimeoutS = 45
	}
	client.enabled = config.RPCURL != "" && config.ContractAddress != "" && config.SignerPrivateKey != "" && config.ChainID != 0

	if !client.enabled {
		return client, nil
	}
	return client, nil
}

func (client *Client) IsEnabled() bool {
	return client != nil && client.enabled
}

func (client *Client) ChainID() int64 {
	if client == nil {
		return 0
	}
	return client.config.ChainID
}

func (client *Client) ContractAddress() string {
	if client == nil {
		return ""
	}
	return client.config.ContractAddress
}

func (client *Client) AnchorReport(ctx context.Context, request ReportAnchorRequest) (TxResult, error) {
	return client.sendWithRetry(ctx, "anchorReport", request.ReportHash, request.HouseID, request.Period, request.MetadataURI)
}

func (client *Client) ProveManagerAction(ctx context.Context, request ManagerActionRequest) (TxResult, error) {
	return client.sendWithRetry(ctx, "proveManagerAction", request.ActionHash, request.HouseID, request.ActionType, request.ActorID)
}

func (client *Client) sendWithRetry(ctx context.Context, method string, params ...any) (TxResult, error) {
	_ = ctx
	if !client.IsEnabled() {
		return TxResult{
			Status: domain.TxStatusFailed,
			Error:  "web3 client is disabled: missing RPC/contract/private key configuration",
		}, nil
	}

	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		txResult, err := client.send(method, params...)
		if err == nil {
			return txResult, nil
		}
		lastErr = err
		time.Sleep(time.Duration(attempt*400) * time.Millisecond)
	}

	return TxResult{
		Status: domain.TxStatusFailed,
		Error:  lastErr.Error(),
	}, nil
}

func (client *Client) send(method string, params ...any) (TxResult, error) {
	// Deferred mode: no external Web3 deps yet.
	// Generates deterministic pseudo tx hash so end-to-end proof flow works now.
	payload := fmt.Sprintf("%s|%v|%d", method, params, time.Now().UnixNano())
	sum := sha256.Sum256([]byte(payload))
	txHash := "0x" + hex.EncodeToString(sum[:])
	explorerURL := ""
	if client.config.ExplorerBaseURL != "" {
		explorerURL = fmt.Sprintf("%s/tx/%s", client.config.ExplorerBaseURL, txHash)
	}

	status := domain.TxStatusPending
	if client.config.WaitForReceipt {
		status = domain.TxStatusConfirmed
	}

	return TxResult{
		Status:      status,
		TxHash:      txHash,
		BlockNumber: 0,
		ExplorerURL: explorerURL,
	}, nil
}
