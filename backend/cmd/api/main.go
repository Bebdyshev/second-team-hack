package main

import (
	"log"
	"net/http"
	"os"
	"strconv"

	"second-team-hack/backend-go/internal/auth"
	"second-team-hack/backend-go/internal/httpapi"
	"second-team-hack/backend-go/internal/store"
	"second-team-hack/backend-go/internal/web3"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "dev-secret-change-me"
	}

	dataStore := store.New()
	tokenService := auth.NewTokenService(jwtSecret)
	web3Client, err := web3.NewClient(web3.Config{
		RPCURL:           os.Getenv("WEB3_RPC_URL"),
		ChainID:          envInt64("WEB3_CHAIN_ID", 0),
		ContractAddress:  os.Getenv("WEB3_CONTRACT_ADDRESS"),
		SignerPrivateKey: os.Getenv("WEB3_SIGNER_PRIVATE_KEY"),
		ExplorerBaseURL:  os.Getenv("WEB3_EXPLORER_BASE_URL"),
		WaitForReceipt:   envBool("WEB3_WAIT_FOR_RECEIPT", true),
		ReceiptTimeoutS:  envInt("WEB3_RECEIPT_TIMEOUT_SECONDS", 45),
	})
	if err != nil {
		log.Fatalf("failed to init web3 client: %v", err)
	}

	server := httpapi.NewServer(dataStore, tokenService, web3Client)

	log.Printf("backend-go listening on :%s", port)
	if err := http.ListenAndServe(":"+port, server.Handler()); err != nil {
		log.Fatal(err)
	}
}

func envInt64(key string, fallback int64) int64 {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}
