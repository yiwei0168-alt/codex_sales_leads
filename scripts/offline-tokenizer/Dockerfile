# Source is supplied explicitly; never use the product repository as build context.
FROM rust:1.97.1-bookworm@sha256:0e2bcaef56d041a486784e54104a81aebe0da44bd03019bd70bc0401e42e4a97
COPY --from=recipe / /recipe/
WORKDIR /audit
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN test "$(git -C /recipe rev-parse HEAD)" = "8cadfede7063c896b944e7bae05daa3549ae97ea" && \
    test "$(tr -d '\r' < /recipe/static/tokenizers/v4/tokenizer.json | sha256sum | cut -d ' ' -f 1)" = "97d2f31b020d18b5aee5c9b3d5b4efb10ea210f3fe3f7dffe3f1cd90542d6b19" && \
    cargo build --release --locked
ENTRYPOINT ["/audit/target/release/offline-tokenizer-audit"]
