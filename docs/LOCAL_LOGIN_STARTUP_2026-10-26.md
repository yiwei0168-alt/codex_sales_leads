# 本机验收服务的登录启动

## 正式入口

在项目目录执行：

```powershell
node scripts/start-local-runtime.mjs status
node scripts/start-local-runtime.mjs start
```

入口读取 `.local-runtime/config.json`，固定本机 `405ec008` Web/API/主 Worker，访问地址仍为 http://localhost:3001。配置只含路径、哈希和进程身份，不保存密码、令牌或迁移连接。私有配置和启动日志已排除 Git。运行目录、Node 版本或启动文件变化后，需重新核对和生成配置；此入口不是发布升级工具。

## 启动顺序与边界

1. 检查 Docker Desktop 的 `desktop-linux` 引擎；必要时以隐藏窗口启动已安装的 Docker Desktop。只启动现有 postgres、neo4j、ollama 三个指定容器，不新建、重建或删除容器/数据。
2. 检查固定离线 BGE、业务 API、Web、主 Worker、邮箱 Worker。健康服务按进程身份复用，缺失服务按顺序启动；未知端口占用或非回环监听会报错，不强行结束未知进程。
3. 启动过程使用单实例管道锁；Windows Python 启动器与监听子进程分别识别。旧临时 API/邮箱进程仅凭 PID、创建时间和命令哈希接管，重启后的复用 PID 不能冒充旧进程。
4. 应用进程不携带迁移凭据、付费覆盖或云追踪凭据；保留现有权限与任务回执规则。BGE 固定模型/版本/维度并强制离线。启动入口不提交模型问题或发送邮件。

现有旧邮箱 Worker 冷启动验证前被保留接管，其旧产物哈希单独记录；冷启动后已使用当前源码编译的独立哈希文件。当前 API 已从临时脚本切换到正式 `start-local-business-api.mjs`；正式入口不依赖 tmp 下的启动脚本。

## 登录任务

注册、运行及查询：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-runtime-task.ps1 -Action Install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-runtime-task.ps1 -Action Run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-runtime-task.ps1 -Action Status
```

安装的是当前用户登录触发任务，使用 Interactive、Limited 权限，隐藏窗口；没有 SYSTEM 账号、账号密码或最高权限要求。相同用户/工作目录使用同一任务名；拒绝替换其他用户或其他动作的同名任务。启动失败最多由任务计划程序每分钟重试，共三次。PowerShell Bypass 只作用于本次进程，没有修改系统执行策略。

取消后续登录启动：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-runtime-task.ps1 -Action Uninstall
```

取消登录任务保留当前运行中的业务服务。该方案在用户登录后恢复本机验收环境，不是登录前的 Windows 系统服务或全天候进程守护。真实电脑重启/重新登录验证尚未执行。

## 验证记录

- 8 项单元测试、完整类型检查和变更文件 lint 通过；三个 PowerShell 文件语法通过。
- 实际暖启动五个服务均复用原 PID；受控空闲冷启动恢复 API、主 Worker 和邮箱 Worker，BGE/Web 保持原进程；再次启动复用五个 PID，服务日志无错误。
- 冷启动前普通活动任务、未知调用、启用定时和待处理模型批次均零，邮箱 queued/running 均零；169 条待核实学习记录不重放。没有代理自行提交真实问题或发信。
- Windows 登录任务安装和执行结果待登记；不将手动启动成功等同于已实际重启验证。
