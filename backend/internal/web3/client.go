package web3

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"second-team-hack/backend-go/internal/domain"
)

const proofRegistryABI = `[
  {
    "inputs": [
      {"internalType":"bytes32","name":"reportHash","type":"bytes32"},
      {"internalType":"string","name":"houseId","type":"string"},
      {"internalType":"string","name":"period","type":"string"},
      {"internalType":"string","name":"metadataUri","type":"string"}
    ],
    "name":"anchorReport",
    "outputs": [],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs": [
      {"internalType":"bytes32","name":"actionHash","type":"bytes32"},
      {"internalType":"string","name":"houseId","type":"string"},
      {"internalType":"string","name":"actionType","type":"string"},
      {"internalType":"string","name":"actorId","type":"string"}
    ],
    "name":"proveManagerAction",
    "outputs": [],
    "stateMutability":"nonpayable",
    "type":"function"
  }
]`

type Client struct {
	config   Config
	enabled  bool
	eth      *ethclient.Client
	contract *bind.BoundContract
	chainID  *big.Int
	key      *ecdsa.PrivateKey
}

func NewClient(config Config) (*Client, error) {
	client := &Client{
		config: config,
	}

	if config.ReceiptTimeoutS <= 0 {
		client.config.ReceiptTimeoutS = 45
	}

	missingConfig := config.RPCURL == "" || config.ContractAddress == "" || config.SignerPrivateKey == "" || config.ChainID == 0
	if missingConfig {
		return client, nil
	}

	ethClient, err := ethclient.Dial(config.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("web3 rpc dial failed: %w", err)
	}

	contractABI, err := abi.JSON(strings.NewReader(proofRegistryABI))
	if err != nil {
		return nil, fmt.Errorf("proof registry abi parse failed: %w", err)
	}

	privateKey, err := crypto.HexToECDSA(strings.TrimPrefix(config.SignerPrivateKey, "0x"))
	if err != nil {
		return nil, fmt.Errorf("invalid signer private key: %w", err)
	}

	contractAddress := common.HexToAddress(config.ContractAddress)
	client.eth = ethClient
	client.contract = bind.NewBoundContract(contractAddress, contractABI, ethClient, ethClient, ethClient)
	client.chainID = big.NewInt(config.ChainID)
	client.key = privateKey
	client.enabled = true

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
	return client.sendWithRetry(ctx, "anchorReport", hashToBytes32(request.ReportHash), request.HouseID, request.Period, request.MetadataURI)
}

func (client *Client) ProveManagerAction(ctx context.Context, request ManagerActionRequest) (TxResult, error) {
	return client.sendWithRetry(ctx, "proveManagerAction", hashToBytes32(request.ActionHash), request.HouseID, request.ActionType, request.ActorID)
}

func (client *Client) sendWithRetry(ctx context.Context, method string, params ...any) (TxResult, error) {
	if !client.IsEnabled() {
		return TxResult{
			Status: domain.TxStatusFailed,
			Error:  "web3 client is disabled: missing RPC/contract/private key configuration",
		}, nil
	}

	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		txResult, err := client.send(ctx, method, params...)
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

func (client *Client) send(ctx context.Context, method string, params ...any) (TxResult, error) {
	transactor, err := bind.NewKeyedTransactorWithChainID(client.key, client.chainID)
	if err != nil {
		return TxResult{}, fmt.Errorf("create transactor failed: %w", err)
	}

	transactor.Context = ctx
	tx, err := client.contract.Transact(transactor, method, params...)
	if err != nil {
		return TxResult{}, fmt.Errorf("contract transact failed: %w", err)
	}

	result := TxResult{
		Status:      domain.TxStatusPending,
		TxHash:      tx.Hash().Hex(),
		ExplorerURL: withExplorer(client.config.ExplorerBaseURL, tx.Hash().Hex()),
	}

	if !client.config.WaitForReceipt {
		return result, nil
	}

	waitCtx, cancel := context.WithTimeout(ctx, time.Duration(client.config.ReceiptTimeoutS)*time.Second)
	defer cancel()

	receipt, waitErr := bind.WaitMined(waitCtx, client.eth, tx)
	if waitErr != nil {
		return result, nil
	}

	result.BlockNumber = receipt.BlockNumber.Uint64()
	if receipt.Status == types.ReceiptStatusSuccessful {
		result.Status = domain.TxStatusConfirmed
		return result, nil
	}

	result.Status = domain.TxStatusFailed
	result.Error = "transaction reverted"
	return result, nil
}

func hashToBytes32(hashHex string) [32]byte {
	hash := common.HexToHash(hashHex)
	var out [32]byte
	copy(out[:], hash.Bytes())
	return out
}

func withExplorer(baseURL string, txHash string) string {
	if strings.TrimSpace(baseURL) == "" || strings.TrimSpace(txHash) == "" {
		return ""
	}

	clean := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return clean + "/tx/" + txHash
}
