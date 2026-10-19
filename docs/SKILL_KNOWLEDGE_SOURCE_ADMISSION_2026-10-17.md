# G09 知识资料发布门禁

迁移 149 在知识集合、文档/原件/解析树、旧索引版本、v3 发布/分块/事实/审核/指针，以及上传审核记录的 INSERT、UPDATE、DELETE、TRUNCATE 语句前取得全局排他门禁。完整表清单见迁移文件。持锁证据读取先通过新函数取得共享全局与账号门禁，再锁审核包、冻结、Skill 和具体来源；复用迁移 148 的键，避免跨记忆与资料域出现相反顺序。缺迁移时拒绝。

最终来源复核持锁期间，所有知识写入会暂时等待，包括其他账号的私有资料写入。此项尚无生产容量或等待时长验收，不将并发安全通过等同于试用发布完成。

附件元数据函数替换迁移 145 的行锁为门禁下的普通 MVCC 读取。上传线程可能在到达写入门禁之前已持有原件或文档行；保留附件行锁会让复核等待上传、上传等待门禁。新实现避免该循环，权限、版本和状态仍由既有守卫在锁后重建复核。数据库元数据的保护不等同于原件文件字节的保护。

[实际验收](evidence/ma24-g09-knowledge-publication-gate-2026-10-17.json)观察到私有文档、共享原件、发布指针及新增审核记录四类写入等待并在释放后恢复；共享原件已被写入线程 FOR UPDATE 时，附件元数据复核仍在 2 秒语句超时内完成。迁移重复安装、既有记忆/时间线并发、实际锁内策略、24 项回归、类型/lint 通过。完整材料组合、最终提交前时效、来源语义与可信生产认证仍未完成，自动启用关闭。


2026-10-19 / existing MA24 source-integrity implementation: original-asset registration now hashes through one file descriptor in bounded chunks, confines canonical paths to knowledge/, and rejects changed length, descriptor metadata, inode/device identity or current path before writing the asset. Shared binary registration passes the previously approved source SHA-256; a stable replacement with another digest rejects and does not mark the upload registered. 19 focused tests across three files, typecheck and focused lint passed. The first test launch failed before executing tests due to sandbox temp-cache EPERM; workspace-scoped TEMP/TMP resolved it. Tests use deterministic filesystem/DB mocks. This is not immutable storage, a real worker/HTTP acceptance or final activation protection; the earlier shared document upsert is not rolled back by a final asset rejection. No new user rule or quality confirmation. [Receipt](evidence/ma24-g05-g09-stable-asset-registration-2026-10-19.json).
