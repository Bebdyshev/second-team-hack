package httpapi

import (
	"context"
	"net/http"
	"strings"

	"second-team-hack/backend-go/internal/domain"
)

type contextKey string

const userContextKey contextKey = "user"

func (server *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")

		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(writer, request)
	})
}

func (server *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		header := request.Header.Get("Authorization")
		if header == "" {
			writeError(writer, http.StatusUnauthorized, "missing authorization header")
			return
		}

		parts := strings.Split(header, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			writeError(writer, http.StatusUnauthorized, "invalid authorization header")
			return
		}

		claims, err := server.tokens.ParseToken(parts[1])
		if err != nil || claims.Type != "access" {
			writeError(writer, http.StatusUnauthorized, "invalid access token")
			return
		}

		user, ok := server.store.GetUserByID(claims.UserID)
		if !ok {
			writeError(writer, http.StatusUnauthorized, "user not found")
			return
		}

		ctx := context.WithValue(request.Context(), userContextKey, user)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

func currentUser(request *http.Request) (domain.User, bool) {
	user, ok := request.Context().Value(userContextKey).(domain.User)
	return user, ok
}
