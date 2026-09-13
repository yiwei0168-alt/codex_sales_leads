use deepseek_recipe::{anthropic::MessagesRequest, openai::ChatCompletionRequest};
use deepseek_recipe::request::{ConversionOptions, ProtocolRequest};
use deepseek_recipe_encoding::{PromptEncoding, v4::dsv4::DeepseekV4Encoding};
use deepseek_recipe_encoding::v4::dsv41::DeepseekV41Encoding;
use serde_json::json;
use tokenizers::Tokenizer;
use std::io::{self, BufRead};

fn count_body(encoding: &dyn PromptEncoding, body: serde_json::Value) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let converted = if body.get("system").is_some() {
        let r: MessagesRequest = serde_json::from_value(body)?;
        r.convert(ConversionOptions::default())?
    } else {
        let r: ChatCompletionRequest = serde_json::from_value(body)?;
        r.convert(ConversionOptions::default())?
    };
    let ids = encoding.encode(&converted.conversation)?;
    assert!(!ids.is_empty());
    assert_eq!(ids, encoding.encode(&converted.conversation)?);
    Ok(ids.len())
}

fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let tokenizer = Tokenizer::from_file("/recipe/static/tokenizers/v4/tokenizer.json")?;
    let tokenizer41 = Tokenizer::from_file("/recipe/static/tokenizers/v41/tokenizer.json")?;
    if std::env::args().any(|arg| arg == "--stdin") {
        let encoding = DeepseekV4Encoding::new().with_tokenizer(tokenizer.clone());
        let encoding41 = DeepseekV41Encoding::new().with_tokenizer(tokenizer41.clone());
        for line in io::stdin().lock().lines() {
            let value: serde_json::Value = serde_json::from_str(&line?)?;
            let (selected, part_tokenizer, method): (&dyn PromptEncoding, &Tokenizer, &str) =
                match value["body"]["model"].as_str() {
                    Some("deepseek-v4-pro") => (&encoding, &tokenizer, "v4"),
                    Some("deepseek-flash" | "deepseek-v4-flash") => (&encoding41, &tokenizer41, "v41"),
                    _ => return Err("Unverified model mapping".into()),
                };
            let total = count_body(selected, value["body"].clone())?;
            let parts = value["parts"].as_array().ok_or("parts missing")?.iter()
                .map(|part| part_tokenizer.encode(part.as_str().ok_or("non-text part")?, false).map(|ids| ids.len()))
                .collect::<Result<Vec<_>, _>>()?;
            // Output counts only: no prompt, company identity, evidence, token IDs, or request headers.
            println!("{}", json!({"total":total,"parts":parts,"repeat_stable":true,"encoding":method}));
        }
        return Ok(());
    }
    let encoding = DeepseekV4Encoding::new().with_tokenizer(tokenizer);
    let encoding41 = DeepseekV41Encoding::new().with_tokenizer(tokenizer41);
    let started = std::time::Instant::now();
    let texts = ["Hello world".to_owned(), "墨西哥网络设备渠道，Wi-Fi 7，客户场景。".to_owned(),
        "Résumé, México, distribución, 中文 😀".to_owned(), "Networking evidence: router switch Wi-Fi. ".repeat(1000)];
    let mut results = vec![];
    for (index, text) in texts.iter().enumerate() {
        for (protocol, model, selected) in [
            ("messages", "deepseek-v4-pro", &encoding as &dyn PromptEncoding),
            ("chat", "deepseek-v4-pro", &encoding as &dyn PromptEncoding),
            ("messages", "deepseek-flash", &encoding41 as &dyn PromptEncoding),
            ("chat", "deepseek-flash", &encoding41 as &dyn PromptEncoding),
        ] {
            let mut counts = vec![];
            for schema in [false, true] {
                let system = if schema { "Return JSON only. Your response MUST validate against this JSON Schema: {\"type\":\"object\",\"properties\":{\"company\":{\"type\":\"string\"}},\"required\":[\"company\"]}" } else { "Return JSON only." };
                let converted = if protocol == "messages" {
                    let r: MessagesRequest = serde_json::from_value(json!({"model":model,"system":system,"messages":[{"role":"user","content":text}],"thinking":{"type":"disabled"},"max_tokens":8192,"temperature":0}))?;
                    r.convert(ConversionOptions::default())?
                } else {
                    let r: ChatCompletionRequest = serde_json::from_value(json!({"model":model,"messages":[{"role":"system","content":system},{"role":"user","content":text}],"thinking":{"type":if model=="deepseek-flash" {"disabled"} else {"enabled"}},"response_format":{"type":"json_object"},"max_tokens":8192,"temperature":0}))?;
                    r.convert(ConversionOptions::default())?
                };
                let ids = selected.encode(&converted.conversation)?;
                assert!(!ids.is_empty());
                assert_eq!(ids, selected.encode(&converted.conversation)?);
                counts.push(ids.len());
            }
            assert!(counts[1] > counts[0], "schema text must contribute tokens");
            results.push(json!({"case":index,"protocol":protocol,"model":model,"without_schema":counts[0],"with_schema":counts[1],"repeat_stable":true}));
        }
    }
    println!("{}",json!({"scope":"synthetic-text-only-not-hosted-billing-proof","cases":results,"elapsed_ms":started.elapsed().as_millis(),"model_calls":0}));
    Ok(())
}

fn main() {
    if run().is_err() {
        eprintln!("Offline tokenizer audit failed; payload suppressed");
        std::process::exit(1);
    }
}
