import {z} from 'zod';
import {toolResultSchema} from './contracts';

// Describe actual read shapes before a program is generated. Preserve additional
// source metadata; these contracts neither resolve identities nor verify facts.
const salesId=z.string().describe('Sales candidate ID. Pass unchanged as company_read.candidateId or company_assessment_read.companyExternalId; never use a mailbox customer UUID instead.');
export const companySearchOutput=toolResultSchema.extend({data:z.looseObject({
  companies:z.array(z.looseObject({id:salesId,name:z.string(),domain:z.string().nullable(),countryCode:z.string()})),
  hasMore:z.boolean(),
  mailboxCustomers:z.looseObject({items:z.array(z.looseObject({id:z.string(),name:z.string(),domain:z.string().nullable(),country:z.string().nullable(),confirmed:z.boolean()})),hasMore:z.boolean()}),
  matching:z.looseObject({requiresSelection:z.boolean(),mailboxTimelineUnambiguous:z.boolean(),guidance:z.string()}),
}).nullable().optional()});

export const assessmentOutput=toolResultSchema.extend({data:z.object({assessment:z.looseObject({
  totalScore:z.number().nullable(),
  assessedAt:z.string().describe('Saved assessment timestamp, not the company record update timestamp.'),
  policyVersion:z.string().nullable(),
  evidence:z.unknown(),
}).nullable()}).nullable().optional()});

export const knowledgeSearchOutput=toolResultSchema.extend({data:z.array(z.looseObject({
  id:z.string().describe('Evidence chunk ID; not an asset or document ID.'),
  documentId:z.string(),title:z.string(),content:z.string(),
  sourceUrl:z.string().optional(),collection:z.enum(['industry','company','product']),
  metadata:z.looseObject({assetId:z.string().optional(),version:z.string().optional(),sourceLocation:z.unknown().optional()}),
})).nullable().optional()});

export const knowledgeFactsOutput=toolResultSchema.extend({data:z.array(z.looseObject({
  id:z.string(),attributeKey:z.string(),typedValue:z.unknown(),rawValue:z.string(),unit:z.string().nullable(),
  status:z.string(),polarity:z.string(),assetId:z.string(),documentVersion:z.string().nullable(),
  chunkId:z.string().optional(),releaseId:z.string().optional(),sourceLocation:z.unknown().optional(),
})).nullable().optional()});
