"""
Unified Configuration Management System

This module provides a centralized configuration management system that:
1. Loads configuration from multiple sources (environment variables, YAML files, defaults)
2. Validates configuration values with type checking
3. Provides consistent access patterns across the application
4. Supports hot-reloading in development mode
"""

import os
import yaml
from pathlib import Path
from typing import Any, Dict, Optional, Union, List, TypeVar, Type
from pydantic import BaseModel, Field, validator, ValidationError
from enum import Enum
import logging

logger = logging.getLogger(__name__)

# Type variable for configuration sections
T = TypeVar('T', bound='BaseConfig')

class Environment(str, Enum):
    """Application environment types"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TESTING = "testing"

class DatabaseConfig(BaseModel):
    """Database configuration"""
    url: str = Field(default="sqlite:///app/auth/auth.db", description="Database connection URL")
    pool_size: int = Field(default=10, description="Connection pool size")
    max_overflow: int = Field(default=20, description="Maximum overflow connections")
    pool_recycle: int = Field(default=3600, description="Connection pool recycle time in seconds")
    echo: bool = Field(default=False, description="Enable SQL query logging")
    
    @validator('url')
    def validate_database_url(cls, v):
        """Validate database URL format"""
        if not v:
            raise ValueError("Database URL cannot be empty")
        return v

class SecurityConfig(BaseModel):
    """Security configuration"""
    jwt_secret_file: str = Field(default=".secrets/jwt_secret", description="Path to JWT secret file")
    fernet_secret_file: str = Field(default=".secrets/fernet_secret", description="Path to Fernet secret file")
    access_token_expire_minutes: int = Field(default=15, description="Access token expiration in minutes")
    refresh_token_expire_days: int = Field(default=30, description="Refresh token expiration in days")
    allowed_origins: List[str] = Field(
        default=[
            "http://localhost:5178",
            "http://localhost:5179",
            "http://localhost:7070",
            "http://localhost:8000",
            "http://172.0.0.1:5178",
            "http://172.0.0.1:7070",
            "http://170.0.0.1:8000",
        ],
        description="Allowed CORS origins"
    )
    
    @validator('access_token_expire_minutes')
    def validate_token_expiry(cls, v):
        """Validate token expiration values"""
        if v < 1:
            raise ValueError("Access token expiration must be at least 1 minute")
        return v

class PathsConfig(BaseModel):
    """File system paths configuration"""
    base_dir: str = Field(default=".", description="Base directory for relative paths")
    media_dir: str = Field(default="media", description="Media directory for uploads and generated files")
    data_dir: str = Field(default="data", description="Data directory for databases and storage")
    config_path: str = Field(default="config.yaml", description="Path to YAML configuration file")
    
    @validator('media_dir', 'data_dir')
    def resolve_paths(cls, v, values):
        """Resolve relative paths to absolute paths"""
        if os.path.isabs(v):
            return v
        base_dir = values.get('base_dir', '.')
        return str(Path(base_dir) / v)

class LLMConfig(BaseModel):
    """LLM configuration"""
    model_name: str = Field(default="Default Model", description="Default model name")
    provider: str = Field(default="openai", description="Default LLM provider")
    model: str = Field(default="gpt-4-turbo", description="Default model identifier")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Default temperature")
    max_tokens: int = Field(default=2000, ge=1, description="Default maximum tokens")
    
    @validator('provider')
    def validate_provider(cls, v):
        """Validate LLM provider"""
        valid_providers = ["openai", "google", "anthropic", "xai", "deepseek", "zhipu", "local"]
        if v not in valid_providers:
            raise ValueError(f"Invalid provider '{v}'. Must be one of: {valid_providers}")
        return v

class ServerConfig(BaseModel):
    """Server configuration"""
    host: str = Field(default="0.0.0.0", description="Server host address")
    port: int = Field(default=8000, ge=1, le=65535, description="Server port")
    workers: int = Field(default=1, ge=1, description="Number of worker processes")
    reload: bool = Field(default=False, description="Enable auto-reload in development")
    log_level: str = Field(default="INFO", description="Logging level")
    
    @validator('log_level')
    def validate_log_level(cls, v):
        """Validate logging level"""
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in valid_levels:
            raise ValueError(f"Invalid log level '{v}'. Must be one of: {valid_levels}")
        return v.upper()

class AppConfig(BaseModel):
    """Main application configuration"""
    environment: Environment = Field(default=Environment.DEVELOPMENT, description="Application environment")
    debug: bool = Field(default=False, description="Enable debug mode")
    api_v1_prefix: str = Field(default="/api", description="API v1 prefix")
    
    # Sub-configurations
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    security: SecurityConfig = Field(default_factory=SecurityConfig)
    paths: PathsConfig = Field(default_factory=PathsConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    
    class Config:
        env_prefix = "APP_"
        case_sensitive = False

class ConfigManager:
    """
    Centralized configuration manager that loads configuration from multiple sources
    with proper validation and type checking.
    """
    
    _instance: Optional['ConfigManager'] = None
    _config: Optional[AppConfig] = None
    
    def __new__(cls):
        """Singleton pattern to ensure single configuration instance"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize configuration manager"""
        if self._config is None:
            self._config = self._load_configuration()
    
    def _load_configuration(self) -> AppConfig:
        """
        Load configuration from multiple sources in order of precedence:
        1. Environment variables (highest priority)
        2. YAML configuration file
        3. Default values (lowest priority)
        """
        # Load YAML configuration if exists
        yaml_config = self._load_yaml_config()
        
        # Merge configurations
        merged_config = self._merge_configurations(yaml_config)
        
        # Create and validate configuration
        try:
            config = AppConfig(**merged_config)
            logger.info(f"Configuration loaded successfully for {config.environment.value} environment")
            return config
        except ValidationError as e:
            logger.error(f"Configuration validation failed: {e}")
            raise
    
    def _load_yaml_config(self) -> Dict[str, Any]:
        """Load configuration from YAML file"""
        config_path = os.getenv("CONFIG_PATH", "config.yaml")
        
        if not os.path.exists(config_path):
            logger.debug(f"Configuration file not found at {config_path}, using defaults")
            return {}
        
        try:
            with open(config_path, 'r') as f:
                config_data = yaml.safe_load(f) or {}
            logger.info(f"Loaded configuration from {config_path}")
            return config_data
        except Exception as e:
            logger.warning(f"Failed to load configuration from {config_path}: {e}")
            return {}
    
    def _merge_configurations(self, yaml_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge configurations from multiple sources with proper precedence.
        
        Environment variables have the highest priority, followed by YAML config,
        then defaults.
        """
        merged = {}
        
        # Helper function to convert environment variable names to nested dict keys
        def env_to_dict(env_dict: Dict[str, str]) -> Dict[str, Any]:
            """Convert environment variables with underscores to nested dictionary"""
            result = {}
            for key, value in env_dict.items():
                if key.startswith("APP_"):
                    # Remove APP_ prefix and convert to lowercase
                    key = key[4:].lower()
                    parts = key.split('_')
                    
                    # Build nested dictionary structure
                    current = result
                    for i, part in enumerate(parts[:-1]):
                        if part not in current:
                            current[part] = {}
                        current = current[part]
                    
                    # Set the value
                    current[parts[-1]] = self._parse_env_value(value)
            
            return result
        
        # Load environment variables
        env_vars = {k: v for k, v in os.environ.items() if k.startswith("APP_")}
        env_config = env_to_dict(env_vars)
        
        # Deep merge: environment variables override YAML config
        self._deep_merge(merged, yaml_config)
        self._deep_merge(merged, env_config)
        
        return merged
    
    def _parse_env_value(self, value: str) -> Any:
        """Parse environment variable string to appropriate Python type"""
        if value.lower() in ('true', 'false'):
            return value.lower() == 'true'
        elif value.isdigit():
            return int(value)
        elif value.replace('.', '', 1).isdigit() and value.count('.') == 1:
            return float(value)
        elif value.startswith('[') and value.endswith(']'):
            # Simple list parsing (comma-separated)
            items = value[1:-1].split(',')
            return [item.strip() for item in items if item.strip()]
        else:
            return value
    
    def _deep_merge(self, target: Dict[str, Any], source: Dict[str, Any]) -> None:
        """Deep merge source dictionary into target dictionary"""
        for key, value in source.items():
            if key in target and isinstance(target[key], dict) and isinstance(value, dict):
                self._deep_merge(target[key], value)
            else:
                target[key] = value
    
    def get_config(self) -> AppConfig:
        """Get the current configuration"""
        return self._config
    
    def get_section(self, section: str) -> Any:
        """Get a specific configuration section"""
        if not hasattr(self._config, section):
            raise ValueError(f"Configuration section '{section}' not found")
        return getattr(self._config, section)
    
    def reload(self) -> None:
        """Reload configuration (useful for development)"""
        logger.info("Reloading configuration...")
        self._config = self._load_configuration()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary"""
        return self._config.dict()
    
    def save_to_yaml(self, path: str) -> None:
        """Save current configuration to YAML file"""
        config_dict = self.to_dict()
        
        # Convert enums to strings
        def convert_enums(obj):
            if isinstance(obj, Enum):
                return obj.value
            elif isinstance(obj, dict):
                return {k: convert_enums(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_enums(item) for item in obj]
            else:
                return obj
        
        config_dict = convert_enums(config_dict)
        
        with open(path, 'w') as f:
            yaml.dump(config_dict, f, default_flow_style=False, sort_keys=False)
        
        logger.info(f"Configuration saved to {path}")

# Global configuration instance
config_manager = ConfigManager()

# Convenience functions for backward compatibility
def get_config() -> AppConfig:
    """Get the current configuration (backward compatibility)"""
    return config_manager.get_config()

def get_database_config() -> DatabaseConfig:
    """Get database configuration (backward compatibility)"""
    return config_manager.get_section('database')

def get_security_config() -> SecurityConfig:
    """Get security configuration (backward compatibility)"""
    return config_manager.get_section('security')

def get_paths_config() -> PathsConfig:
    """Get paths configuration (backward compatibility)"""
    return config_manager.get_section('paths')

def get_llm_config() -> LLMConfig:
    """Get LLM configuration (backward compatibility)"""
    return config_manager.get_section('llm')

def get_server_config() -> ServerConfig:
    """Get server configuration (backward compatibility)"""
    return config_manager.get_section('server')

# Environment-specific helpers
def is_development() -> bool:
    """Check if running in development environment"""
    return config_manager.get_config().environment == Environment.DEVELOPMENT

def is_production() -> bool:
    """Check if running in production environment"""
    return config_manager.get_config().environment == Environment.PRODUCTION

def is_testing() -> bool:
    """Check if running in testing environment"""
    return config_manager.get_config().environment == Environment.TESTING

# Path resolution helpers
def get_media_dir() -> Path:
    """Get absolute path to media directory"""
    paths_config = get_paths_config()
    media_path = Path(paths_config.media_dir)
    if not media_path.is_absolute():
        base_dir = Path(paths_config.base_dir)
        media_path = base_dir / media_path
    return media_path.resolve()

def get_data_dir() -> Path:
    """Get absolute path to data directory"""
    paths_config = get_paths_config()
    data_path = Path(paths_config.data_dir)
    if not data_path.is_absolute():
        base_dir = Path(paths_config.base_dir)
        data_path = base_dir / data_path
    return data_path.resolve()

def get_database_path() -> str:
    """Get absolute path to database file (backward compatibility)"""
    data_dir = get_data_dir()
    sql_db_path = data_dir / "sql_db"
    sql_db_path.mkdir(parents=True, exist_ok=True)
    return str(sql_db_path / "app.db")

# Initialize logging based on configuration
def setup_logging():
    """Setup logging based on configuration"""
    config = get_config()
    logging.basicConfig(
        level=getattr(logging, config.server.log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )