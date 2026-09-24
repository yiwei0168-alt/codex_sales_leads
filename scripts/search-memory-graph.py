"""Return account-scoped observation IDs only; PostgreSQL must validate every ID."""

import json
import os
import sys
from pathlib import Path
from uuid import UUID

os.environ["GRAPHITI_TELEMETRY_ENABLED"] = "false"
os.environ["NO_PROXY"] = "127.0.0.1,localhost,::1"
os.environ["no_proxy"] = os.environ["NO_PROXY"]

from dotenv import dotenv_values  # noqa: E402
from neo4j import GraphDatabase  # noqa: E402


item = json.load(sys.stdin)
owner_id = str(UUID(item["ownerId"]))
query = item["query"]
if not isinstance(query, str) or not query.strip() or len(query) > 200:
    raise ValueError("Invalid memory graph query")
auth = dotenv_values(Path(__file__).resolve().parents[1] / ".env.neo4j.local").get("NEO4J_AUTH")
if not auth or not auth.startswith("neo4j/"):
    raise RuntimeError("Local Neo4j authentication unavailable")
driver = GraphDatabase.driver("bolt://127.0.0.1:7687",
                              auth=("neo4j", auth.split("/", 1)[1]))
try:
    rows, _, _ = driver.execute_query(
        "MATCH (a:Entity)-[e:RELATES_TO]->(m:Entity) "
        "WHERE a.group_id=$owner AND e.group_id=$owner AND m.group_id=$owner "
        "AND e.name='OBSERVED' AND toLower(e.fact) CONTAINS toLower($query) "
        "RETURN DISTINCT m.uuid AS id LIMIT 24",
        owner=owner_id, query=query.strip())
    print(json.dumps({"ids": [row["id"] for row in rows]}))
finally:
    driver.close()
