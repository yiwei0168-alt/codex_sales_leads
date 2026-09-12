# Isolated DeepSeek text tokenizer audit

This is a diagnostic, not a product dependency or a billing bound. Never supply product secrets, real provider URLs or private data to the build. No inference code is present.

Source must be the official `deepseek-ai/deepseek-recipe` checkout at `8cadfede7063c896b944e7bae05daa3549ae97ea`. Verify `static/tokenizers/v4/tokenizer.json` after LF normalization against SHA-256 `97d2f31b020d18b5aee5c9b3d5b4efb10ea210f3fe3f7dffe3f1cd90542d6b19`. Windows CRLF checkout hash is separately recorded in `docs/CONFIRMED_PRODUCT_RULES.md`.

Build from the project root using only these two explicit contexts:

```powershell
docker build --build-context recipe=tmp/deepseek-recipe-audit-20260913 -t sales-tokenizer-audit:20260913 scripts/offline-tokenizer
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 65534:65534 sales-tokenizer-audit:20260913
```

Build downloads public Rust dependencies; runtime has no network, host mounts or injected credentials. Only text protocol and encoding crates are compiled, not Python/image bindings. Cases use synthetic English, Chinese, mixed Unicode and long evidence-like text with/without a system-prompt schema. Anthropic-format Pro uses disabled thinking and Chat-format Pro uses enabled thinking, mirroring current provider construction without changing product settings. Repeated token IDs must match, and schema text must increase counts. Counts across protocols are not required to be equal.

This does not validate hosted API usage, actual invoices, all product payload fields, or safe USD upper bounds. Passing cannot unlock paid calls. Build artifacts stay in Docker, and the official checkout stays in ignored `tmp/`.
