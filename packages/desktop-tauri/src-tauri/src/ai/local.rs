//! Local LLM provider — runs GGUF models via llama.cpp (Metal-accelerated on macOS)

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;

use super::provider::AiProvider;
use super::types::*;

/// Shared inner state for the local LLM (model + backend are not Clone)
struct LocalInner {
    backend: LlamaBackend,
    model: LlamaModel,
}

// LlamaBackend and LlamaModel use C pointers internally.
// llama.cpp guarantees thread-safety for model reads (inference from separate contexts).
// We guard actual mutation via Mutex.
unsafe impl Send for LocalInner {}
unsafe impl Sync for LocalInner {}

/// Local LLM provider using llama.cpp via Rust bindings
pub struct LocalProvider {
    inner: Arc<Mutex<LocalInner>>,
    model_path: PathBuf,
    model_name_str: String,
    max_tokens: u32,
}

impl std::fmt::Debug for LocalProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LocalProvider")
            .field("model_path", &self.model_path)
            .field("model_name", &self.model_name_str)
            .field("max_tokens", &self.max_tokens)
            .finish()
    }
}

impl LocalProvider {
    /// Load a GGUF model from the given path
    pub fn load(model_path: PathBuf, model_name: Option<String>) -> Result<Self> {
        let backend = LlamaBackend::init()
            .map_err(|e| anyhow!("Failed to initialize llama backend: {e}"))?;

        let model_params = LlamaModelParams::default();

        let model = LlamaModel::load_from_file(&backend, &model_path, &model_params)
            .with_context(|| format!("Failed to load GGUF model: {}", model_path.display()))?;

        let name = model_name.unwrap_or_else(|| {
            model_path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "local-model".to_string())
        });

        log::info!(
            "[LocalLLM] Loaded model '{}' from {}",
            name,
            model_path.display()
        );

        Ok(Self {
            inner: Arc::new(Mutex::new(LocalInner { backend, model })),
            model_path,
            model_name_str: name,
            max_tokens: 2048,
        })
    }

    /// Format chat messages into ChatML template (Qwen/instruct format)
    fn format_chatml(messages: &[ChatMessage]) -> String {
        let mut prompt = String::new();
        for msg in messages {
            prompt.push_str(&format!(
                "<|im_start|>{}\n{}<|im_end|>\n",
                msg.role, msg.content
            ));
        }
        // Open assistant turn for generation
        prompt.push_str("<|im_start|>assistant\n");
        prompt
    }

    /// Run inference synchronously (called from spawn_blocking)
    fn generate_sync(
        inner: &Mutex<LocalInner>,
        prompt: &str,
        max_tokens: u32,
    ) -> Result<(String, u32, u32)> {
        let guard = inner.lock().map_err(|e| anyhow!("Lock poisoned: {e}"))?;
        let LocalInner {
            ref backend,
            ref model,
        } = *guard;

        // Create a fresh context for this request
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(std::num::NonZeroU32::new(4096));

        let mut ctx = model
            .new_context(backend, ctx_params)
            .with_context(|| "Failed to create llama context")?;

        // Tokenize the prompt
        let tokens_list = model
            .str_to_token(prompt, AddBos::Always)
            .with_context(|| "Failed to tokenize prompt")?;

        let prompt_tokens = tokens_list.len() as u32;
        let n_len = (tokens_list.len() as i32) + (max_tokens as i32);

        // Feed prompt tokens into batch
        let mut batch = LlamaBatch::new(512, 1);
        let last_index = tokens_list.len() as i32 - 1;

        for (i, token) in (0_i32..).zip(tokens_list.into_iter()) {
            let is_last = i == last_index;
            batch
                .add(token, i, &[0], is_last)
                .with_context(|| "Failed to add token to batch")?;
        }

        ctx.decode(&mut batch)
            .with_context(|| "Failed to decode prompt")?;

        // Generate tokens
        let mut n_cur = batch.n_tokens();
        let mut output = String::new();
        let mut completion_tokens: u32 = 0;

        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::dist(1234),
            LlamaSampler::greedy(),
        ]);

        while n_cur <= n_len {
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);

            // Check for end of generation
            if model.is_eog_token(token) {
                break;
            }

            // Decode token to string
            if let Ok(piece) = model.token_to_piece(token, &mut decoder, true, None) {
                output.push_str(&piece);
            }

            completion_tokens += 1;

            // Prepare next decode
            batch.clear();
            batch
                .add(token, n_cur, &[0], true)
                .with_context(|| "Failed to add generated token")?;

            n_cur += 1;

            ctx.decode(&mut batch)
                .with_context(|| "Failed to decode generated token")?;
        }

        // Strip any trailing <|im_end|> from output
        let output = output
            .trim_end_matches("<|im_end|>")
            .trim()
            .to_string();

        Ok((output, prompt_tokens, completion_tokens))
    }
}

#[async_trait]
impl AiProvider for LocalProvider {
    async fn chat(&self, messages: Vec<ChatMessage>) -> Result<ChatResponse> {
        let start = Instant::now();
        let prompt = Self::format_chatml(&messages);
        let inner = Arc::clone(&self.inner);
        let max_tokens = self.max_tokens;
        let model_name = self.model_name_str.clone();

        let (text, prompt_tokens, completion_tokens) =
            tokio::task::spawn_blocking(move || Self::generate_sync(&inner, &prompt, max_tokens))
                .await
                .map_err(|e| anyhow!("Inference task panicked: {e}"))??;

        Ok(ChatResponse {
            text,
            model: model_name,
            duration_ms: start.elapsed().as_millis() as u64,
            usage: Some(UsageInfo {
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
            }),
        })
    }

    async fn chat_with_vision(
        &self,
        messages: Vec<ChatMessage>,
        _image_base64: &str,
    ) -> Result<ChatResponse> {
        // Vision not supported for text-only local models; fall back to text chat
        log::warn!("[LocalLLM] Vision not supported, falling back to text-only");
        self.chat(messages).await
    }

    async fn validate(&self) -> Result<()> {
        // Model is already loaded if we got here
        Ok(())
    }

    fn provider_name(&self) -> &str {
        "local"
    }

    fn model_name(&self) -> &str {
        &self.model_name_str
    }
}
