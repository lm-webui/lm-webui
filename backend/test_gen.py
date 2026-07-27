import optiq  # registers the dhara architecture with mlx-lm
from mlx_lm import generate, load

model, tok = load("mlx-community/dhara-250m-OptiQ-4bit")
prompt = tok.apply_chat_template(
    [{"role": "user", "content": "Explain the Mediterranean climate."}],
    tokenize=False,
    add_generation_prompt=True,
)
print(generate(model, tok, prompt))
