"""Quick tests for hardware module - tests quantization logic without heavy dependencies."""
import pytest
import tempfile
import os
from app.hardware.quantization import (
    QuantizationManager,
    extract_quant_from_filename,
    recommended_quants_for_backend,
    estimate_model_vram
)


class TestExtractQuantFromFilename:
    """Test quantization extraction from filenames."""
    
    def test_extract_q4_k_m(self):
        """Test extracting Q4_K_M quantization."""
        result = extract_quant_from_filename("model-Q4_K_M.gguf")
        assert result == "Q4_K_M"
    
    def test_extract_q5_k_s(self):
        """Test extracting Q5_K_S quantization."""
        result = extract_quant_from_filename("llama-Q5_K_S.gguf")
        assert result == "Q5_K_S"
    
    def test_extract_q8_0(self):
        """Test extracting Q8_0 quantization."""
        result = extract_quant_from_filename("model-Q8_0.gguf")
        assert result == "Q8_0"
    
    def test_extract_q6_k(self):
        """Test extracting Q6_K quantization."""
        result = extract_quant_from_filename("mistral-Q6_K.gguf")
        assert result == "Q6_K"
    
    def test_extract_fp16(self):
        """Test extracting FP16 quantization."""
        result = extract_quant_from_filename("model-FP16.gguf")
        assert result == "FP16"
    
    def test_extract_bf16(self):
        """Test extracting BF16 quantization."""
        result = extract_quant_from_filename("model-BF16.gguf")
        assert result == "BF16"
    
    def test_extract_from_path(self):
        """Test extracting from full path."""
        result = extract_quant_from_filename("/models/llama-Q4_K_M.gguf")
        assert result == "Q4_K_M"
    
    def test_no_quant_in_filename(self):
        """Test when no quantization in filename."""
        result = extract_quant_from_filename("model.gguf")
        assert result is None
    
    def test_lowercase_filename(self):
        """Test that extraction works with uppercase conversion."""
        # The function converts to uppercase
        result = extract_quant_from_filename("model-q4_k_m.gguf")
        assert result == "Q4_K_M"
    
    def test_complex_filename(self):
        """Test extracting from complex filename."""
        result = extract_quant_from_filename("Llama-2-7b-chat-Q4_K_M-v2.gguf")
        assert result == "Q4_K_M"


class TestRecommendedQuantsForBackend:
    """Test quantization recommendations for different backends."""
    
    def test_cuda_recommendations(self):
        """Test CUDA backend recommendations."""
        quants = recommended_quants_for_backend("cuda")
        
        assert "Q8_K_M" in quants
        assert "Q4_K_M" in quants
        assert "Q4_0" in quants
        # CUDA prefers higher quality first
        assert quants[0] == "Q8_K_M"
    
    def test_metal_recommendations(self):
        """Test Metal backend recommendations."""
        quants = recommended_quants_for_backend("metal")
        
        assert "Q8_K_M" in quants
        assert "Q4_K_M" in quants
        # Metal has same hierarchy as CUDA
        assert quants[0] == "Q8_K_M"
    
    def test_cpu_recommendations(self):
        """Test CPU backend recommendations."""
        quants = recommended_quants_for_backend("cpu")
        
        # CPU prefers lighter quantizations
        assert "Q4_K_S" in quants
        assert "Q4_0" in quants
        # CPU prefers lighter quants first
        assert quants[0] == "Q4_K_S"
    
    def test_rocm_recommendations(self):
        """Test ROCm backend recommendations."""
        quants = recommended_quants_for_backend("rocm")
        
        assert "Q8_K_M" in quants
        assert "Q4_K_M" in quants
    
    def test_unknown_backend_defaults_to_cpu(self):
        """Test unknown backend defaults to CPU recommendations."""
        quants = recommended_quants_for_backend("unknown")
        
        # Should return CPU recommendations
        assert "Q4_K_S" in quants


class TestQuantizationManager:
    """Test QuantizationManager class."""
    
    @pytest.fixture
    def manager(self):
        """Create a QuantizationManager instance."""
        return QuantizationManager()
    
    def test_pick_best_quant_fits_vram(self, manager):
        """Test picking best quant when it fits VRAM."""
        # Large VRAM, should pick high quality
        result = manager.pick_best_quant(
            model_quant="Q4_K_M",
            backend="cuda",
            vram_mb=16000,
            model_params=7_000_000_000  # 7B params
        )
        
        # Should return a valid quantization
        assert result in ["Q8_K_M", "Q6_K", "Q5_K_M", "Q4_K_M", "Q4_K_S", "Q4_0"]
    
    def test_pick_best_quant_limited_vram(self, manager):
        """Test picking quant with limited VRAM."""
        # Small VRAM
        result = manager.pick_best_quant(
            model_quant="Q8_K_M",
            backend="cuda",
            vram_mb=4000,
            model_params=7_000_000_000  # 7B params
        )
        
        # Should pick lighter quantization
        assert result in ["Q4_K_S", "Q4_0"]
    
    def test_pick_best_quant_no_model_params(self, manager):
        """Test picking quant without model params info."""
        result = manager.pick_best_quant(
            model_quant="Q4_K_M",
            backend="cuda",
            vram_mb=8000,
            model_params=None
        )
        
        # Without model params, should use provided quant
        assert result == "Q4_K_M"
    
    def test_quant_fits_vram_true(self, manager):
        """Test VRAM check when quant fits."""
        # 7B params at Q4_K_M needs ~4.5GB * 7 * 1.2 = ~38GB
        # Actually: 4500MB/B params * 7B = 31.5GB + 20% = 37.8GB
        # So 40GB should fit
        fits = manager._quant_fits_vram(
            quant="Q4_K_M",
            vram_mb=40000,
            model_params=7_000_000_000
        )
        
        assert fits is True
    
    def test_quant_fits_vram_false(self, manager):
        """Test VRAM check when quant doesn't fit."""
        # 7B params at Q8_K_M needs ~8.5GB * 7 * 1.2 = ~71GB
        fits = manager._quant_fits_vram(
            quant="Q8_K_M",
            vram_mb=8000,
            model_params=7_000_000_000
        )
        
        assert fits is False
    
    def test_quant_fits_vram_no_params(self, manager):
        """Test VRAM check without model params."""
        fits = manager._quant_fits_vram(
            quant="Q4_K_M",
            vram_mb=8000,
            model_params=None
        )
        
        # Without params, assumes it fits
        assert fits is True
    
    def test_is_quant_supported_cpu(self, manager):
        """Test quant support for CPU backend."""
        # CPU supports all quants
        assert manager._is_quant_supported("Q4_K_M", "cpu") is True
        assert manager._is_quant_supported("Q8_K_M", "cpu") is True
        assert manager._is_quant_supported("UNKNOWN", "cpu") is True
    
    def test_is_quant_supported_cuda(self, manager):
        """Test quant support for CUDA backend."""
        assert manager._is_quant_supported("Q4_K_M", "cuda") is True
        assert manager._is_quant_supported("Q8_K_M", "cuda") is True
        assert manager._is_quant_supported("UNKNOWN", "cuda") is False
    
    def test_get_quant_size_factor(self, manager):
        """Test quantization size factors."""
        assert manager._get_quant_size_factor("FP16") == 2.0
        assert manager._get_quant_size_factor("Q4_K_M") == 0.5
        assert manager._get_quant_size_factor("Q8_K_M") == 1.0
        assert manager._get_quant_size_factor("UNKNOWN") == 1.0


class TestEstimateModelVram:
    """Test VRAM estimation for models."""
    
    def test_estimate_vram_existing_file(self):
        """Test VRAM estimation for an existing file."""
        # Create a temporary file
        with tempfile.NamedTemporaryFile(suffix=".gguf", delete=False) as f:
            # Write 1MB of data
            f.write(b"x" * (1024 * 1024))
            temp_path = f.name
        
        try:
            estimate = estimate_model_vram(temp_path)
            
            # Should return a positive integer
            assert isinstance(estimate, int)
            assert estimate > 0
            # Should be capped at 32GB
            assert estimate <= 32 * 1024
        finally:
            os.unlink(temp_path)
    
    def test_estimate_vram_with_quant(self):
        """Test VRAM estimation with specified quantization."""
        with tempfile.NamedTemporaryFile(suffix=".gguf", delete=False) as f:
            f.write(b"x" * (1024 * 1024))
            temp_path = f.name
        
        try:
            estimate_q4 = estimate_model_vram(temp_path, quant="Q4_K_M")
            estimate_q8 = estimate_model_vram(temp_path, quant="Q8_K_M")
            
            # Both should be positive
            assert estimate_q4 > 0
            assert estimate_q8 > 0
        finally:
            os.unlink(temp_path)
    
    def test_estimate_vram_nonexistent_file(self):
        """Test VRAM estimation for non-existent file."""
        estimate = estimate_model_vram("/nonexistent/model.gguf")
        
        # Should return default 4GB estimate
        assert estimate == 4096
