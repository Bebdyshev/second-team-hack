package web3

import "second-team-hack/backend-go/internal/domain"

type Config struct {
	RPCURL           string
	ChainID          int64
	ContractAddress  string
	SignerPrivateKey string
	ExplorerBaseURL  string
	WaitForReceipt   bool
	ReceiptTimeoutS  int
}

type ReportAnchorRequest struct {
	ReportHash  string
	HouseID     string
	Period      string
	MetadataURI string
}

type ManagerActionRequest struct {
	ActionHash string
	HouseID    string
	ActionType string
	ActorID    string
}

type TxResult struct {
	Status      domain.TxLifecycleStatus
	TxHash      string
	BlockNumber uint64
	ExplorerURL string
	Error       string
}
