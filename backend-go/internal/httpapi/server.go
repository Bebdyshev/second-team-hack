package httpapi

import (
	"net/http"
	"sync"
	"time"

	"second-team-hack/backend-go/internal/auth"
	"second-team-hack/backend-go/internal/store"
	"second-team-hack/backend-go/internal/web3"
)

type Server struct {
	store  *store.Store
	tokens *auth.TokenService
	web3   *web3.Client
	mux    *http.ServeMux

	proofRateMu    sync.Mutex
	proofRateState map[string][]time.Time
}

func NewServer(dataStore *store.Store, tokenService *auth.TokenService, web3Client *web3.Client) *Server {
	server := &Server{
		store:  dataStore,
		tokens: tokenService,
		web3:   web3Client,
		mux:    http.NewServeMux(),

		proofRateState: make(map[string][]time.Time),
	}
	server.routes()
	return server
}

func (server *Server) Handler() http.Handler {
	return server.corsMiddleware(server.mux)
}

func (server *Server) routes() {
	server.mux.HandleFunc("GET /health", server.handleHealth)

	server.mux.HandleFunc("POST /auth/login", server.handleLogin)
	server.mux.HandleFunc("POST /auth/register", server.handleRegister)
	server.mux.HandleFunc("POST /auth/refresh", server.handleRefresh)
	server.mux.Handle("GET /auth/me", server.authMiddleware(http.HandlerFunc(server.handleMe)))

	server.mux.Handle("GET /houses", server.authMiddleware(http.HandlerFunc(server.handleHouses)))
	server.mux.Handle("GET /houses/{houseID}/summary", server.authMiddleware(http.HandlerFunc(server.handleHouseSummary)))
	server.mux.Handle("GET /houses/{houseID}/dynamics", server.authMiddleware(http.HandlerFunc(server.handleHouseDynamics)))
	server.mux.Handle("GET /houses/{houseID}/apartments", server.authMiddleware(http.HandlerFunc(server.handleHouseApartments)))
	server.mux.Handle("POST /houses/{houseID}/reports/anchor", server.authMiddleware(http.HandlerFunc(server.handleAnchorReport)))
	server.mux.Handle("GET /houses/{houseID}/reports/anchors", server.authMiddleware(http.HandlerFunc(server.handleReportAnchors)))

	server.mux.Handle("GET /apartments/{apartmentID}/summary", server.authMiddleware(http.HandlerFunc(server.handleApartmentSummary)))
	server.mux.Handle("GET /apartments/{apartmentID}/dynamics", server.authMiddleware(http.HandlerFunc(server.handleApartmentDynamics)))

	server.mux.Handle("GET /alerts", server.authMiddleware(http.HandlerFunc(server.handleAlerts)))
	server.mux.Handle("GET /meters", server.authMiddleware(http.HandlerFunc(server.handleMeters)))
	server.mux.Handle("POST /manager-actions/prove", server.authMiddleware(http.HandlerFunc(server.handleProveManagerAction)))
	server.mux.Handle("GET /manager-actions/proofs", server.authMiddleware(http.HandlerFunc(server.handleManagerActionProofs)))
}
