use deepseek_recipe::{anthropic::MessagesRequest, openai::ChatCompletionRequest};
use deepseek_recipe::request::{ConversionOptions, ProtocolRequest};
use deepseek_recipe_encoding::{PromptEncoding, v4::dsv4::DeepseekV4Encoding};
use serde_json::json;
use tokenizers::Tokenizer;

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let tokenizer = Tokenizer::from_file("/recipe/static/tokenizers/v4/tokenizer.json")?;
    let encoding = DeepseekV4Encoding::new().with_tokenizer(tokenizer);
    let started = std::time::Instant::now();
    let texts = ["Hello world".to_owned(), "墨西哥网络设备渠道，Wi-Fi 7，客户场景。".to_owned(),
        "Résumé, México, distribución, 中文 😀".to_owned(), "Networking evidence: router switch Wi-Fi. ".repeat(1000)];
    let mut results = vec![];
    for (index, text) in texts.iter().enumerate() {
        for protocol in ["messages", "chat"] {
            let mut counts = vec![];
            for schema in [false, true] {
                let system = if schema { "Return JSON only. Your response MUST validate against this JSON Schema: {\"type\":\"object\",\"properties\":{\"company\":{\"type\":\"string\"}},\"required\":[\"company\"]}" } else { "Return JSON only." };
                let converted = if protocol == "messages" {
                    let r: MessagesRequest = serde_json::from_value(json!({"model":"deepseek-v4-pro","system":system,"messages":[{"role":"user","content":text}],"thinking":{"type":"disabled"},"max_tokens":8192,"temperature":0}))?;
                    r.convert(ConversionOptions::default())?
                } else {
                    let r: ChatCompletionRequest = serde_json::from_value(json!({"model":"deepseek-v4-pro","messages":[{"role":"system","content":system},{"role":"user","content":text}],"thinking":{"type":"enabled"},"response_format":{"type":"json_object"},"max_tokens":8192,"temperature":0}))?;
                    r.convert(ConversionOptions::default())?
                };
                let ids = encoding.encode(&converted.conversation)?;
                assert!(!ids.is_empty());
                assert_eq!(ids, encoding.encode(&converted.conversation)?);
                counts.push(ids.len());
            }
            assert!(counts[1] > counts[0], "schema text must contribute tokens");
            results.push(json!({"case":index,"protocol":protocol,"without_schema":counts[0],"with_schema":counts[1],"repeat_stable":true}));
        }
    }
    println!("{}",json!({"scope":"synthetic-text-only-not-hosted-billing-proof","cases":results,"elapsed_ms":started.elapsed().as_millis(),"model_calls":0}));
    Ok(())
}
