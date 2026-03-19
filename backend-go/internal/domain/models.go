package domain

type Role string

const (
	RoleManager  Role = "Manager"
	RoleResident Role = "Resident"
)

type User struct {
	ID          string
	Email       string
	Password    string
	FullName    string
	Role        Role
	HouseID     string
	ApartmentID string
}

type House struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Address       string `json:"address"`
	UnitsCount    int    `json:"units_count"`
	OccupancyRate int    `json:"occupancy_rate"`
	Manager       string `json:"manager"`
}

type ApartmentStatus string

const (
	StatusGood  ApartmentStatus = "good"
	StatusWatch ApartmentStatus = "watch"
	StatusAlert ApartmentStatus = "alert"
)

type Apartment struct {
	ID                 string          `json:"id"`
	HouseID            string          `json:"house_id"`
	Floor              int             `json:"floor"`
	Unit               int             `json:"unit"`
	Number             string          `json:"number"`
	Score              int             `json:"score"`
	Status             ApartmentStatus `json:"status"`
	ElectricityDaily   []float64       `json:"electricity_daily"`
	WaterDaily         []float64       `json:"water_daily"`
	ElectricityMonthly []float64       `json:"electricity_monthly"`
	WaterMonthly       []float64       `json:"water_monthly"`
	CO2Series          []int           `json:"co2_series"`
	HumiditySeries     []int           `json:"humidity_series"`
	Anomalies          []string        `json:"anomalies"`
	Savings            int             `json:"savings"`
}

type ResourceAlert struct {
	ID         string `json:"id"`
	HouseID    string `json:"house_id"`
	HouseName  string `json:"house_name"`
	Resource   string `json:"resource"`
	Severity   string `json:"severity"`
	Title      string `json:"title"`
	DetectedAt string `json:"detected_at"`
}

type MeterHealth struct {
	ID             string `json:"id"`
	HouseID        string `json:"house_id"`
	HouseName      string `json:"house_name"`
	Resource       string `json:"resource"`
	SignalStrength string `json:"signal_strength"`
	LastSync       string `json:"last_sync"`
}

type Membership struct {
	OrganizationID   string `json:"organization_id"`
	OrganizationName string `json:"organization_name"`
	Role             string `json:"role"`
}

type Organization struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type UserProfile struct {
	ID            string         `json:"id"`
	Email         string         `json:"email"`
	FullName      string         `json:"full_name"`
	Organizations []Organization `json:"organizations"`
	Memberships   []Membership   `json:"memberships"`
}

type AuthResponse struct {
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
	TokenType    string      `json:"token_type"`
	User         UserProfile `json:"user"`
}

type TxLifecycleStatus string

const (
	TxStatusPending   TxLifecycleStatus = "pending"
	TxStatusConfirmed TxLifecycleStatus = "confirmed"
	TxStatusFailed    TxLifecycleStatus = "failed"
)

type ReportAnchor struct {
	ID              string            `json:"id"`
	HouseID         string            `json:"house_id"`
	Period          string            `json:"period"`
	MetadataURI     string            `json:"metadata_uri"`
	ReportHash      string            `json:"report_hash"`
	TriggeredBy     string            `json:"triggered_by"`
	Status          TxLifecycleStatus `json:"status"`
	TxHash          string            `json:"tx_hash"`
	BlockNumber     uint64            `json:"block_number"`
	ChainID         int64             `json:"chain_id"`
	ContractAddress string            `json:"contract_address"`
	ExplorerURL     string            `json:"explorer_url"`
	ErrorMessage    string            `json:"error_message"`
	CreatedAt       string            `json:"created_at"`
	UpdatedAt       string            `json:"updated_at"`
}

type ManagerActionProof struct {
	ID              string            `json:"id"`
	HouseID         string            `json:"house_id"`
	ActionType      string            `json:"action_type"`
	ActorID         string            `json:"actor_id"`
	ActionHash      string            `json:"action_hash"`
	TriggeredBy     string            `json:"triggered_by"`
	Status          TxLifecycleStatus `json:"status"`
	TxHash          string            `json:"tx_hash"`
	BlockNumber     uint64            `json:"block_number"`
	ChainID         int64             `json:"chain_id"`
	ContractAddress string            `json:"contract_address"`
	ExplorerURL     string            `json:"explorer_url"`
	ErrorMessage    string            `json:"error_message"`
	CreatedAt       string            `json:"created_at"`
	UpdatedAt       string            `json:"updated_at"`
}
