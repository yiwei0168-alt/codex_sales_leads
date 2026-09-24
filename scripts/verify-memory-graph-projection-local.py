"""Exercise the production projector with synthetic input and remove its graph nodes."""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import dotenv_values
from neo4j import GraphDatabase


ROOT = Path(__file__).resolve().parents[1]
auth = dotenv_values(ROOT / ".env.neo4j.local").get("NEO4J_AUTH")
if not auth or not auth.startswith("neo4j/"):
    raise RuntimeError("Local Neo4j authentication unavailable")
owner_id, observation_id = str(uuid4()), str(uuid4())
item = {"ownerId": owner_id, "observationId": observation_id,
        "kind": "preference", "content": "Synthetic user prefers concise answers",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "validFrom": None, "validUntil": None}
driver = GraphDatabase.driver("bolt://127.0.0.1:7687",
                              auth=("neo4j", auth.split("/", 1)[1]))
try:
    for _ in range(2):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/project-memory-observation.py")],
            input=json.dumps(item), text=True, capture_output=True, timeout=120,
            cwd=ROOT, check=False,
        )
        if result.returncode or json.loads(result.stdout).get("observationId") != observation_id:
            raise RuntimeError("Synthetic graph projection failed")
    with driver.session() as session:
        row = session.run(
            "MATCH (a:Entity)-[e:RELATES_TO]->(m:Entity {uuid:$observation}) "
            "WHERE a.group_id=$owner AND e.group_id=$owner AND m.group_id=$owner "
            "RETURN count(e) AS edges,count(DISTINCT a) AS accounts,"
            "count(DISTINCT m) AS observations",
            owner=owner_id, observation=observation_id,
        ).single()
        if not row or (row["edges"], row["accounts"], row["observations"]) != (1, 1, 1):
            raise RuntimeError("Graph replay or account namespace failed")
    print(json.dumps({"local": True, "projected": True, "replayDeduplicated": True,
                      "groupScoped": True, "synthetic": True}))
finally:
    with driver.session() as session:
        session.run("MATCH (n {group_id:$owner}) DETACH DELETE n", owner=owner_id).consume()
    driver.close()
