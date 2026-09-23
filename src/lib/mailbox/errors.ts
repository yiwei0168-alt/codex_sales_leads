interface ImapCommandError extends Error {
  responseStatus?: unknown;
  responseText?: unknown;
  executedCommand?: unknown;
}

function cleanServerText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 300) : undefined;
}

function commandName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const command = value.trim().split(/\s+/)[1]?.toUpperCase();
  return command && /^[A-Z]+$/.test(command) ? command : undefined;
}

export function mailboxConnectionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "邮箱连接失败";

  const imapError = error as ImapCommandError;
  const status = typeof imapError.responseStatus === "string"
    ? imapError.responseStatus.toUpperCase()
    : undefined;
  const responseText = cleanServerText(imapError.responseText);
  const command = commandName(imapError.executedCommand);

  if (error.name === "AuthenticationFailure" || command === "LOGIN" || command === "AUTHENTICATE") {
    return responseText
      ? `邮箱服务器拒绝登录：${responseText}`
      : "邮箱服务器拒绝登录，请检查 IMAP 权限、客户端专用密码和完整邮箱地址";
  }

  if (status || responseText || command) {
    const context = [command ? `命令 ${command}` : undefined, status].filter(Boolean).join(" / ");
    return `邮箱服务器拒绝 IMAP 请求${context ? `（${context}）` : ""}${responseText ? `：${responseText}` : ""}`;
  }

  return error.message || "邮箱连接失败";
}
