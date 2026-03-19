package httpapi

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"second-team-hack/backend-go/internal/domain"
)

type houseSummaryResponse struct {
	House       domain.House `json:"house"`
	TotalPower  float64      `json:"total_power"`
	TotalWater  float64      `json:"total_water"`
	AverageAir  int          `json:"average_air"`
	CityImpact  int          `json:"city_impact"`
	AlertsCount int          `json:"alerts_count"`
}

type dynamicsPoint struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
}

func (server *Server) handleHouses(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}

	writeJSON(writer, http.StatusOK, server.store.GetHousesForUser(user))
}

func (server *Server) handleHouseSummary(writer http.ResponseWriter, request *http.Request) {
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

	house, hasHouse := server.store.GetHouseByID(houseID)
	if !hasHouse {
		writeError(writer, http.StatusNotFound, "house not found")
		return
	}

	apartments := server.store.GetApartmentsByHouseID(houseID)
	if len(apartments) == 0 {
		writeError(writer, http.StatusNotFound, "house has no apartments")
		return
	}

	totalPower := 0.0
	totalWater := 0.0
	totalAir := 0.0
	for _, apartment := range apartments {
		totalPower += total(apartment.ElectricityDaily)
		totalWater += total(apartment.WaterDaily)
		totalAir += averageInt(apartment.CO2Series)
	}

	averageAir := int(math.Round(totalAir / float64(len(apartments))))
	cityImpact := maxInt(18, minInt(84, int(math.Round(totalPower/16))))
	alerts := server.store.GetAlertsByHouseID(houseID)

	writeJSON(writer, http.StatusOK, houseSummaryResponse{
		House:       house,
		TotalPower:  round2(totalPower),
		TotalWater:  round2(totalWater),
		AverageAir:  averageAir,
		CityImpact:  cityImpact,
		AlertsCount: len(alerts),
	})
}

func (server *Server) handleHouseDynamics(writer http.ResponseWriter, request *http.Request) {
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

	resource := request.URL.Query().Get("resource")
	if resource == "" {
		resource = "electricity"
	}
	period := request.URL.Query().Get("period")
	if period == "" {
		period = "24h"
	}

	apartments := server.store.GetApartmentsByHouseID(houseID)
	if len(apartments) == 0 {
		writeError(writer, http.StatusNotFound, "house has no apartments")
		return
	}

	points := []dynamicsPoint{}
	switch period {
	case "24h":
		series := make([]float64, 24)
		for index := 0; index < 24; index++ {
			for _, apartment := range apartments {
				switch resource {
				case "electricity":
					series[index] += apartment.ElectricityDaily[index]
				case "water":
					series[index] += apartment.WaterDaily[index]
				case "co2":
					series[index] += float64(apartment.CO2Series[index])
				default:
					writeError(writer, http.StatusBadRequest, "unknown resource")
					return
				}
			}
			if resource == "co2" {
				series[index] /= float64(len(apartments))
			}
			points = append(points, dynamicsPoint{
				Label: hourLabel(index),
				Value: round2(series[index]),
			})
		}
	case "30d":
		series := make([]float64, 30)
		for index := 0; index < 30; index++ {
			for _, apartment := range apartments {
				switch resource {
				case "electricity":
					series[index] += apartment.ElectricityMonthly[index]
				case "water":
					series[index] += apartment.WaterMonthly[index]
				default:
					writeError(writer, http.StatusBadRequest, "resource not supported for 30d")
					return
				}
			}
			points = append(points, dynamicsPoint{
				Label: dayLabel(index + 1),
				Value: round2(series[index]),
			})
		}
	default:
		writeError(writer, http.StatusBadRequest, "unknown period")
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{
		"house_id":  houseID,
		"resource":  resource,
		"period":    period,
		"dynamics":  points,
		"role_hint": roleHint(user),
	})
}

func (server *Server) handleHouseApartments(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}

	if user.Role != domain.RoleManager {
		writeError(writer, http.StatusForbidden, "only manager can access full apartment list")
		return
	}

	houseID := request.PathValue("houseID")
	if !canAccessHouse(user, houseID) {
		writeError(writer, http.StatusForbidden, "forbidden for this house")
		return
	}

	writeJSON(writer, http.StatusOK, server.store.GetApartmentsByHouseID(houseID))
}

func (server *Server) handleApartmentSummary(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}

	apartmentID := request.PathValue("apartmentID")
	apartment, exists := server.store.GetApartmentByID(apartmentID)
	if !exists {
		writeError(writer, http.StatusNotFound, "apartment not found")
		return
	}

	if !canAccessApartment(user, apartment) {
		writeError(writer, http.StatusForbidden, "forbidden for this apartment")
		return
	}

	liveHour := 12
	writeJSON(writer, http.StatusOK, map[string]any{
		"apartment": apartment,
		"live_snapshot": map[string]any{
			"electricity": round2(apartment.ElectricityDaily[liveHour]),
			"water":       round2(apartment.WaterDaily[liveHour]),
			"co2":         apartment.CO2Series[liveHour],
			"humidity":    apartment.HumiditySeries[liveHour],
			"savings":     apartment.Savings,
		},
		"role_hint": roleHint(user),
	})
}

func (server *Server) handleApartmentDynamics(writer http.ResponseWriter, request *http.Request) {
	user, ok := currentUser(request)
	if !ok {
		writeError(writer, http.StatusUnauthorized, "user is not authenticated")
		return
	}

	apartmentID := request.PathValue("apartmentID")
	apartment, exists := server.store.GetApartmentByID(apartmentID)
	if !exists {
		writeError(writer, http.StatusNotFound, "apartment not found")
		return
	}

	if !canAccessApartment(user, apartment) {
		writeError(writer, http.StatusForbidden, "forbidden for this apartment")
		return
	}

	resource := request.URL.Query().Get("resource")
	if resource == "" {
		resource = "electricity"
	}
	period := request.URL.Query().Get("period")
	if period == "" {
		period = "24h"
	}

	points := []dynamicsPoint{}
	switch period {
	case "24h":
		for index := 0; index < 24; index++ {
			value := 0.0
			switch resource {
			case "electricity":
				value = apartment.ElectricityDaily[index]
			case "water":
				value = apartment.WaterDaily[index]
			case "co2":
				value = float64(apartment.CO2Series[index])
			case "humidity":
				value = float64(apartment.HumiditySeries[index])
			default:
				writeError(writer, http.StatusBadRequest, "unknown resource")
				return
			}
			points = append(points, dynamicsPoint{Label: hourLabel(index), Value: round2(value)})
		}
	case "30d":
		if resource != "electricity" && resource != "water" {
			writeError(writer, http.StatusBadRequest, "resource not supported for 30d")
			return
		}
		for index := 0; index < 30; index++ {
			value := apartment.ElectricityMonthly[index]
			if resource == "water" {
				value = apartment.WaterMonthly[index]
			}
			points = append(points, dynamicsPoint{Label: dayLabel(index + 1), Value: round2(value)})
		}
	default:
		writeError(writer, http.StatusBadRequest, "unknown period")
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{
		"apartment_id": apartment.ID,
		"resource":     resource,
		"period":       period,
		"dynamics":     points,
	})
}

func (server *Server) handleAlerts(writer http.ResponseWriter, request *http.Request) {
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

	alerts := server.store.GetAlertsByHouseID(houseID)
	writeJSON(writer, http.StatusOK, alerts)
}

func (server *Server) handleMeters(writer http.ResponseWriter, request *http.Request) {
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

	meters := server.store.GetMetersByHouseID(houseID)
	writeJSON(writer, http.StatusOK, meters)
}

func canAccessHouse(user domain.User, houseID string) bool {
	if houseID == "" {
		return false
	}
	return user.HouseID == houseID
}

func canAccessApartment(user domain.User, apartment domain.Apartment) bool {
	if user.HouseID != apartment.HouseID {
		return false
	}

	if user.Role == domain.RoleManager {
		return true
	}

	return user.ApartmentID == apartment.ID
}

func averageInt(values []int) float64 {
	if len(values) == 0 {
		return 0
	}

	sum := 0
	for _, value := range values {
		sum += value
	}
	return float64(sum) / float64(len(values))
}

func hourLabel(index int) string {
	return fmt.Sprintf("%02d:00", index)
}

func dayLabel(day int) string {
	return strconv.Itoa(day)
}

func roleHint(user domain.User) string {
	if user.Role == domain.RoleManager {
		return "manager: full house visibility"
	}
	return "resident: personal apartment + house overview"
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func total(values []float64) float64 {
	sum := 0.0
	for _, value := range values {
		sum += value
	}
	return sum
}
