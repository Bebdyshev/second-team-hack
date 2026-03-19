package main

import (
	"log"
	"net/http"
	"os"

	"second-team-hack/backend-go/internal/auth"
	"second-team-hack/backend-go/internal/httpapi"
	"second-team-hack/backend-go/internal/store"
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
	server := httpapi.NewServer(dataStore, tokenService)

	log.Printf("backend-go listening on :%s", port)
	if err := http.ListenAndServe(":"+port, server.Handler()); err != nil {
		log.Fatal(err)
	}
}
