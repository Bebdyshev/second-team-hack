import os


class Settings:
    def __init__(self) -> None:
        self.service_name = os.getenv("SERVICE_NAME", "resmonitor-data-generator")
        self.service_version = os.getenv("SERVICE_VERSION", "0.1.0")
        self.default_target_url = os.getenv("DEFAULT_TARGET_URL", "").strip()
        self.request_timeout_seconds = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "10"))


settings = Settings()
