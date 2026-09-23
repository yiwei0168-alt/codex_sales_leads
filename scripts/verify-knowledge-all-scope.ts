import { listKnowledgeLibrary } from "../src/lib/knowledge/library-service";
import { getPool } from "../src/lib/rag/db";

try {
  const page = await listKnowledgeLibrary("00000000-0000-4000-8000-000000000000", "all", "", 0, 1);
  if (page.items.length > 1) throw new Error("全部范围分页失效");
  process.stdout.write("全部资料联合查询与权限过滤执行成功\n");
} finally {
  await getPool().end();
}
