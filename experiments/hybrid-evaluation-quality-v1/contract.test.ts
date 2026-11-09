import {expect,it} from 'vitest';
import {parseQuality} from './contract';
it('computes the original rubric and keeps hard gates independent of score',()=>{
 const row={reviewId:'one',facts:40,completeness:25,citations:20,scope:10,readability:5,hardGatePass:false,issues:['Invented evidence']};
 expect(parseQuality(JSON.stringify([row]),['one'])[0]).toMatchObject({total:100,passed:false});
 expect(parseQuality(JSON.stringify([{...row,facts:30,citations:15,hardGatePass:true}]),['one'])[0]).toMatchObject({total:85,passed:true});
 expect(()=>parseQuality(JSON.stringify([{...row,facts:41}]),['one'])).toThrow();
 expect(()=>parseQuality(JSON.stringify([row,row]),['one','two'])).toThrow();
});
