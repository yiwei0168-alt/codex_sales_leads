"use client";

import type { CompanyRecord, ChannelRole, CooperationPathType } from "@/lib/domain";
import type { CompanyEditablePatch } from "@/lib/sales/types";

const roles: ChannelRole[] = ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP", "Agent", "Brand Owner"];
const paths: Array<[CooperationPathType, string]> = [
  ["Direct Tier-1 Supply", "一级代理商直接供货"],
  ["Distributor-Mediated Supply", "通过已有或未来代理商供货"],
  ["Direct Downstream Channel Supply", "直接向下级渠道客户供货"],
  ["OEM/ODM", "OEM/ODM"], ["Other", "其他模式"],
];

export function CompanyClassificationEditor({ company, onUpdate }: {
  company: CompanyRecord; onUpdate: (patch: CompanyEditablePatch) => void;
}) {
  return <section className="drawer-section">
    <h3>角色与合作路径</h3>
    <div className="edit-grid">
      <label>主角色<select aria-label="修改主角色" value={company.primaryBusinessRole ?? ""}
        onChange={(event) => onUpdate({ primaryBusinessRole: event.target.value as ChannelRole })}>
        <option value="" disabled>请选择</option>
        {company.primaryBusinessRole === "Hybrid" || company.primaryBusinessRole === "Unresolved" ? <option disabled value={company.primaryBusinessRole}>待明确</option> : null}
        {roles.map((role) => <option key={role}>{role}</option>)}
      </select></label>
      <label>合作路径<select aria-label="修改合作路径" value={company.selectedCooperationPath ?? ""}
        onChange={(event) => onUpdate({ selectedCooperationPath: event.target.value as CooperationPathType })}>
        <option value="" disabled>未分析</option>
        {paths.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </div>
    {company.assessmentNeedsRefresh && <p role="status">主角色已修改，当前评分待更新。旧分数仅供历史参考。</p>}
    <small>修改仅适用于此公司，保存到个人记忆与修改历史；不会自动重跑评分。</small>
  </section>;
}
