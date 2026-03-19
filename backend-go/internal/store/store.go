package store

import (
	"fmt"
	"math"
	"math/rand"
	"slices"
	"strings"
	"sync"
	"time"

	"second-team-hack/backend-go/internal/domain"
)

type Store struct {
	mu sync.RWMutex

	usersByEmail map[string]domain.User
	usersByID    map[string]domain.User
	houses       map[string]domain.House
	apartments   map[string]domain.Apartment
	alerts       []domain.ResourceAlert
	meters       []domain.MeterHealth
	anchors      []domain.ReportAnchor
	actionProofs []domain.ManagerActionProof
}

func New() *Store {
	s := &Store{
		usersByEmail: make(map[string]domain.User),
		usersByID:    make(map[string]domain.User),
		houses:       make(map[string]domain.House),
		apartments:   make(map[string]domain.Apartment),
	}
	s.seedData()
	return s
}

func (s *Store) seedData() {
	houses := []domain.House{
		{ID: "house-1", Name: "Maple Residence", Address: "12 Maple Street", UnitsCount: 42, OccupancyRate: 94, Manager: "Olivia Smith"},
		{ID: "house-2", Name: "River Park", Address: "88 River Avenue", UnitsCount: 60, OccupancyRate: 89, Manager: "Lucas Martin"},
		{ID: "house-3", Name: "Oak Gardens", Address: "31 Oak Lane", UnitsCount: 28, OccupancyRate: 96, Manager: "Emma Wilson"},
	}

	for _, house := range houses {
		s.houses[house.ID] = house
	}

	for floor := 12; floor >= 1; floor-- {
		for unit := 1; unit <= 8; unit++ {
			apartment := generateApartment("house-1", floor, unit)
			s.apartments[apartment.ID] = apartment
		}
	}

	s.alerts = []domain.ResourceAlert{
		{ID: "a-1", HouseID: "house-1", HouseName: "Maple Residence", Resource: "gas", Severity: "high", Title: "Unexpected night-time gas usage spike", DetectedAt: "10:14"},
		{ID: "a-2", HouseID: "house-1", HouseName: "Maple Residence", Resource: "water", Severity: "medium", Title: "Persistent leak pattern in section B", DetectedAt: "09:02"},
		{ID: "a-3", HouseID: "house-2", HouseName: "River Park", Resource: "electricity", Severity: "low", Title: "Elevator power draw above baseline", DetectedAt: "07:48"},
	}
	s.meters = []domain.MeterHealth{
		{ID: "m-1", HouseID: "house-1", HouseName: "Maple Residence", Resource: "electricity", SignalStrength: "good", LastSync: "2 min ago"},
		{ID: "m-2", HouseID: "house-1", HouseName: "Maple Residence", Resource: "water", SignalStrength: "weak", LastSync: "9 min ago"},
		{ID: "m-3", HouseID: "house-2", HouseName: "River Park", Resource: "gas", SignalStrength: "offline", LastSync: "53 min ago"},
		{ID: "m-4", HouseID: "house-3", HouseName: "Oak Gardens", Resource: "heating", SignalStrength: "good", LastSync: "1 min ago"},
	}

	manager := domain.User{
		ID:       "user-manager-1",
		Email:    "manager@resmonitor.kz",
		Password: "manager123",
		FullName: "Olivia Smith",
		Role:     domain.RoleManager,
		HouseID:  "house-1",
	}
	resident := domain.User{
		ID:          "user-resident-1",
		Email:       "resident@resmonitor.kz",
		Password:    "resident123",
		FullName:    "Alex Johnson",
		Role:        domain.RoleResident,
		HouseID:     "house-1",
		ApartmentID: "apt-804",
	}

	s.usersByEmail[manager.Email] = manager
	s.usersByEmail[resident.Email] = resident
	s.usersByID[manager.ID] = manager
	s.usersByID[resident.ID] = resident
}

func generateApartment(houseID string, floor int, unit int) domain.Apartment {
	seed := int64(floor*1000 + unit*37)
	rng := rand.New(rand.NewSource(seed))

	number := fmt.Sprintf("%d%02d", floor, unit)
	id := "apt-" + number

	basePower := randomBetween(rng, 1.4, 2.8)
	baseWater := randomBetween(rng, 18, 42)

	electricityDaily := generateDailySeries(rng, basePower, 0.35, 4.5, 6.3)
	waterDaily := generateDailySeries(rng, baseWater, 6.5, 4.8, 7.8)
	co2Series := toIntSeries(generateDailySeries(rng, randomBetween(rng, 480, 640), 26, 12, 15))
	humiditySeries := toIntSeries(generateDailySeries(rng, randomBetween(rng, 38, 52), 4, 18, 10))

	electricityMonthly := make([]float64, 30)
	waterMonthly := make([]float64, 30)
	for day := 0; day < 30; day++ {
		weekendBoost := 1.0
		if day%7 == 5 || day%7 == 6 {
			weekendBoost = 1.08
		}
		electricityMonthly[day] = math.Round((basePower*20+randomBetween(rng, -4, 5))*weekendBoost*100) / 100

		waterWeekendBoost := 1.0
		if day%7 == 5 || day%7 == 6 {
			waterWeekendBoost = 1.12
		}
		waterMonthly[day] = math.Round((baseWater*3.5+randomBetween(rng, -8, 9))*waterWeekendBoost*100) / 100
	}

	anomalies := []string{}
	anomalyRoll := rng.Float64()
	if anomalyRoll > 0.45 {
		anomalies = append(anomalies, "Unusual electricity spike at 19:00")
	}
	if anomalyRoll < 0.55 {
		anomalies = append(anomalies, "Possible water leak at 07:00")
	}
	if anomalyRoll > 0.25 && anomalyRoll < 0.72 {
		anomalies = append(anomalies, "CO2 comfort drop detected at 18:00")
	}

	score := clampInt(int(math.Round(100-total(electricityDaily)*0.85-total(waterDaily)*0.06+randomBetween(rng, 8, 16))), 48, 97)

	return domain.Apartment{
		ID:                 id,
		HouseID:            houseID,
		Floor:              floor,
		Unit:               unit,
		Number:             number,
		Score:              score,
		Status:             statusFromScore(score),
		ElectricityDaily:   electricityDaily,
		WaterDaily:         waterDaily,
		ElectricityMonthly: electricityMonthly,
		WaterMonthly:       waterMonthly,
		CO2Series:          co2Series,
		HumiditySeries:     humiditySeries,
		Anomalies:          anomalies,
		Savings:            int(math.Round(randomBetween(rng, 9, 24))),
	}
}

func (s *Store) GetUserByEmail(email string) (domain.User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, ok := s.usersByEmail[email]
	return user, ok
}

func (s *Store) GetUserByID(userID string) (domain.User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, ok := s.usersByID[userID]
	return user, ok
}

func (s *Store) CreateUser(email, password, fullName string, role domain.Role) (domain.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.usersByEmail[email]; exists {
		return domain.User{}, fmt.Errorf("email already registered")
	}

	userID := fmt.Sprintf("user-%d", time.Now().UnixNano())
	user := domain.User{
		ID:       userID,
		Email:    email,
		Password: password,
		FullName: fullName,
		Role:     role,
		HouseID:  "house-1",
	}
	if role == domain.RoleResident {
		user.ApartmentID = "apt-801"
	}

	s.usersByEmail[email] = user
	s.usersByID[userID] = user
	return user, nil
}

func (s *Store) GetHousesForUser(user domain.User) []domain.House {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if user.Role == domain.RoleManager {
		house, ok := s.houses[user.HouseID]
		if !ok {
			return []domain.House{}
		}
		return []domain.House{house}
	}

	house, ok := s.houses[user.HouseID]
	if !ok {
		return []domain.House{}
	}
	return []domain.House{house}
}

func (s *Store) GetHouseByID(houseID string) (domain.House, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	house, ok := s.houses[houseID]
	return house, ok
}

func (s *Store) GetApartmentsByHouseID(houseID string) []domain.Apartment {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]domain.Apartment, 0, len(s.apartments))
	for _, apartment := range s.apartments {
		if apartment.HouseID == houseID {
			out = append(out, apartment)
		}
	}

	slices.SortFunc(out, func(a, b domain.Apartment) int {
		if a.Floor == b.Floor {
			return b.Unit - a.Unit
		}
		return b.Floor - a.Floor
	})
	return out
}

func (s *Store) GetApartmentByID(apartmentID string) (domain.Apartment, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	apartment, ok := s.apartments[apartmentID]
	return apartment, ok
}

func (s *Store) GetAlertsByHouseID(houseID string) []domain.ResourceAlert {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]domain.ResourceAlert, 0)
	for _, alert := range s.alerts {
		if houseID == "" || alert.HouseID == houseID {
			out = append(out, alert)
		}
	}
	return out
}

func (s *Store) GetMetersByHouseID(houseID string) []domain.MeterHealth {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]domain.MeterHealth, 0)
	for _, meter := range s.meters {
		if houseID == "" || meter.HouseID == houseID {
			out = append(out, meter)
		}
	}
	return out
}

func (s *Store) FindReportAnchor(houseID string, period string, reportHash string) (domain.ReportAnchor, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, anchor := range s.anchors {
		if anchor.HouseID == houseID && anchor.Period == period && anchor.ReportHash == reportHash {
			return anchor, true
		}
	}
	return domain.ReportAnchor{}, false
}

func (s *Store) UpsertReportAnchor(anchor domain.ReportAnchor) domain.ReportAnchor {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index := range s.anchors {
		if s.anchors[index].ID == anchor.ID {
			s.anchors[index] = anchor
			return anchor
		}
	}

	s.anchors = append(s.anchors, anchor)
	return anchor
}

func (s *Store) ListReportAnchors(houseID string) []domain.ReportAnchor {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]domain.ReportAnchor, 0)
	for _, anchor := range s.anchors {
		if houseID == "" || anchor.HouseID == houseID {
			items = append(items, anchor)
		}
	}

	slices.SortFunc(items, func(a, b domain.ReportAnchor) int {
		return strings.Compare(b.CreatedAt, a.CreatedAt)
	})
	return items
}

func (s *Store) FindManagerActionProof(houseID string, actionHash string) (domain.ManagerActionProof, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, proof := range s.actionProofs {
		if proof.HouseID == houseID && proof.ActionHash == actionHash {
			return proof, true
		}
	}
	return domain.ManagerActionProof{}, false
}

func (s *Store) UpsertManagerActionProof(proof domain.ManagerActionProof) domain.ManagerActionProof {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index := range s.actionProofs {
		if s.actionProofs[index].ID == proof.ID {
			s.actionProofs[index] = proof
			return proof
		}
	}

	s.actionProofs = append(s.actionProofs, proof)
	return proof
}

func (s *Store) ListManagerActionProofs(houseID string) []domain.ManagerActionProof {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]domain.ManagerActionProof, 0)
	for _, proof := range s.actionProofs {
		if houseID == "" || proof.HouseID == houseID {
			items = append(items, proof)
		}
	}

	slices.SortFunc(items, func(a, b domain.ManagerActionProof) int {
		return strings.Compare(b.CreatedAt, a.CreatedAt)
	})
	return items
}

func randomBetween(rng *rand.Rand, min float64, max float64) float64 {
	return min + rng.Float64()*(max-min)
}

func generateDailySeries(rng *rand.Rand, base float64, variability float64, morningBoost float64, eveningBoost float64) []float64 {
	values := make([]float64, 24)
	for hour := 0; hour < 24; hour++ {
		morningPeak := math.Exp(-math.Pow(float64(hour)-7.5, 2) / morningBoost)
		eveningPeak := math.Exp(-math.Pow(float64(hour)-19, 2) / eveningBoost)
		nightLow := 1.0
		if hour >= 0 && hour <= 4 {
			nightLow = 0.68
		}
		jitter := randomBetween(rng, -variability, variability)
		values[hour] = math.Max(0, (base+morningPeak*base*0.85+eveningPeak*base*0.95+jitter)*nightLow)
	}
	return values
}

func toIntSeries(values []float64) []int {
	out := make([]int, len(values))
	for index, value := range values {
		out[index] = int(math.Round(value))
	}
	return out
}

func total(values []float64) float64 {
	sum := 0.0
	for _, value := range values {
		sum += value
	}
	return sum
}

func statusFromScore(score int) domain.ApartmentStatus {
	if score >= 80 {
		return domain.StatusGood
	}
	if score >= 60 {
		return domain.StatusWatch
	}
	return domain.StatusAlert
}

func clampInt(value int, min int, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
