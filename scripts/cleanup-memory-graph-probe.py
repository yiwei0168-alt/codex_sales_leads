"""Remove exactly one synthetic Graphiti observation after a local acceptance probe."""

import json
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

from dotenv import dotenv_values
from neo4j import GraphDatabase


item = json.load(__import__("sys").stdin)
owner_id = str(UUID(item["ownerId"]))
observation_id = str(UUID(item["observationId"]))
auth = dotenv_values(Path(__file__).resolve().parents[1] / ".env.neo4j.local").get("NEO4J_AUTH")
if not auth or not auth.startswith("neo4j/"):
    raise RuntimeError("Local Neo4j authentication unavailable")
account_id = str(uuid5(NAMESPACE_URL, f"ma24-account:{owner_id}"))
with GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("neo4j", auth.split("/", 1)[1])) as driver:
    with driver.session() as session:
        session.run("MATCH (n:Entity {uuid:$id,group_id:$owner}) DETACH DELETE n",
                    id=observation_id, owner=owner_id).consume()
        session.run("MATCH (a:Entity {uuid:$id,group_id:$owner}) "
                    "WHERE NOT (a)--() DELETE a", id=account_id, owner=owner_id).consume()
print(json.dumps({"removed": True, "observationId": observation_id}))
