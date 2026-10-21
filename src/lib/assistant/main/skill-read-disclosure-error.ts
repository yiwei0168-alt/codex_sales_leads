export class SkillReadDisclosureError extends Error {
 constructor(){super('New private evidence requires explicit external disclosure authorization');}
}
export const SKILL_READ_DISCLOSURE_REPLY='新读取内容的外发边界未通过，评估已停止。已保存的请求与结果请先核对后再继续。';
