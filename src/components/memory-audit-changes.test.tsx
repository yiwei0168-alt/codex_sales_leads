import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryAuditChanges} from './memory-audit-changes';
const state={kind:'email-style',status:'active',usageScope:'internal-learning',marketCodes:[],channelRoles:['SI'],contentCharacters:12};
it('distinguishes insertion/deletion absence from explicit unrestricted scope',()=>{
 const created=renderToStaticMarkup(<MemoryAuditChanges operation="INSERT" changedFields={['INSERT']} before={null} after={state}/>);expect(created).toContain('新增前无记录');expect(created).toContain('未限定');expect(created).toContain('邮件风格');expect(created).toContain('12 字符');
 const deleted=renderToStaticMarkup(<MemoryAuditChanges operation="DELETE" changedFields={['DELETE']} before={state} after={null}/>);expect(deleted).toContain('删除后无记录');expect(deleted).not.toContain('新增前无记录');
});
it('makes authorization/lifecycle changes readable without copying unretained content',()=>{
 const html=renderToStaticMarkup(<MemoryAuditChanges operation="UPDATE" changedFields={['status','usage_scope','title','content']} before={state} after={{...state,status:'archived',usageScope:'external-use-approved',contentCharacters:12,content:'NOT A RETAINED AUDIT BODY',title:'NOT A RETAINED TITLE'}}/>);
 expect(html).toContain('停用');expect(html).toContain('已授权对外使用');expect(html).toContain('正文已修改');expect(html).toContain('字符数相同不代表正文相同');expect(html).toContain('标题已修改');expect(html).not.toContain('NOT A RETAINED');
});
it('does not invent defaults for missing, null or malformed stored values',()=>{
 const html=renderToStaticMarkup(<MemoryAuditChanges operation="UPDATE" changedFields={['status','market_codes','content']} before={{status:null}} after={{status:{raw:'DO NOT RENDER'},marketCodes:'GB',contentCharacters:-1}}/>);
 expect(html).toContain('未记录');expect(html).toContain('空值');expect(html).toContain('记录格式异常');expect(html).not.toContain('DO NOT RENDER');expect(html).not.toContain('未限定');
});
it('only displays changed recorded projections and escapes literal scope text',()=>{
 const unchanged=renderToStaticMarkup(<MemoryAuditChanges operation="UPDATE" changedFields={['context']} before={state} after={state}/>);expect(unchanged).toContain('没有可展示');expect(unchanged).not.toContain('<table');
 const changed=renderToStaticMarkup(<MemoryAuditChanges operation="UPDATE" changedFields={['channel_roles']} before={state} after={{...state,channelRoles:['<img src=x onerror=alert(1)>']}}/>);expect(changed).toContain('&lt;img');expect(changed).not.toContain('<img');expect(changed).not.toContain('邮件风格');
});
