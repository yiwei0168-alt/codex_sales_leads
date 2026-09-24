"""Synthetic Graphiti smoke test. Never reads product memory or sends it to a model."""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import ProxyHandler, build_opener
from uuid import uuid4

# Graphiti enables PostHog telemetry by default. Set this before importing it.
os.environ["GRAPHITI_TELEMETRY_ENABLED"] = "false"
os.environ["NO_PROXY"] = "127.0.0.1,localhost,::1"
os.environ["no_proxy"] = os.environ["NO_PROXY"]

from dotenv import dotenv_values  # noqa: E402
from graphiti_core import Graphiti  # noqa: E402
from graphiti_core.cross_encoder.openai_reranker_client import (  # noqa: E402
    OpenAIRerankerClient,
)
from graphiti_core.embedder.openai import (  # noqa: E402
    OpenAIEmbedder,
    OpenAIEmbedderConfig,
)
from graphiti_core.llm_client.config import LLMConfig  # noqa: E402
from graphiti_core.llm_client.openai_generic_client import (  # noqa: E402
    OpenAIGenericClient,
)
from graphiti_core.driver.neo4j_driver import Neo4jDriver  # noqa: E402
from graphiti_core.edges import EntityEdge  # noqa: E402
from graphiti_core.nodes import EntityNode, EpisodeType  # noqa: E402
from neo4j import AsyncGraphDatabase  # noqa: E402


OLLAMA_URL = "http://127.0.0.1:11434"
QWEN_DIGEST = "500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41"
EMBED_DIGEST = "0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f"


def local_models_ready():
    opener = build_opener(ProxyHandler({}))
    with opener.open(f"{OLLAMA_URL}/api/tags", timeout=5) as response:
        models = {model["name"]: model["digest"] for model in json.load(response)["models"]}
    if (models.get("qwen3:8b") != QWEN_DIGEST or
            models.get("nomic-embed-text:latest") != EMBED_DIGEST):
        raise RuntimeError("Pinned local Graphiti models are unavailable")


async def main():
    local_models_ready()
    local_env = dotenv_values(Path(__file__).resolve().parents[1] / ".env.neo4j.local")
    auth = os.environ.get("NEO4J_AUTH") or local_env.get("NEO4J_AUTH")
    if not auth or not auth.startswith("neo4j/") or len(auth.split("/", 1)[1]) < 8:
        raise RuntimeError("Local Neo4j authentication is unavailable")
    password = auth.split("/", 1)[1]
    neo4j_uri = "bolt://127.0.0.1:7687"
    group_id = f"ma24-synthetic-{uuid4()}"
    driver = AsyncGraphDatabase.driver(neo4j_uri, auth=("neo4j", password))
    graphiti = None
    direct_driver = None
    try:
        await driver.verify_connectivity()
        if "--direct" in sys.argv:
            direct_driver = await asyncio.to_thread(Neo4jDriver, neo4j_uri, "neo4j", password)
            embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(
                api_key="ollama", embedding_model="nomic-embed-text",
                embedding_dim=768, base_url=f"{OLLAMA_URL}/v1"))
            now = datetime.now(timezone.utc)
            account = EntityNode(name="MA24 synthetic account", group_id=group_id,
                                 name_embedding=await embedder.create("MA24 synthetic account"))
            memory = EntityNode(name="MA24 synthetic observation", group_id=group_id,
                                name_embedding=await embedder.create("MA24 synthetic observation"))
            await account.save(direct_driver)
            await memory.save(direct_driver)
            edge = EntityEdge(
                group_id=group_id, source_node_uuid=account.uuid,
                target_node_uuid=memory.uuid, created_at=now,
                name="OBSERVED", fact="Synthetic account prefers short answers",
                fact_embedding=await embedder.create("Synthetic account prefers short answers"),
                valid_at=now,
            )
            await edge.save(direct_driver)
            async with driver.session() as session:
                record = await (await session.run(
                    "MATCH (a:Entity {uuid:$account})-[r:RELATES_TO]->(m:Entity {uuid:$memory}) "
                    "RETURN a.group_id AS account_group,m.group_id AS memory_group,"
                    "r.group_id AS edge_group,r.fact AS fact",
                    account=account.uuid, memory=memory.uuid,
                )).single()
            if (not record or any(record[key] != group_id for key in
                                  ("account_group", "memory_group", "edge_group")) or
                    record["fact"] != edge.fact):
                raise RuntimeError("Structured Graphiti projection or namespace failed")
            print(json.dumps({"local": True, "structuredProjection": True,
                              "groupScoped": True, "telemetry": False}))
            return
        if "--episode" not in sys.argv:
            print(json.dumps({"local": True, "graphitiImported": True,
                              "neo4jConnected": True, "modelsPinned": True,
                              "telemetry": False}))
            return
        llm_config = LLMConfig(
            api_key="ollama", model="qwen3:8b", small_model="qwen3:8b",
            base_url=f"{OLLAMA_URL}/v1", temperature=0, max_tokens=2048,
        )
        llm = OpenAIGenericClient(config=llm_config)
        graphiti = Graphiti(
            neo4j_uri, "neo4j", password,
            llm_client=llm,
            embedder=OpenAIEmbedder(config=OpenAIEmbedderConfig(
                api_key="ollama", embedding_model="nomic-embed-text",
                embedding_dim=768, base_url=f"{OLLAMA_URL}/v1")),
            cross_encoder=OpenAIRerankerClient(client=llm, config=llm_config),
        )
        await graphiti.build_indices_and_constraints()
        result = await asyncio.wait_for(graphiti.add_episode(
            name="MA24 synthetic preference",
            episode_body=("Synthetic user SampleBuyer prefers short answers with source links. "
                          "SampleBuyer works with fictional company ExampleCo in Germany."),
            source_description="Synthetic local contract test; no product data",
            reference_time=datetime.now(timezone.utc),
            source=EpisodeType.text,
            group_id=group_id,
        ), timeout=180)
        if result.episode.group_id != group_id:
            raise RuntimeError("Graphiti lost the account namespace")
        if not result.nodes or not result.edges:
            raise RuntimeError("Graphiti returned no graph facts for the synthetic episode")
        print(json.dumps({"local": True, "episode": True, "groupScoped": True,
                          "entities": len(result.nodes), "edges": len(result.edges),
                          "telemetry": False}))
    finally:
        async with driver.session() as session:
            await session.run("MATCH (n {group_id: $group_id}) DETACH DELETE n", group_id=group_id)
        await driver.close()
        if direct_driver is not None:
            await direct_driver.close()
        if graphiti is not None:
            await graphiti.close()


if __name__ == "__main__":
    asyncio.run(main())
