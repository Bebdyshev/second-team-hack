package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"second-team-hack/backend-go/internal/domain"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (server *Server) handleHealth(writer http.ResponseWriter, _ *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

func (server *Server) handleLogin(writer http.ResponseWriter, request *http.Request) {
	var payload loginRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid json payload")
		return
	}

	if strings.TrimSpace(payload.Email) == "" || strings.TrimSpace(payload.Password) == "" {
		writeError(writer, http.StatusBadRequest, "email and password are required")
		return
	}

	user, ok := server.store.GetUserByEmail(strings.TrimSpace(strings.ToLower(payload.Email)))
	if !ok || user.Password != payload.Password {
		writeError(writer, http.StatusUnauthorized, "invalid credentials")
		return
	}

	response, err := server.issueAuthResponse(user)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "failed to issue auth tokens")
		return
	}

	writeJSON(writer, http.StatusOK, response)
}

func (server *Server) handleRegister(writer http.ResponseWriter, request *http.Request) {
	var payload registerRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid json payload")
		return
	}

	if strings.TrimSpace(payload.Email) == "" || strings.TrimSpace(payload.Password) == "" || strings.TrimSpace(payload.FullName) == "" {
		writeError(writer, http.StatusBadRequest, "email, password and full_name are required")
		return
	}

	role := domain.RoleResident
	if strings.EqualFold(payload.Role, string(domain.RoleManager)) {
		role = domain.RoleManager
	}

	user, err := server.store.CreateUser(strings.TrimSpace(strings.ToLower(payload.Email)), payload.Password, strings.TrimSpace(payload.FullName), role)
	if err != nil {
		writeError(writer, http.StatusConflict, err.Error())
		return
	}

	response, err := server.issueAuthResponse(user)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "failed to issue auth tokens")
		return
	}

	writeJSON(writer, http.StatusCreated, response)
}

func (server *Server) handleRefresh(writer http.ResponseWriter, request *http.Request) {
	var payload refreshRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid json payload")
		return
	}
	if strings.TrimSpace(payload.RefreshToken) == "" {
		writeError(writer, http.StatusBadRequest, "refresh_token is required")
		return
	}

	claims, err := server.tokens.ParseToken(payload.RefreshToken)
	if err != nil || claims.Type != "refresh" {
		writeError(writer, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	user, ok := server.store.GetUserByID(claims.UserID)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user not found")
		return
	}

	response, err := server.issueAuthResponse(user)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "failed to issue auth tokens")
		return
	}

	writeJSON(writer, http.StatusOK, response)
}

func (server *Server) handleMe(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}

	writeJSON(writer, http.StatusOK, toUserProfile(user, server.store))
}

func (server *Server) issueAuthResponse(user domain.User) (domain.AuthResponse, error) {
	accessToken, err := server.tokens.CreateAccessToken(user.ID)
	if err != nil {
		return domain.AuthResponse{}, err
	}

	refreshToken, err := server.tokens.CreateRefreshToken(user.ID)
	if err != nil {
		return domain.AuthResponse{}, err
	}

	return domain.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "bearer",
		User:         toUserProfile(user, server.store),
	}, nil
}

func toUserProfile(user domain.User, dataStore interface {
	GetHouseByID(houseID string) (domain.House, bool)
}) domain.UserProfile {
	house, hasHouse := dataStore.GetHouseByID(user.HouseID)
	organizations := []domain.Organization{}
	memberships := []domain.Membership{}

	if hasHouse {
		organizations = append(organizations, domain.Organization{
			ID:   house.ID,
			Name: house.Name,
		})
		memberships = append(memberships, domain.Membership{
			OrganizationID:   house.ID,
			OrganizationName: house.Name,
			Role:             string(user.Role),
		})
	}

	return domain.UserProfile{
		ID:            user.ID,
		Email:         user.Email,
		FullName:      user.FullName,
		Organizations: organizations,
		Memberships:   memberships,
	}
}
