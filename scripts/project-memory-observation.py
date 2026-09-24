"""Project one PostgreSQL observation receipt to local Graphiti node/edge storage."""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import ProxyHandler, build_opener
from uuid import NAMESPACE_URL, UUID, uuid5

os.environ["GRAPHITI_TELEMETRY_ENABLED"] = "false"
os.environ["NO_PROXY"] = "127.0.0.1,localhost,::1"
os.environ["no_proxy"] = os.environ["NO_PROXY"]

from dotenv import dotenv_values  # noqa: E402
from graphiti_core.driver.neo4j_driver import Neo4jDriver  # noqa: E402
from graphiti_core.edges import EntityEdge  # noqa: E402
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig  # noqa: E402
from graphiti_core.nodes import EntityNode  # noqa: E402


EMBED_DIGEST = "0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f"
OLLAMA_URL = "http://127.0.0.1:11434"


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


async def main():
    item = json.load(sys.stdin)
    owner_id = str(UUID(item["ownerId"]))
    observation_id = str(UUID(item["observationId"]))
    content = item["content"]
    if (not isinstance(content, str) or not content.strip() or len(content) > 12000 or
            item["kind"] not in ("preference", "experience", "business-fact", "method")):
        raise ValueError("Invalid observation projection input")
    with build_opener(ProxyHandler({})).open(f"{OLLAMA_URL}/api/tags", timeout=5) as response:
        models = {model["name"]: model["digest"] for model in json.load(response)["models"]}
    if models.get("nomic-embed-text:latest") != EMBED_DIGEST:
        raise RuntimeError("Pinned local embedder unavailable")
    local_env = dotenv_values(Path(__file__).resolve().parents[1] / ".env.neo4j.local")
    auth = local_env.get("NEO4J_AUTH")
    if not auth or not auth.startswith("neo4j/"):
        raise RuntimeError("Local Neo4j authentication unavailable")
    driver = await asyncio.to_thread(Neo4jDriver, "bolt://127.0.0.1:7687",
                                     "neo4j", auth.split("/", 1)[1])
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(
        api_key="ollama", embedding_model="nomic-embed-text", embedding_dim=768,
        base_url=f"{OLLAMA_URL}/v1"))
    account_uuid = str(uuid5(NAMESPACE_URL, f"ma24-account:{owner_id}"))
    edge_uuid = str(uuid5(NAMESPACE_URL, f"ma24-observation-edge:{observation_id}"))
    account_name = "Account memory"
    observation_name = f"Observation {observation_id}"
    try:
        await EntityNode(uuid=account_uuid, name=account_name, group_id=owner_id,
                         name_embedding=await embedder.create(account_name)).save(driver)
        await EntityNode(uuid=observation_id, name=observation_name, group_id=owner_id,
                         name_embedding=await embedder.create(observation_name),
                         attributes={"kind": item["kind"]}).save(driver)
        await EntityEdge(
            uuid=edge_uuid, group_id=owner_id, source_node_uuid=account_uuid,
            target_node_uuid=observation_id, created_at=instant(item["recordedAt"]),
            name="OBSERVED", fact=content,
            fact_embedding=await embedder.create(content),
            valid_at=instant(item.get("validFrom")),
            expired_at=instant(item.get("validUntil")),
        ).save(driver)
        rows, _, _ = await driver.execute_query(
            "MATCH (a:Entity {uuid:$account})-[e:RELATES_TO {uuid:$edge}]->"
            "(m:Entity {uuid:$observation}) "
            "RETURN a.group_id AS account_group,e.group_id AS edge_group,"
            "m.group_id AS observation_group,e.fact AS fact",
            account=account_uuid, edge=edge_uuid, observation=observation_id,
        )
        if (len(rows) != 1 or any(rows[0][key] != owner_id for key in
                                  ("account_group", "edge_group", "observation_group")) or
                rows[0]["fact"] != content):
            raise RuntimeError("Graph projection verification failed")
        print(json.dumps({"projected": True, "observationId": observation_id}))
    finally:
        await driver.close()


if __name__ == "__main__":
    asyncio.run(main())
