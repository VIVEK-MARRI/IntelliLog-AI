"""
Base ML Model Abstract Class
Provides common interface for all ML models in the system
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from datetime import datetime
import hashlib
import json
import numpy as np
import pandas as pd
from pathlib import Path


class BaseMLModel(ABC):
    """
    Abstract base class for all ML models
    
    Features:
    - Version management
    - Model explainability interface
    - Monitoring hooks
    - Serialization/deserialization
    - Metadata tracking
    """
    
    def __init__(
        self,
        model_name: str,
        version: Optional[str] = None,
        model_path: Optional[Path] = None
    ):
        """
        Initialize base model
        
        Args:
            model_name: Unique model identifier
            version: Model version (auto-generated if None)
            model_path: Path to saved model artifacts
        """
        self.model_name = model_name
        self.version = version or self._generate_version()
        self.model_path = model_path
        self.model = None
        self.metadata = {
            "model_name": model_name,
            "version": self.version,
            "created_at": datetime.utcnow().isoformat(),
            "framework": self._get_framework_name()
        }
    
    def _generate_version(self) -> str:
        """Generate semantic version from timestamp"""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"v_{timestamp}"
    
    @abstractmethod
    def _get_framework_name(self) -> str:
        """Return framework name (e.g., 'xgboost', 'sklearn', 'pytorch')"""
        pass
    
    @abstractmethod
    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Train the model
        
        Returns:
            Training metrics dictionary
        """
        pass
    
    @abstractmethod
    def predict(
        self,
        X: pd.DataFrame,
        return_proba: bool = False
    ) -> np.ndarray:
        """
        Generate predictions
        
        Args:
            X: Feature matrix
            return_proba: Return probabilities (for classifiers)
        
        Returns:
            Predictions array
        """
        pass
    
    @abstractmethod
    def explain(
        self,
        X: pd.DataFrame,
        sample_idx: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate model explanations (SHAP, feature importance, etc.)
        
        Args:
            X: Features to explain
            sample_idx: Specific sample index (None = global explanation)
        
        Returns:
            Explanation dictionary
        """
        pass
    
    def get_feature_importance(self) -> Dict[str, float]:
        """
        Get global feature importance
        
        Returns:
            Dict mapping feature_name -> importance_score
        """
        if not self.model:
            raise ValueError("Model not trained or loaded")
        
        # Default implementation (override for model-specific logic)
        return {}
    
    def compute_confidence(
        self,
        X: pd.DataFrame
    ) -> np.ndarray:
        """
        Compute prediction confidence scores
        
        Returns:
            Array of confidence scores [0-1]
        """
        # Default: return array of 1.0 (override for uncertainty estimation)
        return np.ones(len(X))
    
    def detect_ood(
        self,
        X: pd.DataFrame,
        threshold: float = 0.95
    ) -> np.ndarray:
        """
        Detect out-of-distribution samples
        
        Args:
            X: Feature matrix
            threshold: Confidence threshold for OOD detection
        
        Returns:
            Boolean array (True = in-distribution, False = OOD)
        """
        # Default: return all in-distribution (override for OOD detection)
        return np.ones(len(X), dtype=bool)
    
    def save(self, path: Optional[Path] = None) -> Path:
        """
        Save model artifacts and metadata
        
        Args:
            path: Directory to save to (uses self.model_path if None)
        
        Returns:
            Path where model was saved
        """
        save_path = path or self.model_path
        if not save_path:
            raise ValueError("No save path specified")
        
        save_path = Path(save_path)
        save_path.mkdir(parents=True, exist_ok=True)
        
        # Save model (subclass responsibility via _save_model_artifacts)
        self._save_model_artifacts(save_path)
        
        # Compute checksum
        self.metadata["checksum"] = self._compute_checksum(save_path)
        self.metadata["saved_at"] = datetime.utcnow().isoformat()
        
        # Save metadata
        metadata_path = save_path / "metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(self.metadata, f, indent=2)
        
        return save_path
    
    def load(self, path: Path) -> None:
        """
        Load model artifacts and metadata
        
        Args:
            path: Directory to load from
        """
        path = Path(path)
        
        # Load metadata
        metadata_path = path / "metadata.json"
        if metadata_path.exists():
            with open(metadata_path, "r") as f:
                self.metadata = json.load(f)
                self.version = self.metadata.get("version", self.version)
        
        # Load model artifacts (subclass responsibility)
        self._load_model_artifacts(path)
        
        self.model_path = path
    
    @abstractmethod
    def _save_model_artifacts(self, path: Path) -> None:
        """Save model-specific artifacts (implement in subclass)"""
        pass
    
    @abstractmethod
    def _load_model_artifacts(self, path: Path) -> None:
        """Load model-specific artifacts (implement in subclass)"""
        pass
    
    def _compute_checksum(self, path: Path) -> str:
        """Compute SHA256 checksum for model directory"""
        hasher = hashlib.sha256()
        
        # Hash all files in directory
        for file_path in sorted(path.rglob("*")):
            if file_path.is_file() and file_path.name != "metadata.json":
                with open(file_path, "rb") as f:
                    hasher.update(f.read())
        
        return hasher.hexdigest()
    
    def get_metadata(self) -> Dict[str, Any]:
        """Get model metadata"""
        return self.metadata.copy()
    
    def set_metadata(self, key: str, value: Any) -> None:
        """Update model metadata"""
        self.metadata[key] = value
    
    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name='{self.model_name}', version='{self.version}')"
